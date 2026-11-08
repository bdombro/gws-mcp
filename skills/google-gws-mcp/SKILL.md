---
id: google-gws-mcp
name: google-gws-mcp
description: Call any Google Workspace API (Gmail, Calendar, Drive, Docs, Sheets, People/Contacts, Tasks, Chat, Forms, Keep, Meet…) through the gws CLI via the google-gws-mcp tools call, schema, gmail_message and gmail_thread. Use when reading or changing Google data and no more specific tool fits.
enabled: true
---

# google-gws-mcp

MCP tools over the `gws` Google Workspace CLI. Same commands on the CLI: `google-gws-mcp <command>`.

## Tools

- **`call`** — any API method. Body: `service` (e.g. `gmail`, `calendar`, `drive`, `people`, `tasks`), `resource` (path array, e.g. `["users","messages"]`), `method` (e.g. `list`, `get`, `insert`), `params` (path + query), optional `body` (POST/PATCH/PUT), `fields`, `pageAll`, `pageLimit`. Can write: sending mail, deleting files, editing events. Confirm with the user before any write.
- **`schema`** — `method: "service.resource.method"` (e.g. `gmail.users.messages.list`, `people.people.connections.list`, `tasks.tasks.insert`) returns parameters and request/response shapes. Use it before an unfamiliar `call`.
- **`gmail_message`** — `id`: readable headers, text body, attachments, labels, threadId.
- **`gmail_thread`** — `id` (threadId): the same for every message.
- **`status`** — version and gws profile.

## Workflow

1. Find the method with `schema` (service, resource path, required params).
2. `call` with a `fields` mask (e.g. `"messages(id,threadId),nextPageToken"`, `"files(id,name,mimeType)"`, `"connections(names,emailAddresses)"`) and a small `maxResults`/`pageSize`.
3. Read email with `gmail_message` / `gmail_thread` instead of decoding `call` payloads.

## Pitfalls

- Results over 100 KB come back as `{ truncated: true, hint, preview }`: narrow with `fields` or params.
- `pageAll` wraps results as `{ pages: [...] }`; `nextPageToken` is added to `fields` automatically.
- People API reads need `personFields` (e.g. `"names,emailAddresses,phoneNumbers"`); Tasks uses `tasklist: "@default"` for the default list.
- `schema` with `resolve-refs` fails on recursive types (Gmail messages); omit it.
- The gws profile comes from `GWS_PROFILE` (default `bdombro`).
