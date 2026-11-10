# google-gws-mcp

```
    .----.      .---.
   (      )----(     )
    `----'      `---'
       G W S
```

Give your agent a consistent MCP interface to Gmail, Calendar, Drive, Docs, Sheets, Contacts, Tasks, and other Google Workspace APIs.

Read Gmail as clean, readable text and upload files to Drive without hand-building multipart requests. The server invokes the official `gws` CLI directly, blocks selected high-risk API operations, and constrains local upload paths.

## Features

- Call Workspace APIs, inspect their schemas, read Gmail messages and threads, and download attachments.
- Upload local files to Drive, creating folder paths when needed.
- Blocks selected sending, sharing, deletion, and script-execution operations.
- Small footprint: a standalone MCP binary; the `gws` CLI is the only runtime service dependency.

## `.mcp.json` Configuration

In the `assistant2` workspace, `google-gws-mcp` is mounted into the unified `dist/assistant-mcp` gateway under the `gws_` prefix (`gws_call`, `gws_schema`, `gws_gmail_message`, `gws_gmail_thread`, `gws_gmail_attachment`, `gws_drive_upload`, `gws_status`).

To run `google-gws-mcp` as a standalone MCP server in `.mcp.json`:

```json
{
  "mcpServers": {
    "google-gws-mcp": {
      "command": "/Users/briandombrowski/dev/bdombro/assistant/assistant2/plugins/google-gws-mcp/dist/google-gws-mcp",
      "args": ["mcp"],
      "env": {
        "GWS_PROFILE": "bdombro",
        "GWS_BIN": "gws"
      }
    }
  }
}
```

## App Architecture

The standalone MCP and JSON CLI are implemented in C++26 on `slimr-cpp`; API calls are delegated to the official [`gws` CLI](https://github.com/googleworkspace/cli).

```text
plugins/google-gws-mcp/
├── justfile                  # `just test` (ASan + UBSan) and `just build` (-O3 -flto)
├── README.md                 # User & operator documentation
├── AGENTS.md                 # Maintainer & AI agent conventions
├── src/
│   ├── client.hpp            # `posix_spawnp` + `poll()` subprocess runner for `gws`, stderr noise filter, 100 KB cap
│   ├── html_to_text.hpp      # Prompt-injection-hardened HTML-to-readable-text converter (strips hidden elements & UTM params)
│   ├── mime.hpp              # Base64url decoder, Gmail MIME tree walker, charset converter (UTF-8 / Latin-1), attachment extractor
│   ├── app.hpp               # `gws::make_google_gws_app()`, API method blocklist, path containment, and in-process C++ API
│   └── main.cpp              # Standalone CLI & stdio MCP entrypoint
├── tests/
│   └── test_main.cpp         # 52 unit & mock-runner test cases with ASan + UBSan
└── dist/
    └── google-gws-mcp        # Standalone ARM64 release binary (~773 KB)
```

### Libraries Used

- **`<slimr/mcp.hpp>` & `<slimr/reflect.hpp>`:** Typed MCP tool definitions, compile-time JSON Schema generation, and narrow JSON CLI.
- **`<slimr/json.hpp>` (`glaze`):** Fast JSON parsing and 100 KB response capping (`cap_json`).
- **`<slimr/bugsink.hpp>` (`-lcurl`):** Automatic error reporting to `bugsink.btek.cc`.
- **`<slimr/test.hpp>` (`doctest`):** Mock `GwsRunner` test suite compiled with `-fsanitize=address,undefined`.
- **POSIX & C++26 Standard Library:** `<spawn.h>` (`posix_spawnp`), `<poll.h>`, `<filesystem>`, `<regex>`.

## Tools & CLI Commands

Every tool is available over MCP (`google-gws-mcp mcp` or via `assistant-mcp` under the `gws_` prefix) and on the CLI (`google-gws-mcp <tool> ['{"arg":"val"}']`).

| Tool | Gateway Name | Mutating | Description |
| --- | --- | --- | --- |
| `call` | `gws_call` | Yes (Open World) | Invoke `gws <service> <resource...> <method>` with `params`, optional JSON `body`, `fields` (partial-response mask), `pageAll`, and `pageLimit`. Responses over 100 KB return a structured truncation notice prompting narrower `fields`/`params`. |
| `schema` | `gws_schema` | No | Inspect parameter and request/response schemas for any `<service>.<resource>.<method>` (`gws schema`), with optional `resolveRefs`. |
| `gmail-message` / `gmail_message` | `gws_gmail_message` | No | Fetch a single Gmail message by ID: returns `from`, `to`, `cc`, `date`, `subject`, `snippet`, `labels`, `threadId`, attachment metadata (`filename`, `mimeType`, `size`, `attachmentId`), and readable plain-text body (preferring `text/plain`, otherwise converting `text/html` via `src/html_to_text.hpp`). |
| `gmail-thread` / `gmail_thread` | `gws_gmail_thread` | No | Fetch every message in a Gmail thread as readable plain text with headers and attachment metadata. |
| `gmail-attachment` / `gmail_attachment` | `gws_gmail_attachment` | Yes | Download one Gmail attachment (`messageId` + `attachmentId` from `gmail_message`) to `~/Downloads/gws/<messageId>/<safe-filename>`, automatically adding a numeric suffix instead of overwriting existing files. |
| `drive-upload` / `drive_upload` | `gws_drive_upload` | Yes | Upload a local file to Google Drive (`file`, optional `folderPath` like `"Family/Receipts"` or `folderId`, `name`, `mimeType`), creating missing folder paths under My Drive automatically. |
| `status` | `gws_status` | No | Returns plugin version and active `gws` profile/binary configuration. |

### CLI Examples

```bash
# List 5 unread Gmail messages with partial response mask
./dist/google-gws-mcp call '{"service":"gmail","resource":["users","messages"],"method":"list","params":{"userId":"me","q":"is:unread","maxResults":5},"fields":"messages(id,threadId)"}'

