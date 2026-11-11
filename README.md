# gws-mcp

```
    .----.      .---.
   (      )----(     )
    `----'      `---'
       G W S
```

Give your agent a consistent MCP interface to Gmail, Calendar, Drive, Docs, Sheets, Contacts, Tasks, and other Google Workspace APIs.

Read Gmail as clean, readable text and upload files to Drive without hand-building multipart requests. The server invokes the official `gws` CLI directly, blocks selected high-risk API operations, and constrains local upload paths.

> **Client compatibility:** MCP **2026-07-28 only**; legacy clients cannot connect.
> The workspace has been exercised with OpenCode v2.2.6 using explicit July
> configuration. Cursor's July support is deferred; Claude Code July runtime
> acceptance is not yet verified. Shipping a plugin manifest is not proof of
> client compatibility.

## Try It

After setup, ask your agent:

> Show me five unread emails as readable summaries.

## Features

- Call Workspace APIs, inspect their schemas, read Gmail messages and threads, and download attachments.
- Upload local files to Drive, creating folder paths when needed.
- Blocks selected sending, sharing, deletion, and script-execution operations.
- Small footprint: a standalone C++26 binary exposing CLI, stdio MCP, and Streamable HTTP (`127.0.0.1:8086`); the `gws` CLI is the only runtime service dependency.

## Installation

- **Prebuilt release:** the checked-in [Homebrew formula](Formula/gws-mcp.rb)
  currently has a placeholder checksum. It is not a ready-to-install release.
  Check [releases](https://github.com/bdombro/gws-mcp/releases) for published
  binaries and a finalized formula before using a release installation command.
- **Build from source:** the current path is [Development](#development).
  Local slimr overlays are for development, not a runtime requirement.
- **Already installed:** follow the setup and service steps below. Installing a
  Cursor/Claude manifest only configures an endpoint; it does not install or
  start the native service.


## Configure Google Access

Install the official [Google Workspace CLI](https://github.com/googleworkspace/cli):

```bash
npm install -g @googleworkspace/cli
```

Follow its OAuth setup/login instructions and authorize the services you
intend to use, including Tasks when needed. Select a profile with
`GWS_PROFILE` and a custom executable with `GWS_BIN` in the server's
environment. Authentication belongs to the local CLI, not the MCP client's
HTTP Connect flow. See [Authentication & Security Boundary](#authentication--security-boundary).


## Start and Manage the Service

For an already-installed Homebrew formula:

```bash
brew services start bdombro/gws-mcp/gws-mcp
brew services info gws-mcp
brew services restart bdombro/gws-mcp/gws-mcp
brew services stop bdombro/gws-mcp/gws-mcp
```

The endpoint is `http://127.0.0.1:8086/mcp`; logs are under
`/opt/homebrew/var/log/`. To run in the foreground instead, use
`gws-mcp http` (or `./build/bin/gws-mcp http` from a source checkout).
Do not run the foreground server and service on the same port.
Keep the default loopback bind; this is not a shared remote-host deployment.


## Connect Your Agent

After starting the service, add this server to OpenCode v2.2.6's
`opencode.jsonc` (merge it with any existing servers):

```json
{
  "mcp": {
    "servers": {
      "gws-mcp": {
        "type": "remote",
        "url": "http://127.0.0.1:8086/mcp",
        "protocol": "2026-07-28"
      }
    }
  }
}
```

Use either an explicit server entry or a plugin manifest, not both.
Alternative client schemas and stdio configuration are in the
[developer reference](docs/development.md). The compatibility notice above
applies to every transport.


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

## Troubleshooting

- **Client cannot connect:** confirm it supports July MCP, the service is
  running, and the client URL matches the configured port. OpenCode needs
  `"protocol": "2026-07-28"`; old `initialize` clients will fail.
- **Port occupied:** inspect the listener and stop only the service/process
  you own, or deliberately choose another port and update the client URL.
- **Works in a terminal, not as a service:** launchd does not inherit
  `~/.zshrc`. Configure the service environment separately or use the
  plugin's supported private configuration file; inspect
  `/opt/homebrew/var/log/` for errors.
- **Google authentication fails:** confirm the service can find the selected gws executable/profile and that the required scope was granted. Reauthorize through gws, not by pasting tokens into tool arguments.
- **Source build cannot find vcpkg or slimr ports:** load the development
  environment, bootstrap vcpkg, and register both slimr links and the pinned
  libhv overlay. Never repair this by editing installed headers.
- **Compiler/hardening check fails:** upgrade the Xcode toolchain; set
  `CXX` before first configure. CMake caches the compiler, so an intentional
  compiler change needs a fresh configuration tree.


## Development

This section is for building or changing the server, not configuring an
installed binary. [Architecture, transport reference and test details](docs/development.md)
are separate from the user setup flow.

<details>
<summary>macOS source-build setup (vcpkg and local slimr overlays)</summary>

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

</details>

After the source build succeeds, stage and install the local Homebrew formula:

```bash
just install-local
```

Installing a formula and starting its service are separate actions.
For a source-only foreground run, use
`./build/bin/gws-mcp http`.
