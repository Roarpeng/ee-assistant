import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_save_and_confirm_project_topology():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_resp = await client.post("/api/projects?name=Topology%20Project")
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        topology = {
            "nodes": [
                {
                    "id": "plc-1",
                    "type": "plc",
                    "label": "S7-1200 CPU",
                    "x": 120,
                    "y": 240,
                    "details": {"component_category": "PLC_CPU"},
                },
                {
                    "id": "psu-1",
                    "type": "power",
                    "label": "24VDC PSU",
                    "x": 120,
                    "y": 80,
                },
            ],
            "edges": [
                {
                    "id": "e-psu-plc",
                    "source": "psu-1",
                    "target": "plc-1",
                    "protocol": "POWER_24VDC",
                }
            ],
        }

        save_resp = await client.post(
            f"/api/projects/{project_id}/topology",
            json={"snapshot": topology, "source": "user"},
        )
        assert save_resp.status_code == 201
        saved = save_resp.json()
        assert saved["project_id"] == project_id
        assert saved["version"] == 1
        assert saved["status"] == "draft"
        assert saved["snapshot"]["nodes"][0]["id"] == "plc-1"

        get_resp = await client.get(f"/api/projects/{project_id}/topology")
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == saved["id"]

        confirm_resp = await client.post(f"/api/projects/{project_id}/topology/confirm")
        assert confirm_resp.status_code == 200
        confirmed = confirm_resp.json()
        assert confirmed["status"] == "confirmed"
        assert confirmed["confirmed_at"] is not None


@pytest.mark.asyncio
async def test_get_project_topology_requires_existing_project():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/projects/missing/topology")

    assert response.status_code == 404
