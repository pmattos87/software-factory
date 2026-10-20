# Software Factory

The Factory: Pedro's development Workflow, packaged as a Claude Code plugin that Consumer projects install. Domain language is in [CONTEXT.md](CONTEXT.md).

## Where things are

- `docs/spec/`: the high-level spec. [map.md](docs/spec/map.md) is the entry point, and the resolved decision tickets are in `issues/`.
- `docs/spec/issues/09-build-order.md`: the phased build order (phases 0-6) with each phase's "Proven when" check.
- `docs/reference/`: mockups and throwaway prototypes.

Each phase's detail is planned when that phase starts, not up front.

## Issue tracking

Flowboard board: **SF** (project "Software Factory").

- One Story per build phase, labelled `phase-<N>`. A phase's own tasks are added when its planning starts.
- Move a phase's Story to `in_progress` when its work starts, and to `done` once its exit gate passes: the "Proven when" scenario has passed on Flowboard, legacy projects and user-level skills still behave as before, and Pedro has signed off.
- A defect found mid-phase is filed as a `bug` in `refining`.

Code for phase 1, the Flowboard side of phase 6 and the Run-tracking UI goes in the Flowboard repo; this board still tracks each phase as a whole.
