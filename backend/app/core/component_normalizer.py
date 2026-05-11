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
