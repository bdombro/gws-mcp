# gws-mcp

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
- Small footprint: a standalone C++26 binary exposing CLI, stdio MCP, and Streamable HTTP (`127.0.0.1:8086`); the `gws` CLI is the only runtime service dependency.

## Transports & MCP `2026-07-28`

`gws-mcp` implements the MCP **`2026-07-28`** specification over both stdio and Streamable HTTP:

- **Breaking change (`2026-07-28`):** Session initialization (`initialize`), `notifications/initialized`, `MCP-Session-Id` headers, and SSE `GET`/`DELETE` streams are removed. Clients discover capabilities via `server/discover`, list tools via `tools/list`, and call tools via `tools/call`. On HTTP `POST /mcp`, callers must send `MCP-Protocol-Version: 2026-07-28` (and `Accept: application/json`), plus `Mcp-Method` (and `Mcp-Name` on `tools/call`). Calling `initialize` returns `-32601 Method not found`.
- **Streamable HTTP (default port `8086`):**
  ```bash
  ./build/bin/gws-mcp http --host 127.0.0.1 --port 8086
  # Endpoint: http://127.0.0.1:8086/mcp
  ```
- **Stdio MCP (`mcp`):**
  ```json
  {
    "mcpServers": {
      "gws-mcp": {
        "command": "/absolute/path/to/gws-mcp",
        "args": ["mcp"],
        "env": {
          "GWS_PROFILE": "work",
          "GWS_BIN": "gws"
        }
      }
    }
  }
  ```
- **HTTP client configuration:**
  ```json
  {
    "mcpServers": {
      "gws-mcp": {
        "type": "http",
        "url": "http://127.0.0.1:8086/mcp"
      }
    }
  }
  ```
- **Cursor / Claude plugins:** `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` configure the HTTP server at `http://127.0.0.1:8086/mcp`. Note that host clients using these manifests must support MCP `2026-07-28` Streamable HTTP.

## App Architecture

