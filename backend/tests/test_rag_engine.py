import pytest
from unittest.mock import AsyncMock, patch
from app.core.rag_engine import RAGEngine


@pytest.mark.asyncio
async def test_search_constructs_correct_filter():
    with patch.object(RAGEngine, 'embed', return_value=[[0.1] * 1536]):
        engine = RAGEngine()
        engine.qdrant = AsyncMock()
        engine.qdrant.search = AsyncMock(return_value=[])

        await engine.search("breaker for 5kW motor", category_filter=["Circuit_Breaker"], manufacturer_filter="Siemens")
        assert engine.qdrant.search.called
