"""Control circuit page generator — deterministic ladder logic.

Layout conventions (all pin anchors are exact — wires always run from a
pin anchor to a pin anchor, or to a rail tap point that is an endpoint
of a rail segment):

    L+ rail ──[KF 13/14]──[SB start]──┐
                                      ├──[KM1 coil]── 0V rail
    (self-hold KM1 NO hangs 12mm below the start contact, joined by
     vertical links on both sides — classic 启保停 pattern)

Contact glyph width is 14mm; element slots advance 34mm so consecutive
pins are 20mm apart. The safety-relay box spans the two channel rungs,
its left pins landing exactly on the rung conductors.
"""
from __future__ import annotations

from app.core.schematic.ir import PinRef, SchematicPage, SymbolInstance, Wire
from app.core.schematic.symbols import pin_point

LEFT_RAIL_X = 28.0
RIGHT_RAIL_X = 380.0
RAIL_Y0 = 38.0
RUNG_Y0 = 64.0
RUNG_PITCH = 30.0
PARALLEL_DY = 12.0
ELEM_X0 = 48.0
ELEM_DX = 34.0
CONTACT_W = 14.0
KF_X = 298.0
COIL_X = 342.0
MAX_RUNGS = 16

_CONTACT_KEYS = {"NO": "KA_NO", "NC": "KA_NC"}


class _RungCtx:
    """Symbol/wire accumulator with rail-tap bookkeeping."""

    def __init__(self, tags) -> None:
        self.tags = tags
        self.n = 0
        self.symbols: list[SymbolInstance] = []
        self.wires: list[Wire] = []
        self.left_taps: set[float] = {RAIL_Y0}
        self.right_taps: set[float] = {RAIL_Y0}

    # -- symbols -----------------------------------------------------
    def sym(self, ref: str, key: str, pos: tuple[float, float],
            attrs: dict | None = None) -> SymbolInstance:
        self.n += 1
        s = SymbolInstance(
            id=f"ct_s{self.n}", ref=ref, symbol_key=key,
            pos=(round(pos[0], 3), round(pos[1], 3)),
            attrs={k: str(v)[:40] for k, v in (attrs or {}).items()},
        )
        self.symbols.append(s)
        return s

    def contact(self, x: float, y: float, key: str, ref: str, label: str = "") -> SymbolInstance:
        return self.sym(ref, key, (x, y - 8.0), {"label": label} if label else None)

    def pin(self, s: SymbolInstance, name: str) -> tuple[float, float]:
        return pin_point(s.symbol_key, s.pos, name)

    # -- wires -------------------------------------------------------
    def wire(self, points: list[tuple[float, float]], net: str,
             pins: list[PinRef] | None = None) -> None:
        self.n += 1
        self.wires.append(Wire(
            id=f"ct_w{self.n}", net=net,
            points=[(round(x, 3), round(y, 3)) for x, y in points],
            pins=pins or [],
        ))

    def h(self, x1: float, x2: float, y: float, net: str,
          pins: list[PinRef] | None = None) -> None:
        self.wire([(x1, y), (x2, y)], net, pins)

    def link(self, prev: SymbolInstance, nxt: SymbolInstance, y: float, net: str) -> None:
        """Wire between two same-row contacts, pin anchor to pin anchor."""
        self.h(self.pin(prev, "2")[0], self.pin(nxt, "1")[0], y, net,
               [PinRef(symbol_id=prev.id, pin="2"), PinRef(symbol_id=nxt.id, pin="1")])

    def rail_left(self, x: float, y: float, net: str,
                  pin: PinRef | None = None) -> None:
        self.left_taps.add(round(y, 3))
        self.h(LEFT_RAIL_X, x, y, net,
               [pin] if pin else None)

    def rail_right(self, x: float, y: float, net: str, pin: PinRef) -> None:
        self.right_taps.add(round(y, 3))
        self.h(x, RIGHT_RAIL_X, y, net, [pin])

    def close_rails(self, y_end: float) -> None:
        """Build the rails as chained segments whose endpoints ARE the taps
        (an interior-point contact would be invisible to the netlist)."""
        self.left_taps.add(round(y_end, 3))
        self.right_taps.add(round(y_end, 3))
        for taps, x, net in ((sorted(self.left_taps), LEFT_RAIL_X, "RAILL"),
                             (sorted(self.right_taps), RIGHT_RAIL_X, "RAILN")):
            for a, b in zip(taps, taps[1:]):
                self.wire([(x, a), (x, b)], net)


