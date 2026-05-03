"""LLM-powered entity and relation extraction from PDF text for component knowledge graph."""
import json
from app.core.llm_service import llm_service


ENTITY_EXTRACTION_PROMPT = """You are an electrical component cataloger. From the following technical document text, extract all electrical/automation components mentioned.

For each component, return:
- name: exact model name/number (e.g. "SITOP PSU100C", "SM 1231 AI 8x13bit")
- component_type: one of [Sensor, PLC_CPU, PLC_DI, PLC_DO, PLC_AI, PLC_AO, Power_Supply, Circuit_Breaker, Contactor, Thermal_Overload, VFD, Safety_Relay, Terminal_Block, Actuator, Communication_Module, HMI, Motor, Other]
- properties: all technical specs found (rated_voltage, rated_current, power, output_signal, input_signal, protocol, resolution, channels, mounting, dimensions, etc.)

Output valid JSON array only, no markdown wrapping. Example:
[{"name": "SITOP PSU100C", "component_type": "Power_Supply", "properties": {"output_voltage": "24VDC", "rated_current": "2.5A", "power": "60W"}}]

Text:
{text}"""


RELATION_EXTRACTION_PROMPT = """You are an electrical engineering relationships analyst. Given a list of components extracted from a technical document, identify how they connect electrically.

Valid relation types:
- REQUIRES_POWER: component needs power supply (specify voltage)
- OUTPUTS_SIGNAL: sensor/meter outputs a signal to an input module (specify signal type: 4-20mA, 0-10V, etc.)
- USES_PROTOCOL: device communicates via a protocol (specify protocol: PROFINET, PROFIBUS, Modbus, etc.)
- COMPATIBLE_WITH: components are verified compatible together
- ALTERNATIVE_TO: one model can replace another
- MOUNTS_ON: component mounts on rail/panel (specify: DIN35, panel, etc.)
- CONTROLS: output module controls an actuator (specify: contactor coil, valve, etc.)

For each relationship, return:
- source: exact component name (must match one from the list below)
- target: exact component name (must match one from the list below)
- relation: one of the types above
- properties: relevant specs (voltage, signal_type, protocol, etc.)

Components:
{components_json}

Output valid JSON array only, no markdown wrapping."""


class EntityExtractor:
    async def extract_entities(self, text: str) -> list[dict]:
        chunk_size = 3000
        chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]
        all_entities = []
        seen_names = set()

        for chunk in chunks[:5]:
            prompt = ENTITY_EXTRACTION_PROMPT.format(text=chunk)
            raw = await llm_service.chat("You extract electrical components as JSON.", prompt)
            raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
            try:
                entities = json.loads(raw)
                for e in entities:
                    name = e.get("name", "")
                    if name and name not in seen_names:
                        seen_names.add(name)
                        all_entities.append(e)
            except json.JSONDecodeError:
                continue

        return all_entities

    async def extract_relations(self, entities: list[dict], context_text: str) -> list[dict]:
        components_json = json.dumps(entities, ensure_ascii=False, indent=2)
        prompt = RELATION_EXTRACTION_PROMPT.format(components_json=components_json)
        raw = await llm_service.chat("You extract electrical component relationships as JSON.", prompt)
        raw = raw.strip().removeprefix("```json").removesuffix("```").strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return []


entity_extractor = EntityExtractor()
