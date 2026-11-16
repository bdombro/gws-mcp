# AGENTS.md (`gws-mcp`)

Written for: AI coding agents working in the `gws-mcp` C++26 plugin repository.

`gws-mcp` is a C++26 MCP plugin (`2026-07-28` Streamable HTTP on port `10006`) and CLI built on `slimr-mcp` that wraps the `gws` Google Workspace CLI (`posix_spawnp`), decodes Gmail MIME trees and HTML bodies into readable text, downloads attachments safely, and uploads files to Google Drive.

<!-- cpp-templates:begin -->
## Tooling alignment

Align this repository via the `cpp-templates` skill (`just check <template> .`). Keep repository-specific rules outside `<!-- cpp-templates:begin -->` and `<!-- cpp-templates:end -->`. Do not hand-edit verbatim template files or template recipes (repositories may add extra recipes or variables).

## Edit-don't-rewrite

- Make targeted edits and move files with `git mv`; never regenerate files from scratch or retype them from memory.
- Template files arrive through `just new` or `just sync`.
- Never delete, skip, or loosen tests to pass; if a test must change, explain why in the commit message.

## C++ Memory Safety

- Immediately wrap owned C handles, allocations, descriptors, and temporary resources in RAII. Make owning wrappers noncopyable unless copying deliberately creates independent ownership; moves must leave the source safely destructible.
- Borrow views, pointers, and references only for the current call by default. Store owning values unless lifetime/invalidation guarantees are explicit. Deferred callbacks require explicit ownership-safe captures; no escaping reference captures without a demonstrated lifetime guarantee.
- Initialize scalar/pointer members at declaration and local values before use. Compiler zero-initialization is defense in depth, not permission for uninitialized reads.
- Check range/overflow before narrowing lengths/counts at C API boundaries; casts alone are not validation. Report failures through existing error mechanisms.
- Never let C++ exceptions escape C callbacks. Translate them into the C API's error/abort mechanism and propagate failures at the C++ boundary; do not silently swallow them.
- Preserve libc++ hardening, zero auto-initialization, ASan/UBSan with fatal reports, and required lint/tests. These checks do not prove memory safety.

## C++ style

- Favor modern C++26 and the standard library over legacy patterns; write for readability; comment what is not obvious and why.
- Prefer values over pointers, `const` by default, and no raw `new`/`delete`.
- Use `std::expected` for expected failures; use exceptions only at process and callback boundaries.
- Structure code with one folder per feature under `src/`, mirrored under `tests/`. Keep one test TU per executable (`tests/test_main.cpp`).
- Name what you use (`using slimr::Json;` or `slimr::Json`, never `using namespace`). Use PascalCase for types and camelCase for functions and variables (review guidance, not lint).
- Put file-local helpers in an unnamed namespace in `.cpp` files, or in `detail::` in headers.
- Follow KISS: inline single-use helpers, avoid speculative abstractions, keep diffs lean.
- Apply style rules to new and touched code; ports do not rewrite working code just for style.
- `.clang-tidy` enforces bug-finding checks (`clang-analyzer-core.*`, `clang-analyzer-cplusplus.*`, and bug-risk `bugprone-*` checks; pending legacy findings are temporarily disabled with per-check counts in `.clang-tidy`); fix findings or suppress inline with a reason.
- `INTERFACE_SOURCES` caveat: linking a header-only library that ships an implementation TU (such as `slimr-yaml`) into both a library and an executable that links that library compiles the TU twice and causes duplicate symbols.

## Testing

Iterate with `just test "<case>"` (Debug build with ASan + UBSan, `BUGSINK_DSN=""`), then finish with a full `just test`. `just build` compiles Release only and runs no tests.

## Recipes

- Core: `build`, `clean`, `configure`, `deps`, `doctor`, `fmt`, `lint`, `release`, `test [filter]`, `upgrade-deps`
- `homebrew-*`: `install`, `uninstall`
- `homebrew-service` and `homebrew-mcp`: `daemon-logs`, `daemon-restart`, `daemon-start`, `daemon-status`, `daemon-stop`
- `homebrew-mcp`: `test-mcp`
- Dropped tooling (do not re-add): foreground runner, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula check, and JS formula helpers

