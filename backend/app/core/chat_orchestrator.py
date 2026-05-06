from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, AsyncIterator

from app.core.llm_service import llm_service


@dataclass(frozen=True)
class ChatValidationResult:
    approved: bool
    reason: str


_PLACEHOLDER_PATTERNS = (
    "todo",
    "tbd",
    "稍后补充",
    "待补充",
    "占位",
    "placeholder",
)


def build_conversation_title(messages: list[dict[str, Any]], fallback: str = "New Chat") -> str:
    """Derive a short title from the first meaningful user message."""
    for message in messages:
        if message.get("role") != "user":
            continue
        content = str(message.get("content", "")).strip()
        if not content:
            continue
        first_clause = re.split(r"[\n，。！？；,.!?;]", content, maxsplit=1)[0].strip()
        title = first_clause or content
        return title[:28].strip() or fallback
    return fallback


def _canvas_terms(canvas_context: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    for node in canvas_context.get("nodes", []) or []:
        if not isinstance(node, dict):
            continue
        for key in ("label", "id", "type"):
            value = str(node.get(key, "")).strip()
            if value:
                terms.append(value)
    return terms


def validate_chat_answer(
    answer: str,
    user_input: str,
    canvas_context: dict[str, Any] | None,
) -> ChatValidationResult:
    text = answer.strip()
    lowered = text.lower()
    if not text:
        return ChatValidationResult(False, "empty answer")
    if any(pattern in lowered for pattern in _PLACEHOLDER_PATTERNS):
        return ChatValidationResult(False, "placeholder answer")
    if len(text) < 12:
        return ChatValidationResult(False, "answer too short")

    canvas_context = canvas_context or {}
    terms = _canvas_terms(canvas_context)
    if terms:
        mentions_canvas = any(term and term in text for term in terms)
        mentions_canvas = mentions_canvas or any(word in text for word in ("画布", "拓扑", "当前方案", "当前系统"))
        if not mentions_canvas:
            return ChatValidationResult(False, "canvas context not referenced")

    if user_input.strip() and len(user_input.strip()) > 4:
        # Keep this intentionally soft: engineering answers may rephrase the request,
        # but a valid answer should still be specific and not generic.
        generic_answers = ("可以", "好的", "已完成", "没问题")
        if text in generic_answers:
            return ChatValidationResult(False, "generic answer")

    return ChatValidationResult(True, "approved")


class ChatOrchestrator:
    async def stream_chat(
        self,
        project_id: str,
        user_input: str,
        history: list[dict[str, Any]] | None = None,
        canvas_context: dict[str, Any] | None = None,
        llm_config: dict[str, Any] | None = None,
        embedding_config: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        history = history or []
        canvas_context = canvas_context or {}

        llm_service.configure(chat_config=llm_config, embed_config=embedding_config)
        title = build_conversation_title([*history, {"role": "user", "content": user_input}])

        yield {"step": "已读取历史对话与画布上下文。", "node": "context_planner"}
        system_prompt = self._system_prompt()
        user_message = self._compose_user_message(user_input, history, canvas_context)

        yield {"step": "正在编排回复草案。", "node": "draft_agent"}
        raw_answer = await llm_service.chat(system_prompt, user_message, max_tokens=2048)

        # Parse JSON response to extract answer + optional topology
        answer_text, topology_data = self._parse_chat_response(raw_answer)
        validation = validate_chat_answer(answer_text, user_input=user_input, canvas_context=canvas_context)

        if not validation.approved:
            yield {
                "step": f"核准校验未通过：{validation.reason}，正在修正。",
                "node": "approval_gate",
            }
            repair_message = (
                f"{user_message}\n\n"
                f"上一版回答未通过核准，原因：{validation.reason}。\n"
                "请重新输出可直接给用户的最终回复，必须结合历史对话和画布上下文。"
            )
            raw_answer = await llm_service.chat(system_prompt, repair_message, max_tokens=2048)
            answer_text, topology_data = self._parse_chat_response(raw_answer)
            validation = validate_chat_answer(answer_text, user_input=user_input, canvas_context=canvas_context)

        if validation.approved:
            yield {"step": "核准校验通过，准备输出。", "node": "approval_gate"}
        else:
            answer_text = self._fallback_answer(user_input, canvas_context, validation.reason)
            topology_data = None
            validation = validate_chat_answer(answer_text, user_input=user_input, canvas_context=canvas_context)
            yield {"step": "已使用保守工程回复兜底。", "node": "approval_gate"}

        payload: dict[str, Any] = {
            "answer": answer_text.strip(),
            "approved": validation.approved,
            "review_reason": validation.reason,
            "title": title,
            "project_id": project_id,
        }
        if topology_data:
            payload["topology"] = topology_data
            yield {"step": f"已识别 {len(topology_data.get('nodes', []))} 个拓扑节点。", "node": "topology_sync"}

        yield {
            "done": True,
            "payload": payload,
        }

    def _system_prompt(self) -> str:
        return """你是电气工程设计助手的后台对话 Agent 编排器。

目标：
1. 像主流 LLM 对话产品一样给出清晰、可继续追问的回答。
2. 优先回答用户当前问题；涉及工程设计时给出可执行步骤、风险点和下一步建议。
3. 如果提供了画布上下文，必须引用当前画布中的关键元器件、拓扑或 BOM 信息。
4. 输出前执行核准校验：不得输出空泛答复、占位内容、未核对画布的结论或未经说明的选型断言。

CRITICAL — 你必须在每次回复中识别用户确认或讨论的电气元器件，并返回结构化拓扑数据。
当用户在对话中提及、确认、修改、或讨论某个元器件时（例如 "加一个PLC"、"用西门子S7-1200"、"再加一个断路器"），你必须：
1. 在 answer 中正常回复用户
2. 在 topology 字段中提供该元器件在拓扑图中的定义

输出格式：严格的 JSON，不要包含 markdown 代码块标记：
{
  "answer": "你的中文回复内容...",
  "topology": {
    "nodes": [
      {"id": "plc_1", "type": "plc", "label": "S7-1200 CPU 1214C", "x": 250, "y": 200, "status": "ok"}
    ],
    "edges": [
      {"id": "e_plc_1_hmi_1", "source": "plc_1", "target": "hmi_1", "protocol": "PROFINET"}
    ]
  }
}

拓扑节点类型(type)只能是以下之一：plc, hmi, io, vfd, servo, power, switch, safety_relay, sensor, ipc, safety_plc, circuit_breaker, contactor, relay, estop, transformer, fuse, disconnect

如果本轮对话没有涉及新的元器件，topology 字段设为 null。
如果画布中已有节点，新增的 edges 应连接到已有的节点 ID。
生成节点时，x/y 坐标按电气布局习惯排列（电源在上、PLC居中、IO在下、执行器在右侧），避免重叠。"""

    @staticmethod
    def _parse_chat_response(raw: str) -> tuple[str, dict[str, Any] | None]:
        """Parse the LLM JSON response into (answer_text, topology_data_or_None).

        Robust extraction: finds the JSON object anywhere in the response text,
        handles markdown code fences, and falls back to raw text if parsing fails.
        """
        text = raw.strip()

        # Strip markdown code fences from anywhere in the text
        text = re.sub(r'^```(?:json)?\s*\n', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n```\s*$', '', text, flags=re.MULTILINE)

        # Try to find and extract the JSON object: look for {"answer"
        json_start = text.find('{"answer"')
        if json_start >= 0:
            # Find matching closing brace by counting
            depth = 0
            json_end = -1
            for i in range(json_start, len(text)):
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        json_end = i + 1
                        break
            if json_end > json_start:
                json_candidate = text[json_start:json_end]
                try:
                    data = json.loads(json_candidate)
                    answer = str(data.get("answer", ""))
                    topology = data.get("topology")
                    if isinstance(topology, dict) and topology.get("nodes"):
                        return answer, topology
                    return answer, None
                except (json.JSONDecodeError, TypeError, AttributeError):
                    pass

        # Fallback: try parsing the entire text as JSON (after fence stripping)
        try:
            data = json.loads(text)
            answer = str(data.get("answer", ""))
            topology = data.get("topology")
            if isinstance(topology, dict) and topology.get("nodes"):
                return answer, topology
            return answer, None
        except (json.JSONDecodeError, TypeError, AttributeError):
            return raw.strip(), None

    def _compose_user_message(
        self,
        user_input: str,
        history: list[dict[str, Any]],
        canvas_context: dict[str, Any],
    ) -> str:
        safe_history = [
            {
                "role": str(item.get("role", "")),
                "content": str(item.get("content", ""))[:1200],
            }
            for item in history[-12:]
            if isinstance(item, dict) and item.get("content")
        ]
        return (
            f"用户当前输入：\n{user_input}\n\n"
            f"历史对话：\n{json.dumps(safe_history, ensure_ascii=False)}\n\n"
            f"画布上下文：\n{json.dumps(canvas_context or {}, ensure_ascii=False)}\n\n"
            "请基于以上内容回复。"
        )

    def _fallback_answer(
        self,
        user_input: str,
        canvas_context: dict[str, Any],
        reason: str,
    ) -> str:
        labels = [
            str(node.get("label") or node.get("id"))
            for node in canvas_context.get("nodes", []) or []
            if isinstance(node, dict) and (node.get("label") or node.get("id"))
        ]
        canvas_part = f"当前画布包含：{', '.join(labels[:6])}。" if labels else "当前没有可用画布节点。"
        return (
            f"我已收到你的问题：{user_input.strip()}。\n"
            f"{canvas_part}\n"
            f"为避免输出未经核准的结论，本次回答先按保守方式处理（校验原因：{reason}）。"
            "建议先确认需求边界、关键元器件、供电与安全回路，再继续生成或修改画布。"
        )


chat_orchestrator = ChatOrchestrator()
