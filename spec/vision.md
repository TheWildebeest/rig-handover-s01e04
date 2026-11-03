# Vision

See `docs/vision.md`. rig keeps a lane's lights on: heartbeat, one status board, and a morning digest of the night's run log. It stays small: no scheduler, no database, no secrets, no client JS.

## Product principles

- Pages are read slowly by humans and agents; a fetch and a screenshot must match (ADR 0001).
- Missing data renders as `—`, never dropped.

## Current direction

- Build `plan.md` (morning digest), one GitHub issue per worker.
