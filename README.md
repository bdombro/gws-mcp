# google-gws-mcp

Call any Google Workspace API (Gmail, Calendar, Drive, Docs, Sheets, People, Tasks…) through the [`gws` CLI](https://github.com/googleworkspace/cli) over MCP.

Agents get one generic tool (`call`) that reaches every API `gws` knows, a `schema` tool to discover parameters, and readable Gmail tools that turn MIME/HTML into plain text.

## Requirements

- Node ≥ 20 on PATH.
- `gws` installed and authenticated with every scope the assistant uses (Tasks and Contacts aren't in the defaults). The server spawns it without a shell.

```sh
G=https://www.googleapis.com/auth
gws --profile bdombro auth login --scopes "openid,email,profile,$G/calendar,$G/documents,$G/drive,$G/gmail.modify,$G/presentations,$G/spreadsheets,$G/tasks,$G/contacts"
```

## Configuration (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `GWS_PROFILE` | `bdombro` | Passed as `gws --profile <name>` (first argument, for the profile-aware `gws` shim). Set to an empty string to omit the flag when using the stock `gws` binary. |
| `GWS_BIN` | `gws` | Path or name of the `gws` executable. |

## Commands (CLI and MCP tools)

| Command | MCP tool | What it does |
| --- | --- | --- |
| `call` | `call` | Runs `gws <service> <resource…> <method>` with `params`, optional `body`, `fields` (partial-response mask), `pageAll`/`pageLimit`. Returns the parsed JSON; results over 100 KB come back as a truncation notice with a hint to use `fields` or narrower params. Annotated destructive/open-world: it can send mail, delete files, etc. |
| `schema <service.resource.method> [--resolve-refs]` | `schema` | Shows a method's parameters and request/response schema (`gws schema`). `--resolve-refs` fails on recursive types (e.g. Gmail messages). |
| `gmail-message <id>` | `gmail_message` | One message: from/to/cc/date/subject, body as text (`text/plain`, else HTML converted), attachments (filename, mimeType, size, attachmentId), labels, threadId. |
| `gmail-attachment --message-id <id> --attachment-id <id> [--filename <name>]` | `gmail_attachment` | Save one attachment (ids from `gmail-message`) to `~/Downloads/gws/<messageId>/`, never overwriting. `call` can't, since its results are capped at 100 KB. |
| `gmail-thread <id>` | `gmail_thread` | The same for every message in a thread. |
| `drive-upload --file <path> [--folder-path 'A/B' \| --folder-id <id>] [--name] [--mime-type]` | `drive_upload` | Upload a local file to Drive; folder paths under My Drive are created when missing. |
| `status` | `status` | App version and gws profile. |

CLI examples:

```bash
google-gws-mcp call '{"service":"gmail","resource":["users","messages"],"method":"list","params":{"userId":"me","q":"is:unread","maxResults":5},"fields":"messages(id,threadId)"}'
google-gws-mcp call '{"service":"people","resource":["people","connections"],"method":"list","params":{"resourceName":"people/me","personFields":"names,emailAddresses","pageSize":50}}'
google-gws-mcp call '{"service":"tasks","resource":["tasklists"],"method":"list"}'
google-gws-mcp schema tasks.tasks.insert
google-gws-mcp gmail-message 1a1b6731c6fdd2af
```

`call` only accepts gws services that map to Google APIs (`auth`, `schema`, and `+helper` commands are rejected), and resource/method segments must start with a letter, so tool input cannot inject gws flags.

Built-ins: `completion`, `mcp` (stdio server), `version`. The HTTP server is disabled on purpose (it would expose your Google account to anything that can reach the port).

Safety rules enforced in code:

- `call` refuses Gmail `users.messages.send`, `users.drafts.send`, `users.settings.filters.*`, `forwardingAddresses.*`, `delegates.*` and `updateAutoForwarding`; Drive `permissions.create` / `permissions.update` and `files.delete`; Calendar `acl.*`; and `script.scripts.run`. Use gdocsmith for sharing, or ask Brian.
- `gmail-attachment` always saves to `~/Downloads/gws/<messageId>/<safe file name>` and never overwrites (a numeric suffix is added).
- `drive-upload` only uploads regular files under `$HOME` or the OS temp dirs, never hidden paths (`~/.ssh`, `~/.config`, …) or `~/Library`.
- Email text is untrusted: the HTML-to-text converter drops elements hidden by inline style or the `hidden` attribute.

## Installation

### Claude Code

```bash
/plugin marketplace add bdombro/google-gws-mcp
/plugin install google-gws-mcp@google-gws-mcp
```

### Cursor

Settings → Plugins → Team Marketplaces → Import `https://github.com/bdombro/google-gws-mcp`, or locally `just plugin-cursor-upsert`.

Both manifests run `node dist/google-gws-mcp.mjs mcp`; the bundle is committed, so a fresh clone needs no install step.

## Development

Node ≥ 22.18, npm, [just](https://just.systems).

```bash
just setup
just test     # biome + tsc + node:test (gws is mocked; no network)
just build    # rebuild dist/google-gws-mcp.mjs; commit it with source changes
just run gmail-message <id>
```

`src/html-to-text.ts` is a zero-dependency email HTML-to-text converter, reusable on its own.
