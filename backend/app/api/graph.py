"""Knowledge graph endpoints."""

from __future__ import annotations

from flask import Blueprint

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import parse_query
from ..schemas.content import GraphPathQuery, GraphQuery
from ..modules import graph_service

bp = Blueprint("graph", __name__, url_prefix="/api/v1/graph")


@bp.get("")
@require_auth()
def graph():
    query = parse_query(GraphQuery)
    session = get_session()
    return graph_service.graph(
        session,
        current_user(),
        scope=query.scope,
        include_examples=query.include_examples,
        include_extensions=query.include_extensions,
        unlocked_only=query.unlocked_only,
        relation=query.relation,
    )


@bp.get("/gaps")
@require_auth()
def gaps():
    session = get_session()
    return graph_service.gaps(session, current_user())


@bp.get("/nodes/<node_id>")
@require_auth()
def node(node_id: str):
    session = get_session()
    return graph_service.node_detail(session, current_user(), node_id)


@bp.get("/path")
@require_auth()
def path():
    query = parse_query(GraphPathQuery)
    session = get_session()
    return graph_service.path(
        session,
        current_user(),
        query.from_node,
        query.to_node,
        query.max_depth,
    )
