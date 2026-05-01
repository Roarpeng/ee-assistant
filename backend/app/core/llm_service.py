from anthropic import AsyncAnthropic
from app.config import settings


class LLMService:
    def __init__(self):
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def chat(self, system_prompt: str, user_message: str, response_format: dict | None = None) -> str:
        kwargs = dict(
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def analyze_requirements(self, user_input: str) -> dict:
        import json
        system = """You are an electrical engineering requirements analyst for industrial automation (Siemens PLC).
Analyze the user's description and extract structured requirements as JSON.
Include: machine_type, safety_level (SIL1/SIL2/SIL3), environment (indoor/outdoor/explosive),
io_list (array of {tag, type:DI/DO/AI/AO, description}), control_logic (array of strings),
plc_family (S7-1200/S7-1500). Output valid JSON only, no markdown wrapping."""

        text = await self.chat(system, user_input)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)

    async def map_categories(self, io_items: list, logic_rules: list) -> list[str]:
        import json
        system = """Map the given IO list and control logic to required component categories.
Categories: PLC_CPU, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload,
VFD, Safety_Relay, Terminal_Block, Sensor, Actuator, Communication_Module.
Return JSON array of strings. Output valid JSON only, no markdown wrapping."""

        user = f"IO: {io_items}\nLogic: {logic_rules}"
        text = await self.chat(system, user)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)

    async def generate_schematic_mermaid(self, bom: list, requirement: dict) -> str:
        import json
        system = """You are an electrical schematic designer. Given a BOM and requirements,
generate a Mermaid flowchart showing the electrical system block diagram.
Include: power infeed -> main switch -> distribution -> functional blocks (motor control, safety, IO, comms).
Use graph TD syntax. Output Mermaid code only, no markdown wrapping."""

        user = f"BOM: {json.dumps(bom, ensure_ascii=False)}\nRequirements: {json.dumps(requirement, ensure_ascii=False)}"
        text = await self.chat(system, user)
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
        text = await self.chat(system, user)
        text = text.strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(text)


llm_service = LLMService()
