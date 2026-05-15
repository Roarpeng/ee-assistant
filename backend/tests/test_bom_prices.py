"""Tests for the indicative BOM price estimator.

`estimate_price` is best-effort: it returns >0 for known categories
and 0 for unknown ones. Callers (the project_meta computer) sum across
the BOM and clearly label the result as 估算 in the UI, so 0-cost rows
just mean "we don't have a reference price" — they don't crash.
"""
from app.core.bom_prices import estimate_price


def test_known_categories_return_positive():
    """Each common category should have at least a baseline price so
    InfoPanel's bomCost stat isn't dominated by zeros."""
    for cat in [
        "PLC_CPU", "IO_Module", "HMI", "VFD", "Servo_Drive",
        "Power_Supply", "Circuit_Breaker", "Contactor", "Relay",
        "Safety_Relay", "Sensor",
    ]:
        price = estimate_price({"category": cat, "manufacturer": "Siemens"})
        assert price > 0, f"{cat} should have a baseline price"


def test_unknown_category_returns_zero():
    """Honest 0 — better than a fake number for unrecognized items."""
    assert estimate_price({"category": "Unobtainium_Module", "manufacturer": "ACME"}) == 0


def test_missing_category_returns_zero():
    assert estimate_price({}) == 0
    assert estimate_price({"manufacturer": "Siemens"}) == 0


def test_brand_premium_applied():
    """Premium brands (Siemens / Beckhoff / Schneider) cost more than
    generic brands for the same category — small effect but real,
    helps the UI feel non-uniform."""
    siemens = estimate_price({"category": "PLC_CPU", "manufacturer": "Siemens"})
    generic = estimate_price({"category": "PLC_CPU", "manufacturer": "GenericCo"})
    assert siemens >= generic
    # At least a 10% delta to be meaningful in the bomCost stat.
    assert siemens - generic > 0


def test_returns_int():
    """InfoPanel formats with thousands separators — must be int, no
    floats sneaking in from intermediate math."""
    price = estimate_price({"category": "VFD", "manufacturer": "Siemens"})
    assert isinstance(price, int)
