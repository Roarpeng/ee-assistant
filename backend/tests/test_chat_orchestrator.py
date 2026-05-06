import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.chat_orchestrator import (
    build_conversation_title,
    validate_chat_answer,
)


def test_build_conversation_title_uses_first_meaningful_user_message():
    messages = [
        {"role": "assistant", "content": "欢迎使用"},
        {"role": "user", "content": "请帮我设计一套带急停和两台电机的输送线控制系统，需要S7-1200。"},
    ]

    assert build_conversation_title(messages, fallback="New Project") == "请帮我设计一套带急停和两台电机的输送线控制系统"


def test_validate_chat_answer_rejects_empty_or_placeholder_output():
    result = validate_chat_answer("", user_input="设计输送线", canvas_context={})
    assert result.approved is False
    assert "empty" in result.reason

    result = validate_chat_answer("TODO: 稍后补充。", user_input="设计输送线", canvas_context={})
    assert result.approved is False
    assert "placeholder" in result.reason


def test_validate_chat_answer_requires_canvas_reference_when_canvas_is_used():
    canvas_context = {"nodes": [{"id": "plc-1", "label": "S7-1200 CPU"}], "edges": []}

    result = validate_chat_answer("可以继续完善这套控制方案。", user_input="继续优化当前画布", canvas_context=canvas_context)

    assert result.approved is False
    assert "canvas" in result.reason


@pytest.mark.asyncio
async def test_chat_endpoint_streams_validated_answer(monkeypatch):
    async def fake_chat(system_prompt: str, user_message: str, max_tokens: int | None = None) -> str:
        assert "核准" in system_prompt
        assert "历史对话" in user_message
        assert "画布上下文" in user_message
        return "我会基于当前画布中的 S7-1200 CPU 继续优化：先核对电源与安全回路，再补充 IO 模块和急停链路。"

    monkeypatch.setattr("app.core.chat_orchestrator.llm_service.chat", fake_chat)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        project_resp = await client.post("/api/projects?name=New%20Project")
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        resp = await client.post(
            f"/api/projects/{project_id}/chat",
            json={
                "text": "继续优化当前画布",
                "history": [{"role": "user", "content": "设计输送线"}],
                "canvas_context": {
                    "nodes": [{"id": "plc-1", "label": "S7-1200 CPU", "type": "plc"}],
                    "edges": [],
                },
            },
        )

    assert resp.status_code == 200
    lines = [
        line.removeprefix("data: ")
        for line in resp.text.splitlines()
        if line.startswith("data: ")
    ]
    events = [json.loads(line) for line in lines]
    assert any(event.get("step") == "核准校验通过，准备输出。" for event in events)
    done = next(event for event in events if event.get("done"))
    assert done["payload"]["approved"] is True
    assert done["payload"]["title"] == "设计输送线"
    assert "S7-1200" in done["payload"]["answer"]
