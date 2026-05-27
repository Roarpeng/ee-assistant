"""Normalization helpers for component and protocol names."""

from __future__ import annotations

import re

from app.core.component_taxonomy import COMPONENT_TYPES, PROTOCOL_TYPES

_COMPONENT_ALIAS = {
    "plc": "plc_cpu",
    "cpu": "plc_cpu",
    "plc_cpu": "plc_cpu",
    "io": "io_module",
    "io_module": "io_module",
    "断路器": "circuit_breaker",
    "空开": "circuit_breaker",
    "circuit breaker": "circuit_breaker",
    "mcb": "circuit_breaker",
    "power supply": "power_supply",
    "电源": "power_supply",
    "contactor": "contactor",
    "接触器": "contactor",
    "safety relay": "safety_relay",
    "安全继电器": "safety_relay",
    "vfd": "vfd",
    "servo": "servo_drive",
    "伺服": "servo_drive",
    "hmi": "hmi",
}

_PROTOCOL_ALIAS = {
    "pn": "PROFINET",
    "profinet": "PROFINET",
    "profibus": "PROFIBUS",
    "ethercat": "ETHERCAT",
    "modbus": "MODBUS",
    "modbus tcp": "MODBUS",
    "ethernet": "ETHERNET",
    "canopen": "CANOPEN",
    "io-link": "IO_LINK",
    "iolink": "IO_LINK",
    "24v": "POWER_24VDC",
    "24vdc": "POWER_24VDC",
    "ac": "POWER_AC",
    "220v": "POWER_AC",
    "380v": "POWER_AC",
}


def normalize_component_type(raw: str | None) -> str:
    val = (raw or "").strip().lower()
    val = re.sub(r"\s+", " ", val)
    mapped = _COMPONENT_ALIAS.get(val, val.replace("-", "_"))
    return mapped if mapped in COMPONENT_TYPES else "other"


def normalize_protocol(raw: str | None) -> str:
    val = (raw or "").strip().lower()
    val = re.sub(r"\s+", " ", val)
    mapped = _PROTOCOL_ALIAS.get(val, (raw or "UNKNOWN").upper())
    return mapped if mapped in PROTOCOL_TYPES else "UNKNOWN"


def normalize_property_map(properties: dict | None) -> dict:
    p = dict(properties or {})
    if "protocol" in p:
        p["protocol"] = normalize_protocol(str(p["protocol"]))
    if "network_protocol" in p:
        p["network_protocol"] = normalize_protocol(str(p["network_protocol"]))
    return p


# ── Topology-specific normalizers ──
# The topology pipeline uses its own canonical type names (plc, io, power, etc.)
# which differ from the KG canonical names (plc_cpu, io_module, power_supply).
# These functions preserve topology names while still mapping KG aliases.

_TOPOLOGY_ALIAS: dict[str, str] = {
    # KG canonical → topology canonical
    "plc_cpu": "plc",
    "plc_di": "io",
    "plc_do": "io",
    "plc_ai": "io",
    "plc_ao": "io",
    "power_supply": "power",
    "io_module": "io",
    "servo_drive": "servo",
    "communication_module": "switch",
    "terminal_block": "io",
    "actuator": "relay",
    "motor": "contactor",
    "thermal_overload": "relay",
    # Common aliases
    "cpu": "plc",
    "断路器": "circuit_breaker",
    "空开": "circuit_breaker",
    "circuit breaker": "circuit_breaker",
    "mcb": "circuit_breaker",
    "power supply": "power",
    "电源": "power",
    "接触器": "contactor",
    "safety relay": "safety_relay",
    "安全继电器": "safety_relay",
    "伺服": "servo",
    "安全门": "safety_door",
    "safety door": "safety_door",
    "信号灯": "signal_light",
    "signal light": "signal_light",
    "指示灯": "indicator_light",
    "indicator light": "indicator_light",
    "塔灯": "signal_light",
    "三色灯": "signal_light",
    "beacon": "signal_light",
    "急停": "estop",
    "e-stop": "estop",
}

_TOPOLOGY_PROTOCOL_ALIAS: dict[str, str] = {
    # Topology-specific protocols that normalize_protocol would destroy
    "safety_circuit": "SAFETY_CIRCUIT",
    "safety": "SAFETY_CIRCUIT",
    "power_220v": "POWER_220V",
    "220v": "POWER_220V",
    "380v": "POWER_220V",
    "power_24v": "POWER_24VDC",
    "24v": "POWER_24VDC",
    "24vdc": "POWER_24VDC",
    "profinet": "PROFINET",
    "pn": "PROFINET",
    "ethercat": "ETHERCAT",
    "ethernet": "ETHERNET",
    "profibus": "PROFIBUS",
    "modbus": "MODBUS",
    "signal": "SIGNAL",
}


def normalize_topology_type(raw: str | None) -> str:
    """Normalize a component type for the topology pipeline.

    Unlike normalize_component_type (which maps to KG canonical names),
    this preserves topology-native names like 'plc', 'io', 'power'.
    """
    val = (raw or "").strip().lower()
    val = re.sub(r"\s+", " ", val)
    val = val.replace("-", "_")
    # Already a valid topology type?
    if val in COMPONENT_TYPES:
        return val
    # Check alias map
    mapped = _TOPOLOGY_ALIAS.get(val)
    if mapped:
        return mapped
    return "other"


def normalize_topology_protocol(raw: str | None) -> str:
    """Normalize a protocol string for the topology pipeline.

    Preserves topology-specific protocols like SAFETY_CIRCUIT, POWER_220V
    that normalize_protocol would map to UNKNOWN.
    """
    val = (raw or "").strip().lower()
    val = re.sub(r"\s+", " ", val)
    # Check topology-specific aliases first
    mapped = _TOPOLOGY_PROTOCOL_ALIAS.get(val)
    if mapped:
        return mapped
    # Fall back to standard normalization
    upper = (raw or "UNKNOWN").upper().strip()
    return upper if upper in PROTOCOL_TYPES else "UNKNOWN"
