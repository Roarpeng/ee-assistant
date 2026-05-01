import pytest
from app.core.schemas import RequirementInput, IOItemOut, IOType, BOMItemOut, ConfidenceLevel


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
