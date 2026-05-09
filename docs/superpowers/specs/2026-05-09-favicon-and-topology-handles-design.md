# Favicon + Topology Handles by Electrical Convention — Design

**Date**: 2026-05-09
**Scope**: Frontend visual layer — browser tab icon + ReactFlow handle/edge wiring rules
**Author**: chat session
**Status**: approved (option A + A)

## Goals

1. Give the browser tab a recognizable Volta brand icon (currently empty).
2. Make canvas connections honor electrical-engineering topology conventions
   so a glance at the diagram conveys *which* circuit each line belongs to:
   power, network, safety, or signal feedback.

## Non-Goals

- No backend prompt changes for topology format (already normalized in
  previous session).
- No new node types — keep the 18 existing ones.
- No multi-icon set (no PWA, no Android home-screen variants); a single SVG
  + ICO is enough for the browser tab.

## Part 1 — Favicon (option A: lightning ⚡ + letter V)

### Concept

A single hexagonal/rounded-square badge containing a stylized lightning bolt
that doubles as the letter **V**. Pun on "Volta" + immediate read of
"electricity / engineering". Rendered as inline SVG so it scales cleanly
from 16×16 to 256×256 with no raster artifacts.

### Visual specification

- **Shape**: 32×32 viewBox, rounded square (rx=6) background
- **Background**: solid `#1e1b4b` (indigo-950) — matches dark theme
- **Foreground bolt/V**: `#a5b4fc` (indigo-300) with subtle 1px stroke in
  `#818cf8` (indigo-400) for crispness at 16px
- **Accent dot**: small `#fbbf24` (amber) circle at the bolt tip — reads
  as a "live terminal" / energized point
- **No text**: at 16px any text becomes mush; the bolt-V silhouette is
  the wordmark

### Delivery

- `frontend/public/favicon.svg` — primary, served as-is by Vite/nginx
- `frontend/public/favicon.ico` — fallback for IE/old browsers; same
  artwork rasterized
- `frontend/index.html` — add `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
  + ico fallback + theme-color meta + updated title
- Dark/light mode: the icon background is fixed dark indigo so it reads
  on both browser themes (most modern browsers crop to a square anyway)

## Part 2 — Topology handles by protocol (option A: strict directional)

### Electrical convention (the rules we encode)

| Circuit type | Direction in panel layout | Protocol IDs | Handle pair |
|---|---|---|---|
| **Power main / 220-480V** | Top→Bottom (gravity flow from infeed) | `POWER_220V`, `POWER_480V`, `POWER_AC` | source=`pwr-bottom`, target=`pwr-top` |
| **Control 24V DC** | Top→Bottom (after CB/PS) | `POWER_24V`, `POWER_DC` | source=`pwr-bottom`, target=`pwr-top` |
| **Field network** | Left→Right (signal chain) | `PROFINET`, `ETHERCAT`, `ETHERNET`, `MODBUS` | source=`net-right`, target=`net-left` |
| **Safety circuit** | Left→Right (own bus, color-coded red) | `SAFETY_CIRCUIT`, `SAFETY_BUS` | source=`safe-right`, target=`safe-left` |
| **Sensor feedback** | Bottom→Top (return path, opposite of power) | `SIGNAL`, `FEEDBACK`, `IO_SIGNAL` | source=`fb-top`, target=`fb-bottom` |

This matches IEC 60204-1 / NFPA 79 panel-drawing conventions: power flows
down, control signals across, feedback loops up.

### Handle layout per node (8 handles total)

```
                ┌── pwr-top (target, orange)
                │   fb-top    (source, green)
                ▼
   safe-left ──[ NODE ]── net-right (source, blue)
   net-left  ──         ── safe-right (source, red)
                ▲
                │   fb-bottom  (target, green)
                └── pwr-bottom (source, orange)
```

- **Top edge**: 2 handles — `pwr-top` (target, orange) + `fb-top` (source, green)
- **Bottom edge**: 2 handles — `pwr-bottom` (source, orange) + `fb-bottom` (target, green)
- **Left edge**: 2 handles — `net-left` (target, blue) + `safe-left` (target, red)
- **Right edge**: 2 handles — `net-right` (source, blue) + `safe-right` (source, red)

Handles are positioned with `style={{ left/top: '...' }}` to spread across
each edge so they're visually distinguishable but not crowded.

### Color palette (handle + edge stroke)

- **Power (orange)**: `#f59e0b` — matches PowerNode amber accents
- **Network (blue)**: `#3b82f6` — matches SwitchNode blue
- **Safety (red)**: `#ef4444` — matches SafetyRelayNode rose
- **Feedback (green)**: `#10b981` — matches SensorNode emerald
- **Default fallback**: `#737373` (current neutral) — for unknown protocols

### Backend changes

`backend/app/core/graph/agents.py` — `_normalize_edge`:
- Classify protocol → handle-pair via lookup table
- Emit `sourceHandle`, `targetHandle` fields on each edge object

The simple-format topology grows two optional fields:
```json
{"id":"e1","source":"cb1","target":"plc1","protocol":"POWER_24V",
 "sourceHandle":"pwr-bottom","targetHandle":"pwr-top"}
```

### Frontend changes

`frontend/src/views/components/CustomNodes.tsx` — `NodeHandles`:
- Replace 4 generic handles with 8 named/colored handles
- Use protocol classifier helper to pick stroke color when AI emits an edge

`frontend/src/views/components/TopologyPanel.tsx` — `observeTopology`:
- When building the ReactFlow edge from the snapshot, set `sourceHandle`
  and `targetHandle` from the snapshot (passed through Yjs)
- Set edge `stroke` color via the same protocol→color helper

`frontend/src/models/store.ts` + `yjsStore.ts`:
- Extend `EdgeData` with optional `sourceHandle?: string; targetHandle?: string`
- Persist them through `edgeToYMap` / `yMapToEdge`

### Backwards compatibility

When `sourceHandle`/`targetHandle` are missing (older AI runs, manually-drawn
edges), fall back to the protocol→side rule via a frontend helper. Manually
drawn edges (user clicks + drags) get classified the same way and persist
the chosen handle IDs.

## Self-review

- **Placeholders**: none — all colors, IDs, file paths are concrete.
- **Internal consistency**: edge colors match handle colors match node accent
  colors (PowerNode amber → power handles orange — slight tonal difference
  but same family; deliberate to avoid clash).
- **Scope**: focused (frontend visual + 1 backend helper). No DB or graph
  topology changes.
- **Ambiguity**: "feedback bottom→top" only applies to L4 sensors → L3
  controllers per the existing 5-level layout (`y_positions = [60,160,300,460,600]`),
  matches existing `_build_fallback_topology`.

## Verification plan

1. After implementation: `npx tsc --noEmit` passes
2. After implementation: run analyze-v2 once via nginx; assert response
   topology edges contain `sourceHandle`/`targetHandle` for every protocol
3. Manual: open browser tab → see new lightning-V icon
4. Manual: regenerate canvas → power edges enter nodes from the top, network
   edges enter from the left, sensor feedback edges leave from the top
