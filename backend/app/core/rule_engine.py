"""Selection validation rules for electrical components."""


def validate_all(bom_items: list[dict], requirement: dict) -> list[dict]:
    violations = []
    violations.extend(check_breaker_rating(bom_items, requirement))
    violations.extend(check_sil_redundancy(bom_items, requirement))
    violations.extend(check_protocol_compatibility(bom_items))
    violations.extend(check_voltage_matching(bom_items))
    violations.extend(check_motor_starter_match(bom_items))
    return violations


def check_breaker_rating(bom_items: list[dict], requirement: dict) -> list[dict]:
    violations = []
    for item in bom_items:
        if item.get("category") != "Circuit_Breaker":
            continue
        rated = item.get("specifications", {}).get("rated_current_a")
        load = requirement.get("total_load_current_a", 0)
        if rated and load and rated < load * 1.25:
            violations.append({
                "rule": "breaker_rating",
                "severity": "error",
                "item": item["model"],
                "message": f"Breaker rated {rated}A < required {load * 1.25:.1f}A (load {load}A x 1.25)",
            })
    return violations


def check_sil_redundancy(bom_items: list[dict], requirement: dict) -> list[dict]:
    sil = requirement.get("safety_level", "")
    if sil not in ("SIL2", "SIL3"):
        return []

    safety_items = [i for i in bom_items if i.get("category") == "Safety_Relay"]
    if len(safety_items) < 2:
        return [{
            "rule": "sil_redundancy",
            "severity": "warning",
            "item": "Safety_Relay",
            "message": f"{sil} requires redundant safety relays. Found {len(safety_items)}. Consider adding a second safety relay.",
        }]
    return []


def check_protocol_compatibility(bom_items: list[dict]) -> list[dict]:
    protocols = set()
    for item in bom_items:
        proto = item.get("specifications", {}).get("protocol")
        if proto:
            protocols.add(proto)

    if len(protocols) > 1:
        return [{
            "rule": "protocol_compatibility",
            "severity": "error",
            "item": "Communication",
            "message": f"Mixed protocols detected: {protocols}. All devices must use a single protocol (PROFINET or PROFIBUS).",
        }]
    return []


def check_voltage_matching(bom_items: list[dict]) -> list[dict]:
    control_voltage = None
    for item in bom_items:
        if item.get("category") == "Power_Supply":
            control_voltage = item.get("specifications", {}).get("output_voltage_v")
            break

    violations = []
    if control_voltage:
        for item in bom_items:
            coil_v = item.get("specifications", {}).get("coil_voltage_v")
            if coil_v and coil_v != control_voltage:
                violations.append({
                    "rule": "voltage_matching",
                    "severity": "error",
                    "item": item["model"],
                    "message": f"Coil voltage {coil_v}V != control voltage {control_voltage}V",
                })
    return violations


def check_motor_starter_match(bom_items: list[dict]) -> list[dict]:
    violations = []
    motor_power = None
    for item in bom_items:
        if item.get("category") == "Motor":
            motor_power = item.get("specifications", {}).get("power_kw")

    if motor_power:
        for item in bom_items:
            if item.get("category") in ("Contactor", "Thermal_Overload"):
                spec_power = item.get("specifications", {}).get("max_motor_power_kw")
                if spec_power and motor_power > spec_power:
                    violations.append({
                        "rule": "motor_starter_match",
                        "severity": "error",
                        "item": item["model"],
                        "message": f"Motor {motor_power}kW exceeds {item['category']} rating {spec_power}kW",
                    })
    return violations
