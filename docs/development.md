# gws-mcp: Developer Reference

User installation and configuration are in [README.md](../README.md).

## Development Loop

```bash
just doctor
just test
just lint
just test-mcp
```

Iterate quickly on a single doctest case with `just test "<case>"` (Debug build with ASan + UBSan and `BUGSINK_DSN=""`). Set `LLVM_BIN` to override the `llvm@23` binary directory for `clang-format` and `clang-tidy`. Run the direct binary on a separate dev port:

```bash
./build/bin/gws-mcp http --port 20006
```

On Linux (`ubuntu-24.04`), install `llvm@23` via Homebrew and enable lingering so `brew services` systemd user units survive logout (`loginctl enable-linger "$USER"`).

## Develop against an unreleased lib

Add `"overlay-ports"` to the consumer's `vcpkg-configuration.json`, then run `just test` or `just build` as usual (add one entry per unreleased lib):

```json
{
  "overlay-ports": [
    "<relative path to ~/dev/slimr/<name>/ports/slimr-<name>>"
  ]
}
```

Remove `"overlay-ports"` and bump the registry baseline once the lib is released. Never commit or release with `overlay-ports` set.

## Release

Push changes to `main`, add an entry under `## Unreleased` in `CHANGELOG.md`, then run:

```bash
just release patch   # or minor / major
```

## Architecture

- `src/main.cpp`: `--log-file` parsing, `slimr::enable_http` on port `10006`, `app.run(argc, argv)`.
- `src/log_file.hpp`: file-descriptor redirection and 10 MiB log rotation.
- `src/app.hpp`: `gws::make_google_gws_app()`, API method blocklist, path containment, and typed C++ entrypoints.
- `src/client.hpp`: `posix_spawnp` + `poll()` subprocess runner for `gws`, stderr noise filter, 100 KB response cap.
- `src/mime.hpp`: base64url decoder, Gmail MIME tree walker, charset converter, attachment extractor.
- `src/html_to_text.hpp`: HTML-to-readable-text converter (strips hidden elements and UTM params).
- `tests/test_main.cpp`: unit, mock-runner, CLI, MCP `2026-07-28`, and HTTP concurrency tests.

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, or JS formula helpers.
