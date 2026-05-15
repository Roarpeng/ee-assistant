import asyncio
import traceback
import httpx
from openai import AsyncOpenAI, APIConnectionError, APITimeoutError, RateLimitError, InternalServerError
from anthropic import AsyncAnthropic
from app.config import settings


# Stream 模式下 read timeout 是 *相邻 chunk 之间* 的最大间隔,不是整个响应总时长。
# DeepSeek-R1 推理模型可能在生成第一个 token 前思考较久,故放宽到 180s。
def _build_httpx_client() -> httpx.AsyncClient:
    """构造给 LLM 调用专用的 httpx 客户端。

    - timeout: connect=30s / read=180s / write=30s / pool=30s
      stream 模式下 read 是相邻 chunk 间隔,180s 足以覆盖推理模型首 token 等待。
    - max_keepalive_connections=0: 每次请求新建 TCP, 避免 cntlm/SiliconFlow 网关
      回收 idle 连接导致的 RemoteProtocolError / Connection error。
    - trust_env=True: 自动读 HTTP_PROXY / HTTPS_PROXY / NO_PROXY 环境变量。
    """
    timeout = httpx.Timeout(connect=30.0, read=180.0, write=30.0, pool=30.0)
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=0)
    return httpx.AsyncClient(timeout=timeout, limits=limits, trust_env=True)


# 网络层 / LLM 端临时故障 — 可安全重试
_RETRIABLE_EXC = (
    APIConnectionError,           # openai SDK: 连接错误 ("Connection error.")
    APITimeoutError,              # openai SDK: 请求超时
    InternalServerError,          # 5xx (含 504 / 503, 官方建议重试)
    RateLimitError,               # 429
    httpx.RemoteProtocolError,    # 服务端提前关闭连接
    httpx.ReadTimeout,
    httpx.ConnectTimeout,
    httpx.ConnectError,
    httpx.ReadError,
)


