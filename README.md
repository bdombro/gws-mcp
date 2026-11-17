# gws-mcp

Google Workspace MCP server and CLI wrapping the official `gws` CLI.

> **Client compatibility:** MCP **2026-07-28 only**; legacy clients cannot connect.

## Install

```bash
brew tap bdombro/gws-mcp https://github.com/bdombro/gws-mcp
brew install bdombro/gws-mcp/gws-mcp
```

Install and authenticate the [Google Workspace CLI](https://github.com/googleworkspace/cli):

```bash
npm install -g @googleworkspace/cli
G=https://www.googleapis.com/auth
gws auth login --scopes "openid,email,profile,$G/calendar,$G/documents,$G/drive,$G/gmail.modify,$G/presentations,$G/spreadsheets,$G/tasks,$G/contacts"
```

## Usage

Start the Homebrew service:

```bash
brew services start gws-mcp
brew services info gws-mcp
```

The HTTP server binds `127.0.0.1:10006` (`http://127.0.0.1:10006/mcp`; pass `--host 0.0.0.0` to expose), stores service state under `$(brew --prefix)/var/gws-mcp`, and logs to `$(brew --prefix)/var/log/gws-mcp.log` (rotated at 10 MiB, keeping one `.1`).

Add to `.mcp.json` (or `opencode.jsonc` with `"protocol": "2026-07-28"`):

```json
{
  "mcpServers": {
    "gws-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:10006/mcp"
    }
  }
}
```

Or invoke tools directly via CLI (`gws-mcp <tool> ['{"arg":"val"}']`).

### Tools & CLI Commands

| Tool | Mutating | Description |
| --- | --- | --- |
| `call` | Yes (Open World) | Invoke `gws <service> <resource...> <method>` with `params`, optional JSON `body`, `fields` (partial-response mask), `pageAll`, and `pageLimit`. Responses over 100 KB return a truncation notice prompting narrower `fields`/`params`. |
| `schema` | No | Inspect parameter and request/response schemas for `<service>.<resource>.<method>`, with optional `resolveRefs`. |
| `gmail-message` | No | Fetch a single Gmail message by ID with headers, attachment metadata, and readable plain-text body. |
| `gmail-thread` | No | Fetch every message in a Gmail thread as readable plain text with headers and attachment metadata. |
| `gmail-attachment` | Yes | Download a Gmail attachment to `~/Downloads/gws/<messageId>/<safe-filename>`, adding a numeric suffix instead of overwriting. |
| `drive-upload` | Yes | Upload a local file to Google Drive (`file`, optional `folderPath` or `folderId`, `name`, `mimeType`), creating missing folder paths automatically. |
| `status` | No | Return plugin version and active `gws` profile/binary configuration. |

```bash
# List 5 unread Gmail messages with partial response mask
gws-mcp call '{"service":"gmail","resource":["users","messages"],"method":"list","params":{"userId":"me","q":"is:unread","maxResults":5},"fields":"messages(id,threadId)"}'

# Read a Gmail message or thread
gws-mcp gmail-message '{"id":"1a1b6731c6fdd2af"}'
gws-mcp gmail-thread '{"id":"1a1b6731c6fdd2af"}'

# Inspect a schema or upload a file to Drive
gws-mcp schema '{"method":"tasks.tasks.insert"}'
gws-mcp drive-upload '{"file":"/absolute/path/to/invoice.pdf","folderPath":"Receipts/2026"}'
```

## Safety Rules

1. **No shell execution or flag injection:** `gws` runs via `posix_spawnp` with strict identifier validation on `service`, `resource`, and `method`.
2. **Hard API blocklist in `call`:** refuses `users.messages.{send,insert,import}`, `users.drafts.send`, Gmail filter/forwarding/delegate settings, Drive `permissions.*` and `files.delete`, Calendar `acl.*`, and `script.scripts.run`.
3. **Upload path containment:** `drive-upload` permits only regular files under `$HOME` or the OS temp directory, and blocks hidden directories (`~/.ssh`, `~/.config`, `~/.gnupg`) and `~/Library`.
4. **HTML sanitization:** `gmail-message` and `gmail-thread` strip `<head>`, `<style>`, `<script>`, hidden elements, UTM parameters, and invisible/bidi Unicode characters.

## Environment Variables

Configure service environment variables in `$(brew --prefix)/etc/gws-mcp/env` (`chmod 600`, `KEY=VALUE`):

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GWS_PROFILE` | Optional | unset (`gws` default) | Passed as `gws --profile <name>` (set to `""` to omit `--profile`) |
| `GWS_BIN` | Optional | `gws` | Path or binary name of the `gws` CLI executable |
| `BUGSINK_DSN` | Optional | unset (disabled) | Error reporting DSN (`""` disables reporting) |

## Development

See [docs/contributing.md](docs/contributing.md) for local builds, testing, and releases.
