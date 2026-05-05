from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from app.config import settings


class LLMService:
    def __init__(self):
        self._chat_config: dict | None = None
        self._embed_config: dict | None = None
        # Default OpenAI-compatible client (uses settings from .env)
        if settings.chat_api_key:
            self._default_openai = AsyncOpenAI(
                api_key=settings.chat_api_key,
                base_url=settings.chat_base_url,
            )
        else:
            self._default_openai = None
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
        """Return appropriate chat client based on config."""
        cfg = self._chat_config
        if cfg and cfg.get("api_key") and cfg.get("base_url"):
            base = cfg["base_url"].rstrip("/")
            if self._is_openai_compat(base):
                return AsyncOpenAI(api_key=cfg["api_key"], base_url=base)
            else:
                return AsyncAnthropic(api_key=cfg["api_key"])
        # Fallback to env-configured OpenAI-compatible (DeepSeek etc.)
        if self._default_openai:
            return self._default_openai
        if settings.anthropic_api_key:
            return self._anthropic
        return self._anthropic

    def _get_chat_model(self) -> str:
        cfg = self._chat_config
        if cfg and cfg.get("model"):
            return cfg["model"]
        return settings.chat_model

    async def chat(self, system_prompt: str, user_message: str, max_tokens: int | None = None) -> str:
        client = self._get_chat_client()
        model = self._get_chat_model()
        tokens = max_tokens or settings.llm_max_tokens

        if isinstance(client, AsyncOpenAI):
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]
            kwargs = dict(model=model, messages=messages, max_tokens=tokens)
            response = await client.chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        else:
            kwargs = dict(
                model=model,
                max_tokens=tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            response = await client.messages.create(**kwargs)
            return response.content[0].text

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
generate a Mermaid flowchart showing the electrical system block diagram.
Include: power infeed -> main switch -> distribution -> functional blocks (motor control, safety, IO, comms).
Use graph TD syntax. Output Mermaid code only, no markdown wrapping."""

        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=2048)
        return text.strip().removeprefix("```mermaid").removesuffix("```").strip()

    async def generate_topology_json(self, bom: list, requirement: dict) -> dict:
        system = """You are a highly precise industrial automation topology architect.
Convert a Bill of Materials (BOM) into a structured ReactFlow JSON with strict 5-level hierarchy.

INDUSTRIAL HIERARCHY (Mandatory):
  L0 (y=60):  Power — AC Infeed, Power Supply, Transformer
  L1 (y=160): Protection — Circuit Breaker, Fuse, Disconnect, E-Stop, Safety Relay
  L2 (y=300): Control — PLC CPU, Safety PLC, IPC, HMI, Network Switch
  L3 (y=460): Execution — VFD, Servo Drive, Contactor, Relay, IO Module
  L4 (y=600): Feedback — Sensor, Encoder

NODE TYPES: [plc, safety_plc, hmi, ipc, io, vfd, servo, power, switch, circuit_breaker, contactor, relay, estop, sensor, safety_relay, fuse, disconnect, transformer]
PROTOCOLS: [PROFINET, ETHERCAT, POWER_24V, POWER_220V, SAFETY_CIRCUIT, ETHERNET, SIGNAL]

BUS-STYLE EDGES (critical — avoid duplicate edges):
- Power flows L0→L1 via POWER_220V
- 24VDC flows L1→L2 via POWER_24V
- Control signals flow L2→L3 via PROFINET (default) or ETHERCAT (if servo present)
- Safety circuit: E-Stop → Safety Relay → Safety PLC via SAFETY_CIRCUIT
- HMI connects to PLC only via ETHERNET
- Sensors feed back to nearest controller L4→L3 via SIGNAL
- Each pair of nodes should have AT MOST ONE edge
- Group nodes by level, distribute x evenly (spacing ~220)

Horizontal layout: within each level, distribute nodes with x = 120 + (position * 220).
Return ONLY valid raw JSON. No markdown, no explanations."""
        import json
        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=2048) # Higher tokens for complex topologies
        try:
            return self._parse_json(text)
        except Exception as e:
            print(f"Topology JSON Parse Error: {e}\nRaw Text: {text[:500]}")
            return {"nodes": [], "edges": []}

    async def generate_st_code(self, requirement: dict, bom: list) -> list[dict]:
        import json
        system = """You are a Siemens TIA Portal ST (Structured Text) programmer.
Given requirements and BOM, generate ST code modules.
Output a JSON array of {name, module_type:OB/FC/FB/DB, code, sort_order}.
For safety logic (E-Stop, safety door, interlocks): write COMPLETE code.
For regular control logic: write framework with TODO comments.
IO addresses: use %I0.x for DI, %Q0.x for DO, %IW64 for AI, %QW64 for AO.
Output valid JSON only, no markdown wrapping."""

        user = f"Requirements: {json.dumps(requirement, ensure_ascii=False)}\nBOM: {json.dumps(bom, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=8192)
        try:
            return self._parse_json(text)
        except ValueError:
            text = await self.chat(system, user + "\n\nOutput ONLY a valid JSON array. Close all brackets.", max_tokens=8192)
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
