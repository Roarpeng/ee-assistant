from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from app.core.graph.state import AnalysisState


def build_graph():
    workflow = StateGraph(AnalysisState)

    from app.core.graph.agents import (
        requirements_agent,
        category_mapper,
        safety_assessor,
        constraint_extractor,
        fanout_selection_supervisor,
        rule_validator,
        schematic_generator,
        code_generator,
        final_review_agent,
    )

    workflow.add_node("requirements_agent", requirements_agent)
    workflow.add_node("category_mapper", category_mapper)
    workflow.add_node("safety_assessor", safety_assessor)
    workflow.add_node("constraint_extractor", constraint_extractor)
    workflow.add_node("selection_supervisor", fanout_selection_supervisor)
    workflow.add_node("rule_validator", rule_validator)
    workflow.add_node("schematic_generator", schematic_generator)
    workflow.add_node("code_generator", code_generator)
    workflow.add_node("final_review_agent", final_review_agent)

    workflow.set_entry_point("requirements_agent")
    workflow.add_edge("requirements_agent", "category_mapper")
    workflow.add_edge("requirements_agent", "safety_assessor")
    workflow.add_edge("requirements_agent", "constraint_extractor")
    workflow.add_edge("category_mapper", "selection_supervisor")
    workflow.add_edge("safety_assessor", "selection_supervisor")
    workflow.add_edge("constraint_extractor", "selection_supervisor")
    workflow.add_edge("selection_supervisor", "rule_validator")
    workflow.add_edge("rule_validator", "schematic_generator")
    workflow.add_edge("rule_validator", "code_generator")
    workflow.add_edge("rule_validator", "final_review_agent")
    workflow.add_edge("schematic_generator", END)
    workflow.add_edge("code_generator", END)
    workflow.add_edge("final_review_agent", END)

    return workflow.compile(checkpointer=MemorySaver())