def build_control_pages(
    nodes: list[dict],
    tags,
    requirement: dict | None = None,
    extra_rungs: list[dict] | None = None,
) -> list[SchematicPage]:
    requirement = requirement or {}
    nodes = [n for n in nodes if isinstance(n, dict)]
    by_type: dict[str, list[dict]] = {}
    for n in nodes:
        by_type.setdefault(n.get("type") or "other", []).append(n)

    estops = by_type.get("estop", [])
    doors = by_type.get("safety_door", [])
    kfs = by_type.get("safety_relay", [])
    contactors = by_type.get("contactor", []) + by_type.get("relay", [])
    lamps = by_type.get("signal_light", []) + by_type.get("indicator_light", [])
    psus = by_type.get("power", [])
    transformers = by_type.get("transformer", [])
    drives = by_type.get("vfd", []) + by_type.get("servo", [])

    notes: list[str] = []
    ctx = _RungCtx(tags)
    sil = str(requirement.get("safety_level") or "").upper()
    dual_channel = bool(kfs) or ("2" in sil or "3" in sil)

    y = RUNG_Y0
    rung = 0

    def next_y(step: float = RUNG_PITCH) -> float:
        nonlocal y, rung
        y += step
        rung += 1
        return y

    # ── supply source feeding the rails ──
    if transformers:
        t = transformers[0]
        s = ctx.sym(tags.ref_for(t["id"], t["type"]), "T_CTRL", (40.0, 16.0), _attrs(t))
        p1, p2 = ctx.pin(s, "S1"), ctx.pin(s, "S2")
        ctx.left_taps.add(round(p1[1], 3))
        ctx.wire([p1, (LEFT_RAIL_X, p1[1])], "RAILL")
        ctx.right_taps.add(round(p2[1], 3))
        ctx.wire([p2, (RIGHT_RAIL_X, p2[1])], "RAILN")
        notes.append("控制变压器一次侧由主回路供电（L1/N）。")
    elif psus:
        p = psus[0]
        s = ctx.sym(tags.ref_for(p["id"], p["type"]), "PSU", (36.0, 16.0), _attrs(p))
        pp, pm = ctx.pin(s, "P"), ctx.pin(s, "M")
        ctx.left_taps.add(round(pp[1], 3))
        ctx.wire([pp, (LEFT_RAIL_X, pp[1])], "RAILL")
        ctx.right_taps.add(round(pm[1], 3))
        ctx.wire([pm, (RIGHT_RAIL_X - 60.0, pm[1]), (RIGHT_RAIL_X, pm[1])], "RAILN")

    # ── safety chain into KF box ──
    kf_ref = tags.ref_for(kfs[0]["id"], kfs[0]["type"]) if kfs else None
    if kf_ref:
        kf_pos_y = y - 12.0
        ctx.sym(kf_ref, "KF_SAFETY", (KF_X, kf_pos_y), _attrs(kfs[0]))
        channels = 2 if dual_channel else 1
        for ch in range(channels):
            x = ELEM_X0
            prev: SymbolInstance | None = None
            chain: list[SymbolInstance] = []
            if estops:
                e = estops[0]
                c = ctx.contact(x, y, "SB_MUSHROOM_NC", tags.ref_for(e["id"], e["type"]),
                                "急停" if ch == 0 else "")
                chain.append(c)
                x += ELEM_DX
            if doors:
                d = doors[0]
                c = ctx.contact(x, y, "SG_DOOR_NC", tags.ref_for(d["id"], d["type"]),
                                "安全门" if ch == 0 else "")
                chain.append(c)
                x += ELEM_DX
            net = f"SAFE{ch}"
            if chain:
                first = chain[0]
                ctx.rail_left(ctx.pin(first, "1")[0], y, net, PinRef(symbol_id=first.id, pin="1"))
                for a, b in zip(chain, chain[1:]):
                    ctx.link(a, b, y, net)
                last = chain[-1]
                pin_name = "A1" if ch == 0 else "A2"
                ctx.h(ctx.pin(last, "2")[0], KF_X, y, net,
                      [PinRef(symbol_id=last.id, pin="2"), PinRef(symbol_id=_kf_sym(ctx).id, pin=pin_name)])
            else:
                pin_name = "A1" if ch == 0 else "A2"
                ctx.left_taps.add(round(y, 3))
                ctx.wire([(LEFT_RAIL_X, y), (KF_X, y)], net,
                         [PinRef(symbol_id=_kf_sym(ctx).id, pin=pin_name)])
            next_y(26.0)
        # reset rung into R1
        sb = ctx.contact(ELEM_X0, y, "SB_NO", tags.free_ref("switch"), "复位")
        ctx.rail_left(ctx.pin(sb, "1")[0], y, "RESET", PinRef(symbol_id=sb.id, pin="1"))
        r1_y = kf_pos_y + 25.0
        ctx.wire([ctx.pin(sb, "2"), (KF_X, y), (KF_X, r1_y)], "RESET",
                 [PinRef(symbol_id=sb.id, pin="2"), PinRef(symbol_id=_kf_sym(ctx).id, pin="R1")])
        notes.append("SIL2 及以上采用急停双通道 + 安全继电器（与规则引擎 SIL 判定一致）。")
        next_y()
    elif estops and not kfs:
        notes.append("存在急停但未配置安全继电器，急停常闭触点直接串入接触器控制回路。")

    # ── contactor rungs (启保停) ──
    for km in contactors:
        km_ref = tags.ref_for(km["id"], km["type"])
        x = ELEM_X0
        net = f"RUNG{rung}"
        prev: SymbolInstance | None = None

        guard_ref = kf_ref or (tags.ref_for(estops[0]["id"], estops[0]["type"]) if estops else None)
        if guard_ref:
            g = ctx.contact(x, y, "KA_NO" if kf_ref else "SB_MUSHROOM_NC", guard_ref,
                            "安全 OK" if kf_ref else "急停")
            ctx.rail_left(ctx.pin(g, "1")[0], y, net, PinRef(symbol_id=g.id, pin="1"))
            prev = g
            x += ELEM_DX

        # start button + parallel self-hold
        sb = ctx.contact(x, y, "SB_NO", tags.free_ref("switch"), "启动")
        hold = ctx.contact(x, y + PARALLEL_DY, "KA_NO", km_ref, "自锁")
        if prev:
            ctx.link(prev, sb, y, net)
        else:
            ctx.rail_left(ctx.pin(sb, "1")[0], y, net, PinRef(symbol_id=sb.id, pin="1"))
        rn = round(x + CONTACT_W, 3)
        net_r = f"RUNG{rung}R"
        ctx.wire([(x, y), (x, y + PARALLEL_DY)], net,
                 [PinRef(symbol_id=sb.id, pin="1"), PinRef(symbol_id=hold.id, pin="1")])
        ctx.wire([(rn, y), (rn, y + PARALLEL_DY)], net_r,
                 [PinRef(symbol_id=sb.id, pin="2"), PinRef(symbol_id=hold.id, pin="2")])

        coil = ctx.sym(km_ref, "KM_COIL", (COIL_X, y - 7.0), _attrs(km))
        ctx.h(rn, COIL_X, y, net_r, [PinRef(symbol_id=sb.id, pin="2")])
        ctx.rail_right(ctx.pin(coil, "A2")[0], y, f"RUNG{rung}N", PinRef(symbol_id=coil.id, pin="A2"))
        next_y(RUNG_PITCH + PARALLEL_DY)

    # ── lamp rungs ──
    for lamp in lamps:
        ref = tags.ref_for(lamp["id"], lamp["type"])
        net = f"RUNG{rung}"
        x = ELEM_X0
        prev = None
        driver_ref = tags.ref_for(contactors[0]["id"], contactors[0]["type"]) if contactors else None
        if driver_ref:
            g = ctx.contact(x, y, "KA_NO", driver_ref)
            ctx.rail_left(ctx.pin(g, "1")[0], y, net, PinRef(symbol_id=g.id, pin="1"))
            prev = g
            x += ELEM_DX
        hl = ctx.sym(ref, "SL", (COIL_X, y - 6.0), _attrs(lamp))
        if prev:
            ctx.h(ctx.pin(prev, "2")[0], ctx.pin(hl, "1")[0], y, net,
                  [PinRef(symbol_id=prev.id, pin="2"), PinRef(symbol_id=hl.id, pin="1")])
        else:
            ctx.rail_left(ctx.pin(hl, "1")[0], y, net, PinRef(symbol_id=hl.id, pin="1"))
        ctx.rail_right(ctx.pin(hl, "2")[0], y, f"RUNG{rung}N", PinRef(symbol_id=hl.id, pin="2"))
        next_y()

    # ── LLM-translated logic rules (P3, gated upstream) ──
    added, y_extra = _build_extra_rungs(ctx, extra_rungs or [], y, tags)
    if added:
        notes.append(f"{added} 条控制逻辑由 LLM 翻译为梯级（已通过结构校验）。")
        y = y_extra

    if drives:
        notes.append("变频器/伺服使能与速度给定由 PLC DO/AO 驱动，接线见 IO 回路页。")

    if not ctx.symbols:
        sb = ctx.contact(ELEM_X0, RUNG_Y0, "SB_NO", tags.free_ref("switch"))
        hl = ctx.sym(tags.free_ref("signal_light"), "SL", (COIL_X, RUNG_Y0 - 6.0))
        ctx.rail_left(ctx.pin(sb, "1")[0], RUNG_Y0, "MIN1", PinRef(symbol_id=sb.id, pin="1"))
        ctx.h(ctx.pin(sb, "2")[0], ctx.pin(hl, "1")[0], RUNG_Y0, "MIN2",
              [PinRef(symbol_id=sb.id, pin="2"), PinRef(symbol_id=hl.id, pin="1")])
        ctx.rail_right(ctx.pin(hl, "2")[0], RUNG_Y0, "MIN3", PinRef(symbol_id=hl.id, pin="2"))
        notes.append("拓扑中无接触器/指示灯，仅生成电源指示最小回路。")

    ctx.close_rails(y + 4.0)
    if rung > MAX_RUNGS:
        notes.append(f"梯级共 {rung} 条超出单页 {MAX_RUNGS} 条预算，建议拆分电控柜。")

    return [SchematicPage(page_no=0, kind="control", title_zh="控制回路",
                          symbols=ctx.symbols, wires=ctx.wires, notes=notes)]


