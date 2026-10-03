import pytest
from app.core.schemas import (
    RequirementInput,
    IOItemOut,
    IOType,
    BOMItemOut,
    ConfidenceLevel,
    ModuleType,
    STModuleOut,
    ProjectOut,
)


def test_requirement_input_defaults():
    req = RequirementInput(text="3 motors with E-Stop")
    assert req.plc_family == "S7-1200"
    assert req.machine_type is None


def test_io_item_serialization():
    item = IOItemOut(id="1", tag="M1_START", io_type=IOType.DI, description="Start button")
    data = item.model_dump()
    assert data["io_type"] == "DI"


def test_bom_item_confidence_enum():
    item = BOMItemOut(
        id="1", category="Breaker", manufacturer="Siemens",
        model="3RV2021-1DA10", quantity=1, specifications={},
        confidence=ConfidenceLevel.RAG, source_chunk_id="chunk-1", alternatives=[]
    )
    assert item.confidence == ConfidenceLevel.RAG


def test_eplan_xml_module_serializes_in_project_out():
    """Regression: v2 code_generator stores EPlan XML as STModule with
    module_type='XML'. ProjectOut (projects list/detail + codegen response)
    must serialize it — the ModuleType enum has to accept XML or every
    endpoint listing such a project fails validation."""
    module = STModuleOut(
        id="m1", name="EPlan_Wiring.xml",
        module_type=ModuleType.XML, code="<EPLAN/>", sort_order=0,
    )
    project = ProjectOut(
        id="p1", name="Conveyor", status="done", code_modules=[module],
        created_at="2026-05-26T00:00:00Z", updated_at="2026-05-26T00:00:00Z",
    )
    assert project.model_dump()["code_modules"][0]["module_type"] == "XML"