class LLMService:
    # 外层重试: 每次重试都新建 client (新 TCP),避开代理路径上的 stale connection。
    # SDK 内部 max_retries=2 仍保留为第二道防线 (复用同一 client)。
    _max_retries: int = 3

    def __init__(self):
        self._chat_config: dict | None = None
        self._embed_config: dict | None = None
        self._anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)

    def configure(self, chat_config: dict | None = None, embed_config: dict | None = None):
        """Accept runtime LLM config from frontend. Falls back to env vars if None/empty."""
        self._chat_config = chat_config
        self._embed_config = embed_config

    def _is_openai_compat(self, base_url: str) -> bool:
        """Detect if base_url is OpenAI-compatible (not Anthropic)."""
        if not base_url:
            return False
        return "anthropic" not in base_url.lower()

    def _get_chat_client(self):
        """Return appropriate chat client based on config. New client each call.

        OpenAI SDK max_retries=2 让 SDK 内部对临时性错误自动重试一次 (用同一 client),
        我们外层 _max_retries 再用新 client 兜底,两道防线提升可用性。
        """
        cfg = self._chat_config
        if cfg and cfg.get("api_key") and cfg.get("base_url"):
            base = cfg["base_url"].rstrip("/")
            if self._is_openai_compat(base):
                return AsyncOpenAI(
                    api_key=cfg["api_key"],
                    base_url=base,
                    http_client=_build_httpx_client(),
                    max_retries=2,
                )
            else:
                return AsyncAnthropic(api_key=cfg["api_key"])
        if settings.effective_chat_api_key():
            return AsyncOpenAI(
                api_key=settings.effective_chat_api_key(),
                base_url=settings.effective_chat_base_url() or None,
                http_client=_build_httpx_client(),
                max_retries=2,
            )
        return self._anthropic

    def _get_chat_model(self) -> str:
        cfg = self._chat_config
        if cfg and cfg.get("model"):
            return cfg["model"]
        return settings.effective_chat_model()

    @staticmethod
    async def _close_client_quietly(client) -> None:
        close = getattr(client, "close", None)
        if close:
            try:
                await close()
            except Exception:
                pass

    async def _openai_stream_chat(
        self,
        client: AsyncOpenAI,
        model: str,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
    ) -> str:
        """Stream completion and aggregate to a single string.

        SiliconFlow 官方文档明确推荐: 长输出务必使用 stream=True 以避免 504 与
        企业代理的 idle-connection 回收。stream 模式下持续有 chunk 流过, httpx
        的 read timeout 在两个 chunk 之间重新计时, cntlm 等代理也不会回收连接。
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            stream=True,
        )
        parts: list[str] = []
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta is None:
                continue
            piece = getattr(delta, "content", None)
            if piece:
                parts.append(piece)
        return "".join(parts)

    async def chat(self, system_prompt: str, user_message: str, max_tokens: int | None = None) -> str:
        """Robust chat with stream-aggregation + exponential backoff retries.

        Returns the full assistant response as a single string. Internally uses
        SSE streaming to keep the proxy path (cntlm) and LLM gateway connection
        active, then aggregates chunks for callers that expect a complete reply.
        """
        tokens = max_tokens or settings.llm_max_tokens
        last_err: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            client = self._get_chat_client()
            model = self._get_chat_model()
            try:
                if isinstance(client, AsyncOpenAI):
                    return await self._openai_stream_chat(
                        client, model, system_prompt, user_message, tokens
                    )
                response = await client.messages.create(
                    model=model,
                    max_tokens=tokens,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                return response.content[0].text
            except _RETRIABLE_EXC as e:
                last_err = e
                if attempt >= self._max_retries:
                    print(
                        f"[llm_service.chat] all {self._max_retries} attempts failed: {e!r}",
                        flush=True,
                    )
                    break
                wait_s = min(2 ** (attempt - 1), 8)
                print(
                    f"[llm_service.chat] attempt {attempt}/{self._max_retries} "
                    f"failed ({type(e).__name__}: {e}); retrying in {wait_s}s",
                    flush=True,
                )
                await asyncio.sleep(wait_s)
            except Exception as e:
                # 非可重试异常 (鉴权失败 / 模型不存在 / JSON 解析等) — 立即抛出
                print(f"[llm_service.chat] non-retriable error: {e!r}", flush=True)
                traceback.print_exc()
                raise
            finally:
                await self._close_client_quietly(client)

        assert last_err is not None
        raise last_err

    def _parse_json(self, text: str):
        """Parse JSON from LLM output with error recovery."""
        import json

        text = text.strip()
        # Remove markdown code fences
        for fence in ("```json", "```"):
            text = text.removeprefix(fence).removesuffix(fence).strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to recover: find the outermost { or [ and matching close
            pass

        # Find first { or [
        for start_char, end_char in (("{", "}"), ("[", "]")):
            idx = text.find(start_char)
            if idx < 0:
                continue
            # Walk from idx to find matching close
            depth = 0
            for i in range(idx, len(text)):
                if text[i] == start_char:
                    depth += 1
                elif text[i] == end_char:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[idx : i + 1])
                        except json.JSONDecodeError:
                            break
        raise ValueError(f"Failed to parse JSON: {text[:200]}...")

    async def analyze_requirements(self, user_input: str) -> dict:
        system = """You are an electrical engineering requirements analyst for industrial automation.
Deeply analyze the user's description from a MECHANICAL EXECUTION perspective.

KEY PRINCIPLE: Every motion system requires specific electrical components driven by its mechanical structure:

- **Servo Slide / Linear Axis** (伺服滑台/线性模组):
  Motion: Servo motor + ball screw or linear motor → REQUIRES: PLC_CPU (motion control), Servo_Drive, HMI (parameter setting), Power_Supply (24VDC for control, 220VAC/380VAC for drive), 2-3 Sensors (limit/home/position feedback), Circuit_Breaker, Contactor or Safety_Relay (if E-Stop present).

- **Conveyor Belt** (传送带):
  Motion: Induction motor + gearbox → REQUIRES: PLC_CPU, VFD (variable speed), Contactor + Thermal_Overload, 2 Sensors (speed/proximity), Safety_Relay (if E-Stop), Power_Supply, Circuit_Breaker.

- **Robot Arm / Manipulator** (机械臂):
  Motion: Multi-axis servo → REQUIRES: PLC_CPU or Robot_Controller, Servo_Drive (per axis), Safety_PLC (collaborative), HMI, Power_Supply, EtherCAT network, Safety_Relay, Sensors (torque/position).

- **CNC / Machining**:
  Motion: Spindle + feed axes → REQUIRES: PLC_CPU, multiple Servo_Drives or VFDs, HMI, Power_Supply, Sensors (tool/position/coolant), E-Stop + Safety_Relay.