## Changelog

Add one line under `## Unreleased` in `CHANGELOG.md` for every change (use `Internal: ...` for internal changes).

## Paths, env vars, and README

- `<name>` in Homebrew paths is always the formula name, never a short XDG name: app data lives in `$(brew --prefix)/var/<name>`, config in `$(brew --prefix)/etc/<name>/`, and service secrets in `$(brew --prefix)/etc/<name>/env` (`chmod 600`, never in the public formula).
- Secrets are env vars only.
- Every `README.md` is end-user first: what it does, install, usage, env var table (name, required or optional, purpose), then links into `docs/` (`docs/development.md`, `docs/architecture.md`) for contributor workflow and architecture.

## Remote tests

Never run `test.yml` manually before `just release` (because `release` runs `test.yml` first). Run `test.yml` manually only when asked or to reproduce a Linux-only failure.
<!-- cpp-templates:end -->

## Documentation Upkeep

When a change conflicts with `README.md`, update the affected README and its
linked user/developer documentation in the same change. Keep examples,
configuration, install/build commands and compatibility claims consistent
with implemented behavior; do not claim unverified release or client support.

## Module Boundaries

| Path | Owns | Must Not |
| --- | --- | --- |
| `src/main.cpp` | Entrypoint calling `slimr::enable_http(app, {.port = 10006})` + `app.run(argc, argv)` | Business logic |
| `src/app.hpp` | `make_google_gws_app()`, API method blocklist (`is_blocked_method`), path containment (`validate_upload_path`, `resolve_attachment_dest`), and typed C++ entrypoints (`gws::call`, `gws::gmail_message`, `gws::gmail_thread`, `gws::gmail_attachment`, `gws::drive_upload`, `gws::schema`, `gws::status`) | Bypass blocklists or path guards |
| `src/client.hpp` | `GwsRunner`, `exec_gws` (`posix_spawnp` + `poll()`), RAII fd/spawn guards, `GWS_PROFILE` handling, keyring noise filtering, `cap_json` (100 KB limit) | Use `/bin/sh` or `popen` |
| `src/mime.hpp` | Base64url decoding, recursive MIME part walking, charset decoding (UTF-8, ISO-8859-1), attachment listing | — |
| `src/html_to_text.hpp` | HTML-to-readable-text conversion, hidden-element pruning (`display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `hidden`), UTM query stripping, invisible Unicode removal | Retain hidden prompt-injection spans |
| `tests/test_main.cpp` | Unit, mock-runner, CLI, MCP `2026-07-28`, and concurrent `McpHttpServer` test cases | Spawn live `gws` calls in unit tests |
| `scripts/test-mcp.ts` | Isolated ephemeral HTTP (`http --port 0`) MCP `2026-07-28` test | Hit live Google APIs |
| `Formula/gws-mcp.rb` | Homebrew formula (`service do` on port `10006`, Homebrew `PATH`, `--log-file`) | Embed secrets |
| `.cursor-plugin/` & `.claude-plugin/` | Cursor and Claude HTTP plugin manifests (`http://127.0.0.1:10006/mcp`) | Include shell scripts or credentials |

## Safety & App Conventions

1. **Never weaken the `call` blocklist:** `call` must always refuse sending mail/drafts (`users.messages.send`, `users.drafts.send`), modifying Gmail filters/forwarding/delegates, modifying Drive permissions or permanently deleting files (`permissions.*`, `files.delete`), modifying Calendar ACLs (`acl.*`), and running Apps Script (`script.scripts.run`).
2. **Never use a shell:** `exec_gws` spawns `gws` directly via `posix_spawnp` and validates all service/resource/method tokens so flags cannot be injected.
3. **Path containment:** `drive-upload` must refuse symlinks, non-regular files, files outside `$HOME` / temp dirs, hidden paths (`~/.ssh`, `~/.config`), and `~/Library`. `gmail-attachment` must always write inside `~/Downloads/gws/<messageId>/` and never overwrite an existing file (append `-1`, `-2`, …).
4. **Auth boundary:** Keep `oauth.enabled = false`; never add a persistent HTTP Google token broker database or mix MCP bearer tokens with Google access tokens.
