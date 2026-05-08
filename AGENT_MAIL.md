# Agent Mail

Boltwall Suite uses MCP Agent Mail for agent identity, inboxes, threaded coordination, and file reservations.

## Project

- Tool calls use `project_key=<repo-root>`, where `<repo-root>` is the absolute path to the local checkout.
- Resource URIs may use the project slug returned by `ensure_project`; do not hard-code machine-specific slugs in committed docs.

## Session Start

Every agent must run these before Beads triage:

1. `ensure_project(human_key=<repo-root>)`
2. `register_agent(project_key=<repo-root>, ...)`
3. `fetch_inbox(project_key=<repo-root>, agent_name=<registered-name>)`
4. `bv --robot-triage`

## File Reservations

Before editing files for a bead:

1. Claim with `br update <id> --claim --actor <agent-name>`.
2. Reserve the narrowest paths with `file_reservation_paths`.
3. Send a start message using `thread_id="<id>"`.
4. Release reservations after closing or handing off the bead.

Use Agent Mail for coordination only. Beads remains the source of truth for issue status, priority, dependencies, and ownership.
