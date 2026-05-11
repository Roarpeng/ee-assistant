"""Canonical taxonomy for electrical components and protocols."""

COMPONENT_TYPES = {
    "sensor",
    "plc_cpu",
    "plc_di",
    "plc_do",
    "plc_ai",
    "plc_ao",
    "power_supply",
    "circuit_breaker",
    "contactor",
    "thermal_overload",
    "vfd",
    "safety_relay",
    "terminal_block",
    "actuator",
    "communication_module",
    "hmi",
    "motor",
    "io_module",
    "servo_drive",
    "other",
}

PROTOCOL_TYPES = {
    "PROFINET",
    "PROFIBUS",
    "ETHERCAT",
    "MODBUS",
    "ETHERNET",
    "CANOPEN",
    "IO_LINK",
    "SAFETY",
    "POWER_24VDC",
    "POWER_AC",
    "SIGNAL",
    "UNKNOWN",
}
