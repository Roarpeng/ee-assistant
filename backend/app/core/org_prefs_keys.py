"""Canonical preference key strings shared by backend + frontend.

Keep this file dependency-free so it can be imported anywhere,
including by the alembic migrations if needed.

Each constant pairs with a small, stable value shape:
    PREF_PLC_FAMILY      -> {"family": "S7-1200"}
    PREF_SAFETY_LEVEL    -> {"level": "SIL2"}
    PREF_ENVIRONMENT     -> {"env": "indoor"}
    PREF_VOLTAGE         -> {"volts": 24}
    PREF_HMI_BRAND       -> {"brand": "Siemens"}
    PREF_BRAND_BLACKLIST -> {"brands": ["X", "Y"]}
"""

PREF_PLC_FAMILY = "preferred_plc_family"        # value: {"family": "S7-1200"}
PREF_SAFETY_LEVEL = "default_safety_level"      # value: {"level": "SIL2"}
PREF_ENVIRONMENT = "default_environment"        # value: {"env": "indoor"}
PREF_VOLTAGE = "voltage_standard"               # value: {"volts": 24}
PREF_HMI_BRAND = "preferred_hmi_brand"          # value: {"brand": "Siemens"}
PREF_BRAND_BLACKLIST = "brand_blacklist"        # value: {"brands": ["X"]}

ALL_KEYS = (
    PREF_PLC_FAMILY,
    PREF_SAFETY_LEVEL,
    PREF_ENVIRONMENT,
    PREF_VOLTAGE,
    PREF_HMI_BRAND,
    PREF_BRAND_BLACKLIST,
)


# Map: requirement-field → (preference-key, value-extractor)
# Used by RequirementsAgent to figure out which prefs fill which req gaps.
# Extractors return None when the stored value shape doesn't match.
REQ_FIELD_TO_PREF = {
    "plc_family": (PREF_PLC_FAMILY, lambda v: v.get("family") if isinstance(v, dict) else None),
    "safety_level": (PREF_SAFETY_LEVEL, lambda v: v.get("level") if isinstance(v, dict) else None),
    "environment": (PREF_ENVIRONMENT, lambda v: v.get("env") if isinstance(v, dict) else None),
}
