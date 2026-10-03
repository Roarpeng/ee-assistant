"""IEC 60617 / GB/T 4728 symbol geometry library — single source of truth.

Each symbol is a parameter-free SVG fragment expressed in local millimetre
coordinates (origin = top-left of the bounding box) plus a pin anchor table.
The server-side renderer translates/renders these; topology-canvas frontend
assets are NOT derived from here (kept separate on purpose, see design doc).

Design notes:
- A3 sheet (420x297), stroke ~0.35-0.5mm — glyph sizes are tuned for that.
- 3-pole devices (QF/QS/KM main) expose L1..L3 / T1..T3 pins at the top /
  bottom of each pole column so vertical branch drops line up with bus bars.
- Control-circuit contacts are horizontal (current flows left -> right);
  pins sit on the left/right edge midpoints.
- Unknown device types must fall back to GENERIC_BOX — never silently drop.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Pin:
    name: str
    dx: float
    dy: float
    side: str = ""  # informational: "l" / "r" / "t" / "b"


@dataclass(frozen=True)
class Symbol:
    key: str
    width: float
    height: float
    paths: tuple[str, ...] = ()
    texts: tuple[tuple[float, float, str], ...] = ()
    pins: tuple[Pin, ...] = field(default_factory=tuple)
    category: str = "generic"


def _pole(x: float, h: float, hook: bool = False) -> str:
    """One vertical switch pole from y=0 to y=h at local x.

    A diagonal blade in the middle represents the contact gap; `hook`
    adds the small perpendicular tick that distinguishes a contactor
    main contact from a plain breaker/isolator pole.
    """
    top = 7.0
    bot = h - 7.0
    d = f"M{x},0 V{top} L{x + 5},{bot}"
    if hook:
        d += f" M{x + 5},{bot} V{h}"
    else:
        d += f" M{x + 5},{bot} V{h}"
    return d


def _contact_no(w: float, h: float) -> str:
    """Horizontal NO contact: line in, blade angled up-right, drop to pin."""
    y = h / 2.0
    return f"M0,{y} H3 L{w - 1},1 M{w - 1},1 V{y} M{w},{y} H{w}"


def _contact_nc(w: float, h: float) -> str:
    """Horizontal NC contact: NO blade + perpendicular tick at the tip."""
    y = h / 2.0
    return (
        f"M0,{y} H3 L{w - 3},2 M{w - 3},2 V{y} "
        f"M{w - 5},3.2 l4,-2.2 M{w},{y} H{w - 3}"
    )


def _circle(cx: float, cy: float, r: float) -> str:
    return f"M{cx - r},{cy} a{r},{r} 0 1,0 {2 * r},0 a{r},{r} 0 1,0 {-2 * r},0"


def _rect(x: float, y: float, w: float, h: float) -> str:
    return f"M{x},{y} h{w} v{h} h{-w} z"


def _build_registry() -> dict[str, Symbol]:
    syms: list[Symbol] = []

    def add(s: Symbol) -> None:
        syms.append(s)

    # ── Protection ──
    add(Symbol(
        key="QF_3P", width=22, height=22, category="breaker",
        paths=(
            _pole(4, 22), _pole(10, 22), _pole(16, 22),
            "M2,11 H18",  # dashed cross-link added via render style class
        ),
        pins=(Pin("L1", 4, 0, "t"), Pin("L2", 10, 0, "t"), Pin("L3", 16, 0, "t"),
             Pin("T1", 9, 22, "b"), Pin("T2", 15, 22, "b"), Pin("T3", 21, 22, "b")),
    ))
    add(Symbol(
        key="QF_1P", width=10, height=22, category="breaker",
        paths=(_pole(4, 22),),
        pins=(Pin("L", 4, 0, "t"), Pin("T", 9, 22, "b")),
    ))
    add(Symbol(
        key="QS_3P", width=22, height=22, category="disconnect",
        paths=(_pole(4, 22), _pole(10, 22), _pole(16, 22), "M2,11 H18"),
        pins=(Pin("L1", 4, 0, "t"), Pin("L2", 10, 0, "t"), Pin("L3", 16, 0, "t"),
              Pin("T1", 9, 22, "b"), Pin("T2", 15, 22, "b"), Pin("T3", 21, 22, "b")),
    ))
    add(Symbol(
        key="FU", width=10, height=18, category="fuse",
        paths=("M5,0 V2 M5,16 V18", _rect(2, 2, 6, 14), "M2,9 H8"),
        pins=(Pin("L", 5, 0, "t"), Pin("T", 5, 18, "b")),
    ))

    # ── Contactors / relays ──
    add(Symbol(
        key="KM_MAIN_3P", width=22, height=22, category="contactor_main",
        paths=(_pole(4, 22, hook=True), _pole(10, 22, hook=True), _pole(16, 22, hook=True),
               "M2,11 H18"),
        pins=(Pin("L1", 4, 0, "t"), Pin("L2", 10, 0, "t"), Pin("L3", 16, 0, "t"),
              Pin("T1", 9, 22, "b"), Pin("T2", 15, 22, "b"), Pin("T3", 21, 22, "b")),
    ))
    add(Symbol(
        key="KM_NO", width=14, height=16, category="contact_no",
        paths=(_contact_no(14, 16),),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="KM_NC", width=14, height=16, category="contact_nc",
        paths=(_contact_nc(14, 16),),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="KM_COIL", width=16, height=14, category="coil",
        paths=("M0,7 H4", _rect(4, 1, 8, 12), "M12,7 H16"),
        pins=(Pin("A1", 0, 7, "l"), Pin("A2", 16, 7, "r")),
    ))
    # Relay aux = same glyphs under KA_* aliases
    add(Symbol(
        key="KA_NO", width=14, height=16, category="contact_no",
        paths=(_contact_no(14, 16),),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="KA_NC", width=14, height=16, category="contact_nc",
        paths=(_contact_nc(14, 16),),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="KA_COIL", width=16, height=14, category="coil",
        paths=("M0,7 H4", _rect(4, 1, 8, 12), "M12,7 H16"),
        pins=(Pin("A1", 0, 7, "l"), Pin("A2", 16, 7, "r")),
    ))
    add(Symbol(
        key="KF_SAFETY", width=60, height=50, category="safety_relay",
        paths=(_rect(0, 0, 60, 50),),
        texts=((6, 9, "KF"), (6, 18, "CH A"), (6, 33, "CH B"), (6, 44, "RESET")),
        pins=(Pin("A1", 0, 12, "l"), Pin("A2", 0, 38, "l"), Pin("R1", 0, 25, "l"),
              Pin("13", 60, 12, "r"), Pin("14", 60, 19, "r"),
              Pin("23", 60, 33, "r"), Pin("24", 60, 40, "r")),
    ))

    # ── Power / machines ──
    add(Symbol(
        key="M_3PH", width=30, height=24, category="motor",
        paths=(_circle(15, 13, 10),),
        texts=((15, 11.5, "M"), (15, 17, "3~")),
        pins=(Pin("U", 7, 3, "t"), Pin("V", 15, 3, "t"), Pin("W", 23, 3, "t")),
    ))
    add(Symbol(
        key="T_CTRL", width=26, height=30, category="transformer",
        paths=(_circle(13, 10, 8), _circle(13, 20, 8), "M2,10 H5 M2,20 H5 M21,10 H24 M21,20 H24"),
        pins=(Pin("L", 0, 10, "l"), Pin("N", 0, 20, "l"),
              Pin("S1", 26, 10, "r"), Pin("S2", 26, 20, "r")),
    ))
    add(Symbol(
        key="PSU", width=34, height=20, category="power_supply",
        paths=(_rect(0, 0, 34, 20),),
        texts=((17, 8, "PSU"), (17, 15, "24VDC")),
        pins=(Pin("L1", 0, 6, "l"), Pin("N", 0, 14, "l"),
              Pin("P", 34, 6, "r"), Pin("M", 34, 14, "r")),
    ))
    add(Symbol(
        key="VFD_BOX", width=36, height=44, category="drive",
        paths=(_rect(0, 0, 36, 44),),
        texts=((18, 20, "VFD"),),
        pins=(Pin("L1", 8, 0, "t"), Pin("L2", 18, 0, "t"), Pin("L3", 28, 0, "t"),
              Pin("U", 8, 44, "b"), Pin("V", 18, 44, "b"), Pin("W", 28, 44, "b")),
    ))
    add(Symbol(
        key="SERVO_BOX", width=36, height=44, category="drive",
        paths=(_rect(0, 0, 36, 44),),
        texts=((18, 20, "SERVO"),),
        pins=(Pin("L1", 8, 0, "t"), Pin("L2", 18, 0, "t"), Pin("L3", 28, 0, "t"),
              Pin("U", 8, 44, "b"), Pin("V", 18, 44, "b"), Pin("W", 28, 44, "b")),
    ))

    # ── Operator / sensing ──
    add(Symbol(
        key="SB_MUSHROOM_NC", width=14, height=16, category="estop",
        paths=(_contact_nc(14, 16), "M7,0.5 V3.5", _circle(7, 0.5, 1.8)),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="SG_DOOR_NC", width=14, height=16, category="safety_door",
        paths=(_contact_nc(14, 16), "M7,0.5 V3.5 M4,0.5 H10 M7,3.5 L11,6"),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="SB_NO", width=14, height=16, category="button",
        paths=(_contact_no(14, 16), "M7,0.5 V3.5", _circle(7, 3.5, 1.6)),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="SB_NC", width=14, height=16, category="button",
        paths=(_contact_nc(14, 16), "M7,0.5 V3.5", _circle(7, 3.5, 1.6)),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="SL", width=12, height=12, category="lamp",
        paths=(_circle(6, 6, 5), "M2.5,2.5 L9.5,9.5 M9.5,2.5 L2.5,9.5"),
        pins=(Pin("1", 0, 6, "l"), Pin("2", 12, 6, "r")),
    ))
    add(Symbol(
        key="SQ_PROX", width=14, height=16, category="sensor",
        paths=(_contact_no(14, 16), _rect(5, 1, 6, 5), "M6,3 L10,5 M10,3 L6,5"),
        pins=(Pin("1", 0, 8, "l"), Pin("2", 14, 8, "r")),
    ))
    add(Symbol(
        key="X_TERMINAL", width=6, height=6, category="terminal",
        paths=(_circle(3, 3, 2.5),),
        pins=(Pin("1", 0, 3, "l"), Pin("2", 6, 3, "r")),
    ))

    # ── Function boxes / fallback ──
    add(Symbol(
        key="PLC_IO_BOX", width=50, height=40, category="plc",
        paths=(_rect(0, 0, 50, 40),),
        texts=((25, 12, "PLC"),),
        pins=(),  # channel pins are page-specific; wires may omit pins
    ))
    add(Symbol(
        key="GENERIC_BOX", width=30, height=20, category="generic",
        paths=(_rect(0, 0, 30, 20),),
        texts=((15, 12, "?"),),
        pins=(),
    ))
    return {s.key: s for s in syms}


SYMBOLS: dict[str, Symbol] = _build_registry()

#: wire-style decorations per symbol path index — 1 means "dashed" (the
#: cross-links inside multi-pole devices are drawn dashed like real drawings)
_DASHED_PATH_INDEX: dict[str, tuple[int, ...]] = {
    "QF_3P": (3,),
    "QS_3P": (3,),
    "KM_MAIN_3P": (3,),
}


def get_symbol(key: str) -> Symbol:
    """Registry lookup with GENERIC_BOX fallback — never raises."""
    return SYMBOLS.get(key) or SYMBOLS["GENERIC_BOX"]


def dashed_path_indices(key: str) -> tuple[int, ...]:
    return _DASHED_PATH_INDEX.get(key, ())


def pin_point(symbol_key: str, pos: tuple[float, float], pin_name: str) -> tuple[float, float]:
    """Absolute sheet coordinates of a pin anchor."""
    sym = get_symbol(symbol_key)
    for p in sym.pins:
        if p.name == pin_name:
            return (round(pos[0] + p.dx, 3), round(pos[1] + p.dy, 3))
    # Pin not declared (e.g. box channels): fall back to the symbol origin
    # so the wire still snaps somewhere sane instead of (0,0).
    return (round(pos[0], 3), round(pos[1], 3))
