# Backend business modules

The Flask API keeps transport in `app/api/` and domain services in `app/modules/`.
This mapping is the backend side of the six-module boundary in the repository
root `MODULES.md`.

| Business module | Services | API surface | Write ownership |
| --- | --- | --- | --- |
| Teaching content | `content_service.py` | `api/catalog.py`, content admin endpoints | content/admin; everyone else reads |
| Visualization | `visual_service.py`, `surface_service.py` | `api/visual.py`, `api/ai.py` plot/surface | scene owner; AI returns candidates only |
| Practice & review | `exercise_service.py` | `api/exercises.py` | Exercise/Attempt; user owns own attempts |
| Learning progress | `progress_service.py`, `graph_service.py` | `api/progress.py`, `api/graph.py`, diagnostic | progress owns derived state; reads Attempts |
| Personal records | note/bookmark handlers | `api/notes.py`, visual observations | record owner; only own records |
| Identity & access | auth/authorization helpers | `api/auth.py`, `api/admin.py` | User/Session/Invite; all modules enforce ownership |

Shared capabilities:

- `adapters/llm.py` — provider connection, timeout, error shaping, usage calls.
- `adapters/math.py` — expression parsing, symbolic/numeric checks.
- `db.py`, `models/` — transactions and persistence.
- `openapi.py` — schema-to-route contract publication.

Rules:

- A service must not write another module's tables; cross-module effects happen
  through the owning service command or a domain event.
- API routes do authorization and return the shared error envelope; services
  raise `ApiError`.
- A field change requires Pydantic schema + serializer + frontend DTO + contract
  test in the same task (see `docs/contracts.md`).
