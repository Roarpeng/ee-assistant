"""Deterministic EPlan XML generation and structural validation.

The LLM path (`llm_service.generate_eplan_xml`) can produce malformed
or truncated XML for large BOMs. This module provides:

- `build_eplan_xml_deterministic(...)`: pure-Python serialization from
  the validated BOM + wiring table. Always well-formed (built with
  ElementTree), never truncated, no LLM dependency.
- `validate_eplan_xml(...)`: structural validation of any
  `EplanToXmlSchema` document (LLM- or deterministically-generated).

Schema contract (custom, see docs/LANGGRAPH_FLOW.md):

    <EplanToXmlSchema>
      <Project Name="...">
        <Parts><Part ID Type Manufacturer OrderNumber DT/></Parts>
        <Connections><Connection SourcePartID SourceTerminal
            TargetPartID TargetTerminal Protocol WireCrossSection
            WireColor/></Connections>
      </Project>
    </EplanToXmlSchema>
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

ROOT_TAG = "EplanToXmlSchema"

# IEC 81346-style device-tag prefixes per BOM category. Defensive:
# categories arrive as functional labels ("control_system") or KG
# canonical names ("PLC_CPU"), so we match on normalized substrings.
_TAG_PREFIX_RULES: list[tuple[tuple[str, ...], str]] = [
    (("PLC_CPU", "SAFETY_PLC", "PLC", "CONTROL_SYSTEM", "IPC"), "-A"),
    (("POWER_SUPPLY", "POWER_DISTRIBUTION", "POWER"), "-U"),
    (("CIRCUIT_BREAKER", "DISCONNECT", "BREAKER"), "-Q"),
    (("FUSE",), "-F"),
    (("TRANSFORMER",), "-T"),
    (("CONTACTOR", "RELAY", "SAFETY_RELAY", "MOTOR_CONTROL"), "-K"),
    (("VFD", "SERVO", "DRIVE"), "-U"),
    (("MOTOR",), "-M"),
    (("SENSOR", "SENSING"), "-B"),
    (("ESTOP", "SAFETY_DOOR", "EMERGENCY", "SAFETY_SYSTEM", "SWITCH", "BUTTON"), "-S"),
    (("SIGNAL_LIGHT", "INDICATOR_LIGHT", "LIGHT"), "-H"),
    (("HMI",), "-G"),
    (("IO", "IO_MODULE"), "-A"),
    (("SWITCH_NETWORK", "NETWORK_SWITCH", "ETHERNET"), "-N"),
]


def _tag_prefix(category: str) -> str:
    key = (category or "").upper().replace(" ", "_")
    for needles, prefix in _TAG_PREFIX_RULES:
        if any(n in key for n in needles):
            return prefix
    return "-Z"


def _wire_parts(wire: str) -> tuple[str, str]:
    """Split a wiring spec like '0.75 mm² 黑' into (cross_section, color)."""
    text = (wire or "").strip()
    cross = ""
    color = ""
    m = re.match(r"([\d.]+)\s*mm²?", text)
    if m:
        cross = f"{m.group(1)} mm²"
    tokens = text.split()
    if tokens:
        color = tokens[-1] if not tokens[-1].startswith("mm") else ""
    return cross, color


def build_eplan_xml_deterministic(
    bom: list[dict],
    wiring_rows: list[dict] | None = None,
    requirement: dict | None = None,
) -> str:
    """Serialize the EPlan XML deterministically from BOM + wiring.

    - One <Part> per BOM item with an IEC-style device tag (-Q1, -K2...).
    - One <Connection> per wiring row; terminal-block part -X1 is added
      automatically when wiring rows reference X1.* sources.
    - Empty inputs still yield a valid, schema-conformant document.
    """
    requirement = requirement or {}
    wiring_rows = wiring_rows or []

    project_name = (
        requirement.get("project_name")
        or requirement.get("machine_type")
        or "EE_Assistant_Project"
    )

    root = ET.Element(ROOT_TAG)
    project = ET.SubElement(root, "Project", {"Name": str(project_name)})
    parts_el = ET.SubElement(project, "Parts")
    connections_el = ET.SubElement(project, "Connections")

    # ── Parts: stable device tags with per-prefix counters ──
    counters: dict[str, int] = {}
    part_ids: list[str] = []
    plc_part_id: str | None = None

    for item in bom or []:
        category = str(item.get("category") or "OTHER")
        prefix = _tag_prefix(category)
        counters[prefix] = counters.get(prefix, 0) + 1
        part_id = f"{prefix}{counters[prefix]}"
        part_ids.append(part_id)
        if plc_part_id is None and prefix == "-A" and (
            "PLC" in category.upper() or "CONTROL" in category.upper()
        ):
            plc_part_id = part_id
        ET.SubElement(parts_el, "Part", {
            "ID": part_id,
            "Type": category,
            "Manufacturer": str(item.get("manufacturer") or ""),
            "OrderNumber": str(item.get("order_number") or item.get("model") or ""),
            "DT": f"=PANEL+{part_id.lstrip('-')}",
        })

    # ── Connections: derived from the deterministic wiring table ──
    if wiring_rows:
        # Terminal block part for X1.* sources.
        if "-X1" not in part_ids:
            ET.SubElement(parts_el, "Part", {
                "ID": "-X1", "Type": "TERMINAL_BLOCK",
                "Manufacturer": "", "OrderNumber": "", "DT": "=PANEL+X1",
            })
        target_id = plc_part_id or (part_ids[0] if part_ids else "-A1")

        for row in wiring_rows:
            src = str(row.get("from") or "")
            src_terminal = src.split(".", 1)[1] if "." in src else src
            cross, color = _wire_parts(str(row.get("wire") or ""))
            ET.SubElement(connections_el, "Connection", {
                "SourcePartID": "-X1",
                "SourceTerminal": src_terminal,
                "TargetPartID": target_id,
                "TargetTerminal": str(row.get("tag") or "").removeprefix("PLC."),
                "Protocol": "SIGNAL",
                "WireCrossSection": cross,
                "WireColor": color,
            })

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    return '<?xml version="1.0" encoding="utf-8"?>\n' + body + "\n"


def validate_eplan_xml(xml_text: str) -> tuple[bool, str]:
    """Structurally validate an EplanToXmlSchema document.

    Returns (ok, reason). Checks: well-formed XML, correct root tag,
    Project child present, every Part has non-empty ID+Type, every
    Connection has non-empty SourcePartID+TargetPartID.
    """
    if not xml_text or not xml_text.strip():
        return False, "empty document"
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        return False, f"XML parse error: {e}"

    if root.tag != ROOT_TAG:
        return False, f"root tag must be {ROOT_TAG}, got {root.tag}"
    project = root.find("Project")
    if project is None:
        return False, "missing <Project> element"

    for i, part in enumerate(project.iter("Part")):
        if not (part.get("ID") or "").strip():
            return False, f"Part #{i + 1} missing ID"
        if not (part.get("Type") or "").strip():
            return False, f"Part #{i + 1} missing Type"

    for i, conn in enumerate(project.iter("Connection")):
        if not (conn.get("SourcePartID") or "").strip():
            return False, f"Connection #{i + 1} missing SourcePartID"
        if not (conn.get("TargetPartID") or "").strip():
            return False, f"Connection #{i + 1} missing TargetPartID"

    return True, "ok"