- **Hydraulic / Pneumatic Press**:
  Actuation: Solenoid valves + cylinders → REQUIRES: PLC_CPU, IO_Module (DI/DO for valves, AI for pressure), Power_Supply, Circuit_Breaker, Safety_Relay.

Output structured JSON:
{
  "machine_type": "precise mechanical description (e.g., 'Servo-driven linear slide table with ball screw')",
  "safety_level": "SIL1/SIL2/SIL3",
  "environment": "indoor/outdoor/explosive",
  "plc_family": "S7-1200 or S7-1500 based on motion complexity (S7-1200 for simple, S7-1500 for multi-axis or high-speed)",
  "io_list": [
    {"tag": "string", "type": "DI/DO/AI/AO", "description": "functional description"}
  ],
  "control_logic": [
    "detailed control sequence including motion profile, homing, alarm handling"
  ]
}

IMPORTANT:
- For servo systems, ALWAYS include home sensor (DI), limit sensors (DI), servo enable (DO), and alarm reset (DO).
- For any system with E-Stop, ALWAYS include safety relay monitoring (DI) and contactor control (DO).
- S7-1200 for ≤3 axes, S7-1500 for >3 axes or high-speed coordinated motion.
- ALWAYS include a Power_Supply 24VDC requirement in the io_list implications.
Output valid JSON only, no markdown wrapping."""

        for attempt in range(2):
            try:
                prompt = user_input + ("\n\nIMPORTANT: Output ONLY valid JSON. Ensure all strings are properly closed." if attempt > 0 else "")
                text = await self.chat(system, prompt, max_tokens=4096)
                return self._parse_json(text)
            except Exception as e:
                print(f"analyze_requirements attempt {attempt+1} failed: {e}")
        return {"machine_type": None, "safety_level": None, "environment": None, "plc_family": None, "io_list": [], "control_logic": []}

    async def map_categories(self, io_items: list, logic_rules: list) -> list[str]:
        system = """Map the given IO list and control logic to required component categories.
Categories: PLC_CPU, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload,
VFD, Safety_Relay, Terminal_Block, Sensor, Actuator, Communication_Module.
Return JSON array of strings. Output valid JSON only, no markdown wrapping."""

        user = f"IO: {io_items}\nLogic: {logic_rules}"
        for attempt in range(2):
            try:
                text = await self.chat(system, user + ("\n\nOutput ONLY a JSON array of strings." if attempt > 0 else ""), max_tokens=1024)
                return self._parse_json(text)
            except Exception as e:
                print(f"map_categories attempt {attempt+1} failed: {e}")
        return []  # graceful degradation — downstream nodes will handle empty categories

    async def generate_schematic_mermaid(self, bom: list, requirement: dict) -> str:
        import json
        system = """You are an electrical schematic designer. Given a BOM and requirements,
generate a concise Mermaid flowchart of the electrical system block diagram.
Include: power infeed -> main switch -> distribution -> functional blocks (motor control, safety, IO).
Keep the diagram compact: 8-15 nodes max. Use graph TD syntax. Output Mermaid code only,
no markdown wrapping, no explanation."""

        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        # 1024 tokens is enough for a 8-15 node mermaid graph; speeds up node ~2x.
        text = await self.chat(system, user, max_tokens=1024)
        return text.strip().removeprefix("```mermaid").removesuffix("```").strip()

    async def generate_topology_json(self, bom: list, requirement: dict) -> dict:
        # CRITICAL: emit FLAT nodes/edges (id, type, label, x, y at top level;
        # protocol on edges at top level). Frontend yjsStore reads these fields
        # directly — wrapping them in {position}/{data} would make the canvas
        # render every node at (0,0) with no labels and no draggability.
        system = """You are a precise industrial automation topology architect.
Convert a Bill of Materials (BOM) into a 5-level industrial hierarchy.

INDUSTRIAL HIERARCHY (Mandatory):
  L0 (y=60):  Power — power, transformer
  L1 (y=160): Protection — circuit_breaker, fuse, disconnect, estop, safety_relay
  L2 (y=300): Control — plc, safety_plc, ipc, hmi, switch
  L3 (y=460): Execution — vfd, servo, contactor, relay, io
  L4 (y=600): Feedback — sensor