def _kf_sym(ctx: _RungCtx) -> SymbolInstance:
    return next(s for s in ctx.symbols if s.symbol_key == "KF_SAFETY")


def _build_extra_rungs(ctx: _RungCtx, extra_rungs: list[dict], y0: float, tags) -> tuple[int, float]:
    added = 0
    y = y0
    for rung in extra_rungs[:4]:
        series = rung.get("series") or []
        coil_hint = (rung.get("coil") or {}).get("ref_hint") or "KA"
        contacts = [c for c in series if isinstance(c, dict) and c.get("type") in ("NO", "NC")][:5]
        if not contacts:
            continue
        x = ELEM_X0
        prev = None
        net = f"EX{added}"
        for c in contacts:
            key = _CONTACT_KEYS[c["type"]]
            ref = tags.resolve_hint(str(c.get("ref_hint") or ""))
            cs = ctx.contact(x, y, key, ref, str(c.get("label") or "")[:20])
            if prev:
                ctx.link(prev, cs, y, net)
            else:
                ctx.rail_left(ctx.pin(cs, "1")[0], y, net, PinRef(symbol_id=cs.id, pin="1"))
            prev = cs
            x += ELEM_DX
        coil = ctx.sym(tags.resolve_hint(coil_hint), "KA_COIL", (COIL_X, y - 7.0))
        ctx.h(ctx.pin(prev, "2")[0], ctx.pin(coil, "A1")[0], y, net,
              [PinRef(symbol_id=prev.id, pin="2"), PinRef(symbol_id=coil.id, pin="A1")])
        ctx.rail_right(ctx.pin(coil, "A2")[0], y, f"EX{added}N", PinRef(symbol_id=coil.id, pin="A2"))
        added += 1
        y += RUNG_PITCH
    return added, y


def _attrs(node: dict) -> dict[str, str]:
    label = (node.get("label") or "").strip()
    return {"label": label[:40]} if label else {}
