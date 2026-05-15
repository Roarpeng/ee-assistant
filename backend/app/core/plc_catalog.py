"""PLC capacity & terminal catalog — single source of truth for IO
budgeting and wiring terminal assignment.

Each entry is keyed on the manufacturer order_number (Siemens MLFB).
We cover the most common Siemens S7-1200 / S7-1500 CPUs we see in the
field. For unknown order numbers, callers should fall back to
GENERIC_PLC and log a warning — the wiring generator will still
produce sensible output, just with an 8/8/2/0 generic capacity.

Terminals are listed in mounting order (DI0..DIn-1, DO0..DOm-1, ...),
and the wiring generator assigns by popping from the front, so the
order MUST be stable.

Price values are CNY MSRP rounded to nearest 100 — used by the BOM
cost estimator. They are clearly labelled as 估算 in the UI.
"""
from __future__ import annotations
from typing import TypedDict


class _Capacity(TypedDict):
    di: int
    do_: int
    ai: int
    ao: int


class _Terminals(TypedDict):
    di: list[str]
    do_: list[str]
    ai: list[str]
    ao: list[str]


class PLCSpec(TypedDict):
    family: str
    capacity: _Capacity
    terminals: _Terminals
    price_cny: int


def _build_terminals(di: int, do_: int, ai: int, ao: int) -> _Terminals:
    return {
        "di": [f"DI{i}" for i in range(di)],
        "do_": [f"DO{i}" for i in range(do_)],
        "ai": [f"AI{i}" for i in range(ai)],
        "ao": [f"AO{i}" for i in range(ao)],
    }


def _entry(family: str, di: int, do_: int, ai: int, ao: int, price: int) -> PLCSpec:
    return {
        "family": family,
        "capacity": {"di": di, "do_": do_, "ai": ai, "ao": ao},
        "terminals": _build_terminals(di, do_, ai, ao),
        "price_cny": price,
    }


# ── Catalog ────────────────────────────────────────────────────────
# Keys are uppercased + stripped at registration time so lookup is
# case-insensitive and tolerant of accidental whitespace from copy-paste.
_CATALOG: dict[str, PLCSpec] = {
    # Siemens S7-1200 family
    "6ES7211-1AE40-0XB0":  _entry("S7-1200", di=6,  do_=4,  ai=2, ao=0, price=2200),  # 1211C DC/DC/DC
    "6ES7212-1AE40-0XB0":  _entry("S7-1200", di=8,  do_=6,  ai=2, ao=0, price=2700),  # 1212C DC/DC/DC
    "6ES7214-1AG40-0XB0":  _entry("S7-1200", di=14, do_=10, ai=2, ao=0, price=3800),  # 1214C DC/DC/DC
    "6ES7214-1BG40-0XB0":  _entry("S7-1200", di=14, do_=10, ai=2, ao=0, price=4000),  # 1214C AC/DC/RLY
    "6ES7215-1AG40-0XB0":  _entry("S7-1200", di=14, do_=10, ai=2, ao=2, price=5200),  # 1215C DC/DC/DC
    # Siemens S7-1500 family
    "6ES7511-1AK02-0AB0":  _entry("S7-1500", di=0,  do_=0,  ai=0, ao=0, price=8500),  # 1511-1 PN (no onboard IO)
    "6ES7511-1CK02-0AB0":  _entry("S7-1500", di=16, do_=16, ai=5, ao=2, price=11500), # 1511C-1 PN
    "6ES7513-1AL02-0AB0":  _entry("S7-1500", di=0,  do_=0,  ai=0, ao=0, price=14000), # 1513-1 PN
}


# Generic fallback used by callers when the order_number is unknown.
# Mirrors the shape of a real entry so downstream code stays branch-free.
GENERIC_PLC: PLCSpec = _entry("Generic", di=8, do_=8, ai=2, ao=0, price=3000)


def _normalize(order_number: str) -> str:
    return (order_number or "").strip().upper()


def lookup_plc(order_number: str) -> PLCSpec | None:
    """Return the catalog entry for an MLFB, or None if unknown.

    Callers that need a fallback should branch on `None` and use
    `GENERIC_PLC` directly — this lets the caller decide whether to
    log a warning, mark a row as approximate, etc.
    """
    return _CATALOG.get(_normalize(order_number))


def list_known_models() -> list[str]:
    """All known MLFBs, in registration order. Stable for tests."""
    return list(_CATALOG.keys())
