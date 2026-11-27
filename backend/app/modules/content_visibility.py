"""Keep workstation-only publications out of the shared authenticated catalog."""

from sqlalchemy import event
from sqlalchemy.orm import with_loader_criteria

from ..models import Chapter, Concept, Exercise, Proof, Textbook


def use_shared_catalog(session):
    # Use the request's session so search, summaries, direct lookups and relationship
    # loads apply the same visibility rule. Workstation queries use explicit ownership.
    @event.listens_for(session, "do_orm_execute")
    def filter_workstation_content(execution):
        if execution.is_select:
            execution.statement = execution.statement.options(
                with_loader_criteria(Textbook, Textbook.data_origin != "user", include_aliases=True),
                with_loader_criteria(
                    Chapter, Chapter.textbook.has(Textbook.data_origin != "user"), include_aliases=True
                ),
                with_loader_criteria(Concept, Concept.scope != "local_textbook", include_aliases=True),
                with_loader_criteria(
                    Proof, Proof.concept.has(Concept.scope != "local_textbook"), include_aliases=True
                ),
                with_loader_criteria(Exercise, Exercise.source.not_in(("ai-variant", "textbook-exercise")),
                                     include_aliases=True),
            )
