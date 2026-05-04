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
        system = """You are an electrical engineering requirements analyst for industrial automation (Siemens PLC).
Analyze the user's description and extract structured requirements as JSON.
Include: machine_type, safety_level (SIL1/SIL2/SIL3), environment (indoor/outdoor/explosive),
io_list (array of {tag, type:DI/DO/AI/AO, description}), control_logic (array of strings),
plc_family (S7-1200/S7-1500). Output valid JSON only, no markdown wrapping."""

        text = await self.chat(system, user_input, max_tokens=4096)
        try:
            return self._parse_json(text)
        except ValueError:
            text = await self.chat(system, user_input + "\n\nIMPORTANT: Output ONLY valid JSON. Ensure all strings are properly closed.", max_tokens=4096)
            return self._parse_json(text)

    async def map_categories(self, io_items: list, logic_rules: list) -> list[str]:
        system = """Map the given IO list and control logic to required component categories.
Categories: PLC_CPU, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload,
VFD, Safety_Relay, Terminal_Block, Sensor, Actuator, Communication_Module.
Return JSON array of strings. Output valid JSON only, no markdown wrapping."""

        user = f"IO: {io_items}\nLogic: {logic_rules}"
        text = await self.chat(system, user, max_tokens=1024)
        try:
            return self._parse_json(text)
        except ValueError:
            text = await self.chat(system, user + "\n\nOutput ONLY a JSON array of strings.", max_tokens=1024)
            return self._parse_json(text)

    async def generate_schematic_mermaid(self, bom: list, requirement: dict) -> str:
        import json
        system = """You are an electrical schematic designer. Given a BOM and requirements,
generate a Mermaid flowchart showing the electrical system block diagram.
Include: power infeed -> main switch -> distribution -> functional blocks (motor control, safety, IO, comms).
Use graph TD syntax. Output Mermaid code only, no markdown wrapping."""

        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        text = await self.chat(system, user, max_tokens=2048)
        return text.strip().removeprefix("```mermaid").removesuffix("```").strip()

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


llm_service = LLMService()
