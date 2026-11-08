---
id: google-gws-mcp
name: google-gws-mcp
description: Operates the google-gws-mcp CLI (echo, render-json, status, workspaces :id delete, workspaces :id get, and 4 more). Use when the user mentions google-gws-mcp, echo, render-json, status, or related tasks.
enabled: true
---

# google-gws-mcp

Call any Google Workspace API (Gmail, Calendar, Drive, Docs, Sheets, People, Tasks…) through the gws CLI over MCP. (Zod schemas, typed commands, REST CRUD)

## Execution

Invoke via shell:

```bash
google-gws-mcp <subcommand> [options] [args]
```

## Options & Help Discovery

- Run `google-gws-mcp <subcommand> --help` to inspect flags, choices, and positional arguments before running unfamiliar subcommands.
- Run `google-gws-mcp --help` at the root for top-level options and command routing.

## Commands

- **`google-gws-mcp echo`** — Echo a message (MCP-friendly command).
- **`google-gws-mcp render-json`** — Echo a JSON message (schema-first JSON command demo).
- **`google-gws-mcp status`** — Show app version.
- **`google-gws-mcp workspaces :id delete`** — Delete a workspace.
- **`google-gws-mcp workspaces :id get`** — Get one workspace.
- **`google-gws-mcp workspaces :id patch`** — Patch a workspace name.
- **`google-gws-mcp workspaces :id put`** — Replace a workspace.
- **`google-gws-mcp workspaces get`** — List workspaces.
- **`google-gws-mcp workspaces post`** — Create a workspace.

## Workflow & Pitfalls

- Always run `google-gws-mcp <subcommand> --help` instead of guessing options or reading large doc files.
- Pass `--` before arguments that look like flags.
- Pass `--json` when machine-readable structured output is supported.

## Install location

- **Agent plugin:** plugins built with `google-gws-mcp mcp bundle` ship this skill.
- **Manual:** copy or symlink `skills/google-gws-mcp/` into your agent's skill directory (for example `~/.agents/skills/google-gws-mcp/` or `~/.claude/skills/google-gws-mcp/`).