# Read a Gmail message as clean plain text
./dist/google-gws-mcp gmail_message '{"id":"1a1b6731c6fdd2af"}'

# Read an entire Gmail thread
./dist/google-gws-mcp gmail_thread '{"id":"1a1b6731c6fdd2af"}'

# Inspect Google Tasks insert schema
./dist/google-gws-mcp schema '{"method":"tasks.tasks.insert"}'

# Upload a file to a Drive folder path
./dist/google-gws-mcp drive_upload '{"file":"/Users/briandombrowski/Downloads/invoice.pdf","folderPath":"Receipts/2026"}'
```

## Safety Rules Enforced in C++ (`src/app.hpp` & `src/html_to_text.hpp`)

1. **No shell execution or flag injection:** `gws` is executed via `posix_spawnp`. `service`, `resource`, and `method` segments are validated against strict identifier regexes (`^[a-zA-Z][a-zA-Z0-9]*$`), and non-API `gws` subcommands (`auth`, `schema`, `+helper`) are rejected in `call`.
2. **Hard API blocklist in `call`:**
   - **Gmail:** Refuses `users.messages.send`, `users.messages.insert`, `users.messages.import`, `users.drafts.send`, `users.settings.filters.*`, `users.settings.forwardingAddresses.*`, `users.settings.delegates.*`, and `users.settings.updateAutoForwarding`.
   - **Drive:** Refuses `permissions.create`, `permissions.update`, `permissions.delete`, and `files.delete` (use `gdocsmith` for controlled sharing, or trash instead of permanent delete).
   - **Calendar & Apps Script:** Refuses `acl.*` and `script.scripts.run`.
3. **Upload path containment:** `drive_upload` only permits regular files under `$HOME` or the OS temp directory, and explicitly blocks hidden directories (`~/.ssh`, `~/.config`, `~/.gnupg`, …) and `~/Library`.
4. **Prompt-injection-hardened HTML-to-text (`src/html_to_text.hpp`):** Strips `<head>`, `<style>`, `<script>`, HTML comments, elements hidden via `hidden` attribute or inline CSS (`display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `height:0`, `width:0`, off-screen negative margins), UTM tracking parameters on links, and invisible/bidi Unicode characters (`U+200B..U+200F`, `U+202A..U+202E`, `U+2060..U+206F`, `U+FEFF`, tag characters `U+E0000..U+E007F`).

## Authentication & Environment Variables

Ensure `gws` is authenticated with all required scopes:

```bash
G=https://www.googleapis.com/auth
gws --profile bdombro auth login --scopes "openid,email,profile,$G/calendar,$G/documents,$G/drive,$G/gmail.modify,$G/presentations,$G/spreadsheets,$G/tasks,$G/contacts"
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `GWS_PROFILE` | `bdombro` | Passed as `gws --profile <name>` (set to `""` to omit `--profile`) |
| `GWS_BIN` | `gws` | Path or binary name of the `gws` CLI executable |
| `BUGSINK_DSN` | Project DSN on `bugsink.btek.cc` | Error reporting DSN (`""` disables) |

## Building & Testing

```bash
just test     # Run 52 unit & mock-subprocess test cases with ASan + UBSan
just build    # Build optimized ARM64 release binary (-O3 -flto) at dist/google-gws-mcp
```
