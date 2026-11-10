# AGENTS.md (`google-gws-mcp`)

Written for: AI coding agents working in the `google-gws-mcp` C++26 plugin repository.

`google-gws-mcp` is a C++26 MCP plugin and CLI built on `slimr-cpp` that wraps the `gws` Google Workspace CLI (`posix_spawnp`), decodes Gmail MIME trees and HTML bodies into readable text, downloads attachments safely, and uploads files to Google Drive.

## Commands

| Task | Command |
| --- | --- |
| Run unit & mock-runner tests (ASan + UBSan, no network) | `just test` |
| Build release binary (`dist/google-gws-mcp`) | `just build` |
| Clean build artifacts | `just clean` |

## Module Boundaries

| Path | Owns | Must Not |
| --- | --- | --- |
| `src/main.cpp` | Entrypoint calling `gws::make_google_gws_app().run(argc, argv)` | Business logic |
| `src/app.hpp` | `make_google_gws_app()`, API method blocklist (`is_blocked_method`), path containment (`validate_upload_path`, `resolve_attachment_dest`), and typed C++ entrypoints (`gws::call`, `gws::gmail_message`, `gws::gmail_thread`, `gws::gmail_attachment`, `gws::drive_upload`, `gws::schema`, `gws::status`) | Bypass blocklists or path guards |
| `src/client.hpp` | `GwsRunner`, `exec_gws` (`posix_spawnp` + `poll()`), `GWS_PROFILE` handling, keyring noise filtering, `cap_json` (100 KB limit) | Use `/bin/sh` or `popen` |
| `src/mime.hpp` | Base64url decoding, recursive MIME part walking, charset decoding (UTF-8, ISO-8859-1), attachment listing | — |
| `src/html_to_text.hpp` | HTML-to-readable-text conversion, hidden-element pruning (`display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, `hidden`), UTM query stripping, invisible Unicode removal | Retain hidden prompt-injection spans |
| `tests/test_main.cpp` | 52 test cases using injected `GwsRunner` mocks | Spawn live `gws` calls in unit tests |

## Safety & App Conventions

1. **Never weaken the `call` blocklist:** `call` must always refuse sending mail/drafts (`users.messages.send`, `users.drafts.send`), modifying Gmail filters/forwarding/delegates, modifying Drive permissions or permanently deleting files (`permissions.*`, `files.delete`), modifying Calendar ACLs (`acl.*`), and running Apps Script (`script.scripts.run`).
2. **Never use a shell:** `exec_gws` spawns `gws` directly via `posix_spawnp` and validates all service/resource/method tokens so flags cannot be injected.
3. **Path containment:** `drive_upload` must refuse symlinks, non-regular files, files outside `$HOME` / temp dirs, hidden paths (`~/.ssh`, `~/.config`), and `~/Library`. `gmail_attachment` must always write inside `~/Downloads/gws/<messageId>/` and never overwrite an existing file (append `-1`, `-2`, …).
