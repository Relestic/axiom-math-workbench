"""Knowledge graph nodes and typed relations."""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .base import Base, IdMixin, utcnow

RELATION_TYPES = {
    "belongs_to",
    "equivalent_to",
    "prerequisite_for",
    "uses_in_proof",
    "implies",
    "example_of",
    "counterexample_to",
    "illustrates",
    "contrasts_with",
    "generalizes",
    "exercises",
}


class GraphNode(Base, IdMixin):
    __tablename__ = "graph_nodes"

    concept_id = Column(String(40), ForeignKey("concepts.id", ondelete="SET NULL"), index=True)
    classic_id = Column(String(40), ForeignKey("classics.id", ondelete="SET NULL"), index=True)
    name = Column(String(160), nullable=False)
    kind = Column(String(30), nullable=False, default="concept")
    scope = Column(String(30), nullable=False, default="mvp_core")
    description = Column(String, nullable=False, default="")
    detail = Column(String, nullable=False, default="")
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    color = Column(String(20), nullable=False, default="#829cff")
    size = Column(Integer, nullable=False, default=8)
    page = Column(Integer, nullable=True)
    week = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="published")
    source = Column(String(200), nullable=False, default="")
    review_status = Column(String(30), nullable=False, default="reviewed")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    concept = relationship("Concept")
    classic = relationship("Classic")


class GraphEdge(Base, IdMixin):
    __tablename__ = "graph_edges"
    __table_args__ = (
        UniqueConstraint("from_node_id", "to_node_id", "relation", name="uq_graph_edge"),
    )

    from_node_id = Column(
        String(40), ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    to_node_id = Column(
        String(40), ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    relation = Column(String(40), nullable=False)
    condition = Column(String, nullable=False, default="")
    evidence = Column(String, nullable=False, default="")
    source_page = Column(Integer, nullable=True)
    provenance = Column(String(30), nullable=False, default="textbook")
    review_status = Column(String(30), nullable=False, default="reviewed")
    content_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    from_node = relationship("GraphNode", foreign_keys=[from_node_id])
    to_node = relationship("GraphNode", foreign_keys=[to_node_id])