The standalone MCP server (stdio + Streamable HTTP) and JSON CLI are implemented in C++26 on `slimr-cpp`; API calls are delegated to the official [`gws` CLI](https://github.com/googleworkspace/cli).

```text
plugins/gws-mcp/
├── vcpkg.json                      # Independently resolved dependencies (slimr-mcp[http])
├── CMakeLists.txt                  # App/test targets and transitive dependency linking (slimr::mcp_http)
├── justfile                        # CMake/Ninja, lint, test-mcp, and Homebrew service lifecycle
├── Formula/gws-mcp.rb              # Homebrew formula + launchd service definition (127.0.0.1:8086)
├── scripts/
│   ├── dev-formula.mjs             # Local tarball formula staging helper
│   └── test-mcp.mjs                # Stdio + ephemeral HTTP MCP 2026-07-28 conformance check
├── .cursor-plugin/plugin.json      # Cursor plugin manifest (HTTP 127.0.0.1:8086/mcp)
├── .claude-plugin/                 # Claude plugin & marketplace manifests (HTTP 127.0.0.1:8086/mcp)
├── src/
│   ├── client.hpp                  # `posix_spawnp` + `poll()` subprocess runner for `gws`, stderr noise filter, 100 KB cap
│   ├── html_to_text.hpp            # Prompt-injection-hardened HTML-to-readable-text converter (strips hidden elements & UTM params)
│   ├── mime.hpp                    # Base64url decoder, Gmail MIME tree walker, charset converter (UTF-8 / Latin-1), attachment extractor
│   ├── app.hpp                     # `gws::make_google_gws_app()`, API method blocklist, path containment, and in-process C++ API
│   └── main.cpp                    # Standalone CLI, stdio (`mcp`), and Streamable HTTP (`http`) entrypoint
├── tests/
│   └── test_main.cpp               # Unit, mock-runner, CLI, MCP 2026-07-28, and HTTP concurrency tests (ASan + UBSan)
└── build/bin/
    └── gws-mcp                     # Standalone release binary
```

### Libraries Used

- **`<mcp.hpp>`, `<mcp_http.hpp>` & `<reflect.hpp>`:** Typed MCP `2026-07-28` tool definitions, compile-time JSON Schema generation, Streamable HTTP transport (`127.0.0.1:8086`), and narrow JSON CLI.
- **`<json.hpp>` (`glaze`):** Fast JSON parsing and 100 KB response capping (`cap_json`).
- **`<bugsink.hpp>` (`-lcurl`):** Opt-in error reporting through `BUGSINK_DSN`.
- **`<test.hpp>` (`doctest`):** Mock `GwsRunner`, CLI, and `McpHttpServer` test suite compiled with `-fsanitize=address,undefined`.
- **POSIX & C++26 Standard Library:** `<spawn.h>` (`posix_spawnp`), `<poll.h>`, `<filesystem>`, `<regex>`.

## Tools & CLI Commands

Every tool is available over MCP (`gws-mcp mcp` or `gws-mcp http`) and on the CLI (`gws-mcp <tool> ['{"arg":"val"}']`).

| Tool | Mutating | Description |
| --- | --- | --- |
| `call` | Yes (Open World) | Invoke `gws <service> <resource...> <method>` with `params`, optional JSON `body`, `fields` (partial-response mask), `pageAll`, and `pageLimit`. Responses over 100 KB return a structured truncation notice prompting narrower `fields`/`params`. |
| `schema` | No | Inspect parameter and request/response schemas for any `<service>.<resource>.<method>` (`gws schema`), with optional `resolveRefs`. |
| `gmail-message` | No | Fetch a single Gmail message by ID: returns `from`, `to`, `cc`, `date`, `subject`, `snippet`, `labels`, `threadId`, attachment metadata (`filename`, `mimeType`, `size`, `attachmentId`), and readable plain-text body (preferring `text/plain`, otherwise converting `text/html` via `src/html_to_text.hpp`). |
| `gmail-thread` | No | Fetch every message in a Gmail thread as readable plain text with headers and attachment metadata. |
| `gmail-attachment` | Yes | Download one Gmail attachment (`messageId` + `attachmentId` from `gmail-message`) to `~/Downloads/gws/<messageId>/<safe-filename>`, automatically adding a numeric suffix instead of overwriting existing files. |
| `drive-upload` | Yes | Upload a local file to Google Drive (`file`, optional `folderPath` like `"Family/Receipts"` or `folderId`, `name`, `mimeType`), creating missing folder paths under My Drive automatically. |
| `status` | No | Returns plugin version and active `gws` profile/binary configuration. |

### CLI Examples

```bash
# List 5 unread Gmail messages with partial response mask
./build/bin/gws-mcp call '{"service":"gmail","resource":["users","messages"],"method":"list","params":{"userId":"me","q":"is:unread","maxResults":5},"fields":"messages(id,threadId)"}'

# Read a Gmail message as clean plain text
./build/bin/gws-mcp gmail-message '{"id":"1a1b6731c6fdd2af"}'

# Read an entire Gmail thread
./build/bin/gws-mcp gmail-thread '{"id":"1a1b6731c6fdd2af"}'

# Inspect Google Tasks insert schema
./build/bin/gws-mcp schema '{"method":"tasks.tasks.insert"}'

# Upload a file to a Drive folder path
./build/bin/gws-mcp drive-upload '{"file":"/absolute/path/to/invoice.pdf","folderPath":"Receipts/2026"}'
```

## Safety Rules Enforced in C++ (`src/app.hpp` & `src/html_to_text.hpp`)

1. **No shell execution or flag injection:** `gws` is executed via `posix_spawnp`. `service`, `resource`, and `method` segments are validated against strict identifier regexes (`^[a-zA-Z][a-zA-Z0-9]*$`), and non-API `gws` subcommands (`auth`, `schema`, `+helper`) are rejected in `call`.
2. **Hard API blocklist in `call`:**
   - **Gmail:** Refuses `users.messages.send`, `users.messages.insert`, `users.messages.import`, `users.drafts.send`, `users.settings.filters.*`, `users.settings.forwardingAddresses.*`, `users.settings.delegates.*`, and `users.settings.updateAutoForwarding`.
   - **Drive:** Refuses `permissions.create`, `permissions.update`, `permissions.delete`, and `files.delete` (use `gdocsmith` for controlled sharing, or trash instead of permanent delete).
   - **Calendar & Apps Script:** Refuses `acl.*` and `script.scripts.run`.
3. **Upload path containment:** `drive-upload` only permits regular files under `$HOME` or the OS temp directory, and explicitly blocks hidden directories (`~/.ssh`, `~/.config`, `~/.gnupg`, …) and `~/Library`.
4. **Prompt-injection-hardened HTML-to-text (`src/html_to_text.hpp`):** Strips `<head>`, `<style>`, `<script>`, HTML comments, elements hidden via `hidden` attribute or inline CSS (`display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `height:0`, `width:0`, off-screen negative margins), UTM tracking parameters on links, and invisible/bidi Unicode characters (`U+200B..U+200F`, `U+202A..U+202E`, `U+2060..U+206F`, `U+FEFF`, tag characters `U+E0000..U+E007F`).

## Authentication & Security Boundary

`gws-mcp` runs in **loopback single-user mode** (`127.0.0.1:8086`) protected by loopback binding plus `Host`/`Origin` DNS-rebinding checks in `slimr::mcp_http`:

- Credentials live with your local `gws` CLI profile on the host (`gws auth login`). `gws-mcp` does **not** run a persistent HTTP Google token broker database, does **not** accept or store external Google OAuth tokens over HTTP, and does **not** enable or claim standard MCP OAuth (`oauth.enabled = false`).
- Because `brew services` runs under `launchd` with a minimal environment, [`Formula/gws-mcp.rb`](Formula/gws-mcp.rb) sets `PATH` to `#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin` so `gws` is resolved automatically when installed via Homebrew. Set `GWS_PROFILE` (or `GWS_BIN`) in your shell or service environment if you use a non-default profile or custom `gws` path.

Ensure `gws` is authenticated with all required scopes:

```bash
G=https://www.googleapis.com/auth
gws --profile work auth login --scopes "openid,email,profile,$G/calendar,$G/documents,$G/drive,$G/gmail.modify,$G/presentations,$G/spreadsheets,$G/tasks,$G/contacts"
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `GWS_PROFILE` | unset (`gws` default) | Passed as `gws --profile <name>` (set to `""` to omit `--profile`) |
| `GWS_BIN` | `gws` | Path or binary name of the `gws` CLI executable |
| `BUGSINK_DSN` | unset (disabled) | Error reporting DSN (`""` disables) |

## Homebrew & Service Lifecycle

`Formula/gws-mcp.rb` installs the binary and registers a background service listening on `http://127.0.0.1:8086/mcp` (logs at `$(brew --prefix)/var/log/gws-mcp.log`):

```bash
just install          # Install formula (or install-local / reinstall-local from a local build)
just start            # Start brew service and wait until http://127.0.0.1:8086/mcp responds
just status           # Check brew services status
just restart          # Restart service and wait for readiness
just stop             # Stop brew service
just uninstall        # Stop service and uninstall formula
just check-formula    # Validate Formula/gws-mcp.rb Ruby syntax
```

## macOS Build Prerequisites (vcpkg setup)

Install [Homebrew](https://brew.sh) and current Xcode Command Line Tools
(`xcode-select --install`; finish installation before continuing), or full Xcode.
Apple Clang 21 is the verified C++26/libc++ toolchain; older installations need
upgrading. These instructions assume Apple Silicon Homebrew at `/opt/homebrew`.

Add this environment snippet to `~/.zshrc`, then open a new terminal (or run
`source ~/.zshrc`). Use `~/.zshrc`, not `~/.zshenv`, to avoid changing
non-interactive zsh scripts:

`local-ports` is the dedicated vcpkg overlay directory for local development
linking: `just publish --local --all` registers symlinks to your slimr-cpp checkout,
overriding published packages without making a registry release. See the
[publishing guide on slimr-cpp](https://github.com/bdombro/slimr-cpp/blob/main/docs/publishing.md#local-environment).

```bash
export VCPKG_ROOT="$HOME/.local/share/vcpkg"
export VCPKG_OVERLAY_PORTS="$VCPKG_ROOT/local-ports"
# Use your existing workspace checkout instead when available.
export SLIMR_CPP="${SLIMR_CPP:-$HOME/dev/bdombro/slimr-cpp}"
export CXX="/usr/bin/clang++"
export CLANG_TIDY="/opt/homebrew/opt/llvm/bin/clang-tidy"
export PATH="$VCPKG_ROOT:/opt/homebrew/opt/ruby/bin:/opt/homebrew/bin:$PATH"
```

Then install and build from the repository root:

```bash
brew install cmake ninja just llvm node ruby autoconf automake libtool pkgconf
mkdir -p "$(dirname "$VCPKG_ROOT")"
if [ ! -d "$VCPKG_ROOT/.git" ]; then
  git clone https://github.com/microsoft/vcpkg.git "$VCPKG_ROOT"
fi
"$VCPKG_ROOT/bootstrap-vcpkg.sh" -disableMetrics
mkdir -p "$(dirname "$SLIMR_CPP")"
if [ ! -d "$SLIMR_CPP/.git" ]; then
  git clone https://github.com/bdombro/slimr-cpp.git "$SLIMR_CPP"
fi
(cd "$SLIMR_CPP" && just publish --local --all)
ln -s "$SLIMR_CPP/ports/libhv" "$VCPKG_OVERLAY_PORTS/libhv"

"$CXX" --version
vcpkg version
BUGSINK_DSN="" just test
just build
```

The libhv link is a one-time step: if it exists, verify that it points to the
chosen checkout's `ports/libhv` before skipping the command. Never overwrite
a conflicting port directory or modify installed headers/caches. Current HTTP
builds need both local slimr overlays and the separately pinned libhv port;
the older published registry baseline alone is not an HTTP build substitute.
`just deps` installs native libraries into `build/deps/`; no separate Homebrew
curl/OpenSSL library installation is needed.

Bootstrapping puts the executable at `$VCPKG_ROOT/vcpkg`, with no `bin/`
subdirectory. Keg-only Homebrew Ruby supplies `/opt/homebrew/opt/ruby/bin/ruby`.
Homebrew LLVM supplies lint tooling; select a different compatible `CXX`
before first configure if needed, since CMake caches it. For reproducible
vcpkg tooling, check out the tested full `VCPKG_REF` commit before bootstrapping;
package registry baselines pin resolution separately.
For runtime API access, separately install the
[Google Workspace CLI](https://github.com/googleworkspace/cli) with
`npm install -g @googleworkspace/cli`, then configure/authenticate its profile
as described above. Build/test commands neither authenticate Google nor start
services; tests mock the CLI.

## Building & Testing

Use Clang with C++26 and libc++ FAST hardening, CMake 3.31+, Ninja, [just](https://just.systems), a bootstrapped [vcpkg](https://vcpkg.io), Node, Ruby, and a compatible `clang-tidy` (set `CLANG_TIDY` if needed). Set `VCPKG_ROOT` and put vcpkg and the tools on `PATH`. Linux additionally needs `libc++` and `libc++abi`; select libc++ with `CXXFLAGS=-stdlib=libc++`.

Dependencies are declared in `vcpkg.json` (`slimr-mcp` with the `http` feature). During local development, `(cd /absolute/path/to/slimr-cpp && just publish --local --all)` publishes ports into vcpkg's local overlay; export `VCPKG_OVERLAY_PORTS="$VCPKG_ROOT/local-ports"` in your shell. `just deps` installs into `build/deps/` for the detected native triplet. `configure` always runs it, with CMake manifest installation disabled. CMake links installed `slimr::mcp_http` and `slimr::test` targets, never source-header overrides.

```bash
just test      # Debug ASan/UBSan tests, with fatal undefined behavior reports
just build     # Optimized IPO Release app and tests; build/bin/gws-mcp
just lint      # App and test translation units using the Debug compilation database (honors $CLANG_TIDY)
just test-mcp  # MCP 2026-07-28 conformance: stdio (mcp) + ephemeral HTTP (server/discover & tools/list)
just run status
just clean     # Remove build/ only; leaves user data untouched
```

Debug and Release graphs live in `build/cmake/Debug/` and `build/cmake/Release/`; only Release apps are emitted to `build/bin/`. Set `CXX` before the first configure to choose a compiler; CMake retains its absolute path even when lint uses a different `PATH`. Both configurations enable libc++ hardening and zero automatic-variable initialization. `just test-mcp` isolates HOME/XDG directories under `build/`, clears credentials, disables error reporting and external CLI access, and cleans up afterward; it never invokes a live Google API tool.

CI runs the same commands on native Linux/macOS. Configure `VCPKG_REF` to the tested full vcpkg commit SHA; slimr packages resolve from the public registry pinned in `vcpkg-configuration.json`, without a dependency token. Local macOS validation is not Linux execution evidence.
