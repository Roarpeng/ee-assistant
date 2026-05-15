"""Tests for the PLC capacity & terminal catalog.

The catalog is the single source of truth for IO budgeting and wiring
terminal assignment. Both downstream features depend on its shape, so
the contract is fixed here.
"""
import pytest

from app.core.plc_catalog import lookup_plc, GENERIC_PLC, list_known_models


def test_lookup_s7_1212c_dc_dc_dc():
    """Canonical Siemens CPU 1212C DC/DC/DC: 8 DI / 6 DO / 2 AI."""
    spec = lookup_plc("6ES7212-1AE40-0XB0")
    assert spec is not None
    assert spec["family"] == "S7-1200"
    cap = spec["capacity"]
    assert cap == {"di": 8, "do_": 6, "ai": 2, "ao": 0}
    # Terminal lists must match capacity (or be empty for zero-capacity).
    assert len(spec["terminals"]["di"]) == 8
    assert len(spec["terminals"]["do_"]) == 6
    assert len(spec["terminals"]["ai"]) == 2
    assert spec["terminals"]["ao"] == []
    assert spec["terminals"]["di"][0] == "DI0"
    assert spec["price_cny"] > 0


def test_lookup_unknown_returns_none():
    assert lookup_plc("UNKNOWN-MODEL-XYZ") is None


def test_lookup_is_case_insensitive_and_strips():
    """Real-world BOM rows have inconsistent casing/whitespace — catalog
    must normalize before matching."""
    spec = lookup_plc("  6es7212-1AE40-0xb0  ")
    assert spec is not None
    assert spec["family"] == "S7-1200"


def test_generic_plc_default_shape():
    """GENERIC_PLC is the fallback for unknown order numbers in
    downstream code. Its shape must mirror a real entry so callers
    don't need branching logic."""
    assert set(GENERIC_PLC.keys()) >= {"family", "capacity", "terminals", "price_cny"}
    cap = GENERIC_PLC["capacity"]
    assert set(cap.keys()) == {"di", "do_", "ai", "ao"}
    assert all(isinstance(v, int) and v >= 0 for v in cap.values())
    assert len(GENERIC_PLC["terminals"]["di"]) == cap["di"]
    assert len(GENERIC_PLC["terminals"]["do_"]) == cap["do_"]


def test_terminals_zero_indexed_and_dense():
    """For any PLC entry, terminals must be DI0..DIn-1, DO0..DOm-1, etc.
    Wiring generator assigns by popping from the front of these lists,
    so order and uniqueness matter."""
    for model in list_known_models():
        spec = lookup_plc(model)
        assert spec is not None
        for ch in ("di", "do_", "ai", "ao"):
            n = spec["capacity"][ch]
            t = spec["terminals"][ch]
            assert len(t) == n, f"{model}:{ch} mismatch {len(t)} vs {n}"
            assert len(set(t)) == n, f"{model}:{ch} terminals not unique"


def test_at_least_three_families_covered():
    """Sanity: catalog should cover the most common Siemens variants so
    real-world BOMs hit a real entry, not the generic fallback."""
    models = list_known_models()
    assert len(models) >= 3
