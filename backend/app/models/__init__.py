"""SQLAlchemy model registry.

Importing this package registers every table on ``Base.metadata``. Alembic-style
migrations in ``backend/migrations`` use the same metadata.
"""

from .base import Base, isoformat, new_id, utcnow  # noqa: F401
from .content import (  # noqa: F401
    Asset,
    Chapter,
    Classic,
    Concept,
    ContentRevision,
    Proof,
    Proposition,
    Section,
    Textbook,
    Tool,
)
from .graph import RELATION_TYPES, GraphEdge, GraphNode  # noqa: F401
from .learning import (  # noqa: F401
    Attempt,
    AttemptEvent,
    Bookmark,
    CourseProgress,
    DiagnosticQuestion,
    DiagnosticRun,
    Exercise,
    ExerciseTemplate,
    Note,
    StudyEvent,
)
from .ops import (  # noqa: F401
    AuditLog,
    IdempotencyRecord,
    Job,
    ModelCall,
    Report,
)
from .users import AuthEvent, Invite, RefreshToken, User  # noqa: F401
from .visual import (  # noqa: F401
    Conversation,
    ConversationMessage,
    Observation,
    SceneVersion,
    VisualScene,
    VisualTemplate,
)

__all__ = [
    "Base",
    "User",
    "Invite",
    "RefreshToken",
    "AuthEvent",
    "Textbook",
    "Chapter",
    "Section",
    "Concept",
    "Proof",
    "Proposition",
    "Classic",
    "Tool",
    "Asset",
    "ContentRevision",
    "GraphNode",
    "GraphEdge",
    "RELATION_TYPES",
    "VisualTemplate",
    "VisualScene",
    "SceneVersion",
    "Observation",
    "Conversation",
    "ConversationMessage",
    "ExerciseTemplate",
    "Exercise",
    "Attempt",
    "AttemptEvent",
    "Note",
    "Bookmark",
    "StudyEvent",
    "CourseProgress",
    "DiagnosticQuestion",
    "DiagnosticRun",
    "Job",
    "ModelCall",
    "Report",
    "IdempotencyRecord",
    "AuditLog",
]
