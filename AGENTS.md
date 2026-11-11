# AGENTS.md (`gws-mcp`)

Written for: AI coding agents working in the `gws-mcp` C++26 plugin repository.

`gws-mcp` is a C++26 MCP plugin and CLI built on `slimr-cpp` that wraps the `gws` Google Workspace CLI (`posix_spawnp`), decodes Gmail MIME trees and HTML bodies into readable text, downloads attachments safely, and uploads files to Google Drive.

## Commands

| Task | Command |
| --- | --- |
| Run unit & mock-runner tests (ASan + UBSan, no network) | `just test` |
| Build and test release binary (`build/bin/gws-mcp`) | `just build` |
| Analyze app and test translation units | `just lint` |
| Verify isolated MCP initialization and tool discovery | `just test-mcp` |
| Clean build artifacts | `just clean` |

## Module Boundaries

| Path | Owns | Must Not |
| --- | --- | --- |
| `src/main.cpp` | Entrypoint calling `gws::make_google_gws_app().run(argc, argv)` | Business logic |
| `src/app.hpp` | `make_google_gws_app()`, API method blocklist (`is_blocked_method`), path containment (`validate_upload_path`, `resolve_attachment_dest`), and typed C++ entrypoints (`gws::call`, `gws::gmail_message`, `gws::gmail_thread`, `gws::gmail_attachment`, `gws::drive_upload`, `gws::schema`, `gws::status`) | Bypass blocklists or path guards |
| `src/client.hpp` | `GwsRunner`, `exec_gws` (`posix_spawnp` + `poll()`), `GWS_PROFILE` handling, keyring noise filtering, `cap_json` (100 KB limit) | Use `/bin/sh` or `popen` |
| `src/mime.hpp` | Base64url decoding, recursive MIME part walking, charset decoding (UTF-8, ISO-8859-1), attachment listing | — |
| `src/html_to_text.hpp` | HTML-to-readable-text conversion, hidden-element pruning (`display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `hidden`), UTM query stripping, invisible Unicode removal | Retain hidden prompt-injection spans |
| `tests/test_main.cpp` | 53 test cases using injected `GwsRunner` mocks and an isolated `/bin/pwd` cwd fixture | Spawn live `gws` calls in unit tests |

## Safety & App Conventions

1. **Never weaken the `call` blocklist:** `call` must always refuse sending mail/drafts (`users.messages.send`, `users.drafts.send`), modifying Gmail filters/forwarding/delegates, modifying Drive permissions or permanently deleting files (`permissions.*`, `files.delete`), modifying Calendar ACLs (`acl.*`), and running Apps Script (`script.scripts.run`).
2. **Never use a shell:** `exec_gws` spawns `gws` directly via `posix_spawnp` and validates all service/resource/method tokens so flags cannot be injected.
3. **Path containment:** `drive_upload` must refuse symlinks, non-regular files, files outside `$HOME` / temp dirs, hidden paths (`~/.ssh`, `~/.config`), and `~/Library`. `gmail_attachment` must always write inside `~/Downloads/gws/<messageId>/` and never overwrite an existing file (append `-1`, `-2`, …).

## C++ Memory Safety

- Immediately wrap owned C handles, allocations, descriptors, and temporary resources in RAII. Make owning wrappers noncopyable unless copying creates independent ownership; moves must leave the source safely destructible.
- Borrow views, pointers, and references only for the current call by default. Store owning values unless lifetime/invalidation guarantees are explicit. Deferred callbacks require explicit ownership-safe captures; no escaping reference captures without a demonstrated lifetime guarantee.
- Initialize scalar/pointer members at declaration and local values before use. Compiler auto-initialization is defense in depth, not permission for uninitialized reads.
- Check range/overflow before narrowing lengths/counts at C API boundaries; casts alone are not validation. Report invalid inputs using existing error mechanisms.
- Never let C++ exceptions escape C callbacks. Translate them into the C API's error/abort mechanism and propagate failures at the C++ boundary; do not silently swallow them.
- Preserve hardening, zero auto-initialization, ASan/UBSan with fatal reports, and required lint/tests. These checks do not prove memory safety.
