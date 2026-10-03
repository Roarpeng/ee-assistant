"""SVG rendering determinism + API tests for schematic v2."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.schematic import build_schematic, render_document


def _doc():
    topology = {
        "nodes": [
            {"id": "n_qf", "type": "circuit_breaker", "label": "QF"},
            {"id": "n_km1", "type": "contactor", "label": "KM1"},
            {"id": "n_m1", "type": "motor", "label": "M1"},
            {"id": "n_estop", "type": "estop", "label": "急停"},
            {"id": "n_kf", "type": "safety_relay", "label": "KF"},
        ],
        "edges": [
            {"id": "e1", "source": "n_qf", "target": "n_km1", "protocol": "POWER_220V"},
            {"id": "e2", "source": "n_km1", "target": "n_m1", "protocol": "POWER_220V"},
        ],
    }
    wiring = [{"tag": "PLC.DI0", "signal": "传感器", "from": "X1.1", "to": "PLC.DI0", "wire": "0.75 mm² 黑"}]
    return build_schematic(topology, [], {"safety_level": "SIL2"}, wiring, project_id="px")


def test_render_document_deterministic():
    doc = _doc()
    first = render_document(doc)
    second = render_document(_doc())
    assert first == second


def test_svg_contains_frame_title_and_wires():
    doc = _doc()
    doc.project_name = "测试项目"
    svgs = dict(render_document(doc))
    power_svg = next(svg for page, svg in svgs.items() if page == 1)
    assert power_svg.startswith("<svg")
    assert "测试项目" in power_svg
    assert "主回路" in power_svg
    assert power_svg.count("<polyline") >= 10
    assert "L1" in power_svg  # phase labels
    io_svg = svgs[max(svgs)]
    assert "PLC" in io_svg and "X_TERMINAL" not in io_svg  # rendered, not raw keys


def test_page_kind_badges_present():
    svgs = dict(render_document(_doc()))
    control = svgs[2]
    assert "CONTROL CIRCUIT" in control
    io = svgs[3]
    assert "TERMINAL / IO" in io


# ── API ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_schematic_pages_derived_on_topology_confirm():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_resp = await client.post("/api/projects?name=Schematic%20E2E")
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        topology = {
            "nodes": [
                {"id": "qf", "type": "circuit_breaker", "label": "QF", "x": 10, "y": 10},
                {"id": "km1", "type": "contactor", "label": "KM1", "x": 200, "y": 200},
                {"id": "m1", "type": "motor", "label": "M1", "x": 400, "y": 400},
            ],
            "edges": [
                {"id": "e1", "source": "qf", "target": "km1", "protocol": "POWER_220V"},
                {"id": "e2", "source": "km1", "target": "m1", "protocol": "POWER_220V"},
            ],
        }
        save = await client.post(f"/api/projects/{project_id}/topology",
                                 json={"snapshot": topology, "source": "user"})
        assert save.status_code == 201

        confirm = await client.post(f"/api/projects/{project_id}/topology/confirm")
        assert confirm.status_code == 200  # derivation hook must never break confirm

        pages = await client.get(f"/api/projects/{project_id}/schematic/pages")
        assert pages.status_code == 200
        body = pages.json()
        assert len(body["pages"]) >= 2  # power + control
        assert any(p["kind"] == "power" for p in body["pages"])
        assert all(p["svg"] for p in body["pages"])


@pytest.mark.asyncio
async def test_regenerate_idempotent_and_single_page_fetch():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_resp = await client.post("/api/projects?name=Schematic%20Regen")
        project_id = project_resp.json()["id"]
        topology = {"nodes": [{"id": "km", "type": "contactor", "label": "KM", "x": 0, "y": 0}],
                    "edges": []}
        await client.post(f"/api/projects/{project_id}/topology",
                          json={"snapshot": topology, "source": "user"})

        first = await client.post(f"/api/projects/{project_id}/schematic/pages")
        assert first.status_code == 200
        n1 = len(first.json()["pages"])
        again = await client.post(f"/api/projects/{project_id}/schematic/pages")
        assert again.status_code == 200
        assert len(again.json()["pages"]) == n1  # delete-then-insert, no duplicates

        page1 = await client.get(f"/api/projects/{project_id}/schematic/pages/1")
        assert page1.status_code == 200
        assert page1.json()["page_no"] == 1

        missing = await client.get(f"/api/projects/{project_id}/schematic/pages/99")
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_pages_404_without_topology_or_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_resp = await client.post("/api/projects?name=Empty")
        project_id = project_resp.json()["id"]
        no_topo = await client.get(f"/api/projects/{project_id}/schematic/pages")
        assert no_topo.status_code == 404

        no_regen = await client.post(f"/api/projects/{project_id}/schematic/pages")
        assert no_regen.status_code == 404

        ghost = await client.get("/api/projects/missing/schematic/pages")
        assert ghost.status_code == 404
