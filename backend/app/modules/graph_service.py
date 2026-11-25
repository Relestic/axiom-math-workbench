"""Knowledge-graph queries enriched with per-user progress state."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import Attempt, Concept, Exercise, GraphEdge, GraphNode, User
from ..serializers import graph_edge_out, graph_node_out
from .content_service import get_progress

PREREQUISITE_RELATIONS = {"prerequisite_for", "uses_in_proof", "implies"}


def mastery_map(session: Session, user: User) -> dict[str, float]:
    rows = session.execute(
        select(Attempt, Exercise)
        .join(Exercise, Exercise.id == Attempt.exercise_id)
        .where(Attempt.user_id == user.id)
    ).all()
    buckets: dict[str, list[float]] = defaultdict(list)
    for attempt, exercise in rows:
        assistance = attempt.assistance or {}
        if attempt.self_rating == "understood":
            weight = 1.0
        elif attempt.self_rating == "pending":
            weight = 0.35
        else:
            weight = 0.1
        if assistance.get("solution_viewed"):
            weight *= 0.35
        if assistance.get("hints_used"):
            weight *= 0.8
        buckets[exercise.topic_id].append(max(0.0, min(1.0, weight)))
    return {
        topic: round(sum(values) / len(values) * 100, 1)
        for topic, values in buckets.items()
        if values
    }


def _node_state(
    node: GraphNode,
    *,
    mastery: dict[str, float],
    current_concept: str | None,
    week: int,
) -> str:
    if node.scope == "v1_extension" or node.kind == "extension":
        return "locked_extension"
    if node.kind == "case":
        return "counterexample"
    if node.concept_id == current_concept:
        return "current"
    score = mastery.get(node.concept_id or "", 0.0)
    if score >= 60:
        return "mastered"
    if node.week is None or node.week <= week:
        return "unlocked_not_started"
    return "locked"


def _gap_analysis(
    session: Session,
    user: User,
    nodes: dict[str, GraphNode],
    edges: list[GraphEdge],
    mastery: dict[str, float],
    current_concept: str | None,
) -> list[dict[str, Any]]:
    incoming: dict[str, list[GraphEdge]] = defaultdict(list)
    for edge in edges:
        if edge.relation in PREREQUISITE_RELATIONS:
            incoming[edge.to_node_id].append(edge)
    active_targets = {
        node.id
        for node in nodes.values()
        if node.concept_id == current_concept
        or mastery.get(node.concept_id or "", 0) > 0
    }
    references: dict[str, set[str]] = defaultdict(set)
    for target_id in active_targets:
        for edge in incoming.get(target_id, []):
            references[edge.from_node_id].add(target_id)
    gaps: list[dict[str, Any]] = []
    for node_id, targets in references.items():
        node = nodes.get(node_id)
        if node is None or node.kind in {"case", "extension"}:
            continue
        if mastery.get(node.concept_id or "", 0) >= 60:
            continue
        gaps.append(
            {
                "node_id": node_id,
                "name": node.name,
                "concept_id": node.concept_id,
                "week": node.week,
                "page": node.page,
                "mastery": mastery.get(node.concept_id or "", 0),
                "reference_count": len(targets),
                "referenced_by": [
                    nodes[target].name for target in sorted(targets) if target in nodes
                ],
            }
        )
    gaps.sort(key=lambda item: (-item["reference_count"], item["name"]))
    return gaps


def graph(
    session: Session,
    user: User,
    *,
    scope: str = "course",
    include_examples: bool = True,
    include_extensions: bool = False,
    unlocked_only: bool = False,
    relation: str | None = None,
) -> dict[str, Any]:
    progress = get_progress(session, user)
    mastery = mastery_map(session, user)
    nodes = {node.id: node for node in session.scalars(select(GraphNode))}
    edges = list(session.scalars(select(GraphEdge)))
    current_concept = progress.last_concept_id or "uniform"

    visible = {}
    for node in nodes.values():
        if node.kind == "case" and not include_examples:
            continue
        if node.scope == "v1_extension" and not include_extensions:
            continue
        if scope == "course" and node.kind == "extension" and not include_extensions:
            continue
        if unlocked_only and node.week is not None and node.week > progress.week and node.kind != "case":
            continue
        visible[node.id] = node
    visible_edges = [
        edge
        for edge in edges
        if edge.from_node_id in visible
        and edge.to_node_id in visible
        and (relation is None or edge.relation == relation)
    ]
    states = {
        node_id: _node_state(
            node,
            mastery=mastery,
            current_concept=current_concept,
            week=progress.week,
        )
        for node_id, node in visible.items()
    }
    gaps = _gap_analysis(session, user, visible, visible_edges, mastery, current_concept)
    return {
        "nodes": [
            graph_node_out(node, state=states[node.id])
            for node in sorted(visible.values(), key=lambda item: item.name)
        ],
        "edges": [graph_edge_out(edge) for edge in visible_edges],
        "stats": {
            "nodes": len(visible),
            "edges": len(visible_edges),
            "mastered": sum(1 for state in states.values() if state == "mastered"),
            "gaps": len(gaps),
            "current_node_id": next(
                (
                    node.id
                    for node in visible.values()
                    if node.concept_id == current_concept
                ),
                None,
            ),
        },
        "gaps": gaps,
        "current_concept_id": current_concept,
        "legend": {
            "current": "当前学习",
            "mastered": "已掌握",
            "unlocked_not_started": "已解锁未学",
            "locked": "未解锁",
            "locked_extension": "正式版拓展",
            "counterexample": "反例",
        },
    }


def node_detail(session: Session, user: User, node_id: str) -> dict[str, Any]:
    node = session.get(GraphNode, node_id)
    if node is None:
        raise ApiError("not_found", "图谱节点不存在")
    progress = get_progress(session, user)
    mastery = mastery_map(session, user)
    state = _node_state(
        node,
        mastery=mastery,
        current_concept=progress.last_concept_id,
        week=progress.week,
    )
    nodes = {item.id: item for item in session.scalars(select(GraphNode))}
    incoming = list(
        session.scalars(select(GraphEdge).where(GraphEdge.to_node_id == node.id))
    )
    outgoing = list(
        session.scalars(select(GraphEdge).where(GraphEdge.from_node_id == node.id))
    )

    def edge_row(edge: GraphEdge, direction: str) -> dict[str, Any]:
        other_id = edge.from_node_id if direction == "in" else edge.to_node_id
        other = nodes.get(other_id)
        other_concept = other.concept_id if other else None
        return {
            **graph_edge_out(edge),
            "direction": direction,
            "other_id": other_id,
            "other_name": other.name if other else other_id,
            "other_state": (
                _node_state(
                    other,
                    mastery=mastery,
                    current_concept=progress.last_concept_id,
                    week=progress.week,
                )
                if other
                else None
            ),
            "other_mastered": mastery.get(other_concept or "", 0) >= 60,
        }

    data = graph_node_out(node, state=state)
    data.update(
        {
            "incoming": [edge_row(edge, "in") for edge in incoming],
            "outgoing": [edge_row(edge, "out") for edge in outgoing],
            "mastery": mastery.get(node.concept_id or "", 0),
            "prerequisites": [
                edge_row(edge, "in")
                for edge in incoming
                if edge.relation in PREREQUISITE_RELATIONS
            ],
            "supports": [edge_row(edge, "out") for edge in outgoing],
            "concept": None,
            "classic": None,
        }
    )
    if node.concept_id:
        concept = session.get(Concept, node.concept_id)
        if concept:
            data["concept"] = {
                "id": concept.id,
                "name": concept.name,
                "summary": concept.summary,
                "page_start": concept.page_start,
                "page_end": concept.page_end,
            }
    if node.classic_id:
        from ..models import Classic

        classic = session.get(Classic, node.classic_id)
        if classic:
            data["classic"] = {
                "id": classic.id,
                "name": classic.name,
                "kind": classic.kind,
                "refutes_proposition_id": classic.refutes_proposition_id,
            }
    return data


def gaps(session: Session, user: User) -> dict[str, Any]:
    data = graph(session, user, scope="course", include_examples=True)
    return {
        "gaps": data["gaps"],
        "stats": data["stats"],
        "notice": "前置缺口按当前学习记录的掌握度计算；不是能力标签。",
    }


def path(session: Session, user: User, from_node: str, to_node: str, max_depth: int = 6) -> dict[str, Any]:
    nodes = {node.id: node for node in session.scalars(select(GraphNode))}
    if from_node not in nodes or to_node not in nodes:
        raise ApiError("not_found", "路径端点不存在")
    edges = list(session.scalars(select(GraphEdge)))
    adjacency: dict[str, list[GraphEdge]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.from_node_id].append(edge)
    queue = deque([(from_node, [from_node], [])])
    visited = {from_node}
    found: tuple[list[str], list[GraphEdge]] | None = None
    while queue:
        current, node_path, edge_path = queue.popleft()
        if current == to_node:
            found = (node_path, edge_path)
            break
        if len(node_path) - 1 >= max_depth:
            continue
        for edge in adjacency.get(current, []):
            if edge.to_node_id in visited:
                continue
            visited.add(edge.to_node_id)
            queue.append((edge.to_node_id, node_path + [edge.to_node_id], edge_path + [edge]))
    if found is None:
        raise ApiError("not_found", "两个节点之间没有可追溯的有向依赖路径")
    node_path, edge_path = found
    return {
        "from": from_node,
        "to": to_node,
        "steps": [
            {
                "node_id": node_id,
                "name": nodes[node_id].name,
                "page": nodes[node_id].page,
                "edge": graph_edge_out(edge_path[index]) if index < len(edge_path) else None,
            }
            for index, node_id in enumerate(node_path)
        ],
        "edges": [graph_edge_out(edge) for edge in edge_path],
        "notice": "路径只表示已审核的有向依赖；连线不等于逻辑等价。",
    }