NODE TYPES (lowercase, exact): plc, safety_plc, hmi, ipc, io, vfd, servo,
  power, switch, circuit_breaker, contactor, relay, estop, sensor,
  safety_relay, fuse, disconnect, transformer

PROTOCOLS: PROFINET, ETHERCAT, POWER_24V, POWER_220V, SAFETY_CIRCUIT, ETHERNET, SIGNAL

EDGE RULES (avoid duplicates):
- L0→L1 POWER_220V; L1→L2 POWER_24V; L2→L3 PROFINET (or ETHERCAT if servo present)
- Safety: estop → safety_relay → safety_plc via SAFETY_CIRCUIT
- hmi ↔ plc only via ETHERNET
- L4 sensors feed L3 via SIGNAL
- ≤ 1 edge between any pair

LAYOUT: within each level distribute x = 120 + (slot_index * 220).

OUTPUT — STRICT FLAT JSON, no markdown, no comments:
{
  "nodes": [
    {"id":"plc1","type":"plc","label":"Siemens S7-1200","x":120,"y":300}
  ],
  "edges": [
    {"id":"e1","source":"cb1","target":"plc1","protocol":"POWER_24V"}
  ]
}

label MUST be ≤ 40 chars (manufacturer + model recommended).
Do NOT wrap in {position} or {data}; put x/y/label/protocol directly at top level."""
        import json
        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        # 1536 is plenty for a flat topology JSON of ~12 nodes + ~15 edges.
        text = await self.chat(system, user, max_tokens=1536)
        try:
            return self._parse_json(text)
        except Exception as e:
            print(f"Topology JSON Parse Error: {e}\nRaw Text: {text[:500]}")
            return {"nodes": [], "edges": []}

    async def generate_st_code(self, requirement: dict, bom: list) -> list[dict]:
        import json
        # Output is intentionally lean: a Main_OB1 + Safety_FC + IO_DB is enough to
        # bootstrap a TIA Portal project. 4096 tokens cuts code_generator wall-time
        # by ~50% vs 8192 while still producing complete safety FC code.
        system = """You are a Siemens TIA Portal ST (Structured Text) programmer.
Given requirements and BOM, generate 3-5 ST code modules.
Output a JSON array of {name, module_type:OB/FC/FB/DB, code, sort_order}.
For safety logic (E-Stop, safety door, interlocks): write COMPLETE code.
For regular control logic: write a compact framework with TODO comments — keep
each module under ~60 lines.
IO addresses: %I0.x DI, %Q0.x DO, %IW64 AI, %QW64 AO.
Output valid JSON only, no markdown wrapping."""

        user = f"Requirements: {json.dumps(requirement, ensure_ascii=False)}\nBOM: {json.dumps(bom, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=4096)
        try:
            return self._parse_json(text)
        except ValueError:
            text = await self.chat(
                system,
                user + "\n\nOutput ONLY a valid JSON array. Close all brackets.",
                max_tokens=4096,
            )
            return self._parse_json(text)

    async def recommend_components(self, categories: list[str], machine_type: str = "") -> list[dict]:
        """LLM-based component recommendation when RAG knowledge base has no matches."""
        import json
        system = f"""You are an industrial automation component selection expert.
The knowledge base has NO matching components for these categories: {json.dumps(categories)}.
Machine type context: {machine_type or 'general industrial automation'}.

Recommend suitable real-world components for each category. For each component provide:
- category: the category name
- manufacturer: real manufacturer (Siemens, ABB, Schneider, Mitsubishi, Omron, etc.)
- model: specific model number if possible
- quantity: 1
- specifications: relevant specs as a dict (e.g. {{"rated_current": "10A", "voltage": "24VDC"}})
- note: mention this is an LLM recommendation, not from the knowledge base

Output a JSON array of component objects. Output valid JSON only, no markdown wrapping."""
        user = f"Categories needing components: {json.dumps(categories, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=2048)
        try:
            return self._parse_json(text)
        except Exception:
            # Last-resort fallback
            return [{
                "category": cat,
                "manufacturer": "Check catalog",
                "model": f"Suitable {cat.lower()} component",
                "quantity": 1,
                "specifications": {},
                "note": "LLM recommendation — please verify against manufacturer catalog"
            } for cat in categories]


llm_service = LLMService()
