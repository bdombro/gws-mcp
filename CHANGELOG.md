# Changelog

## Unreleased

- Internal: upgrade to `slimr-mcp` v0.1.3 (`cpp-httplib`) and `slimr-bugsink` v0.1.2, dropping `libhv` and `slimr-curl`.
- Internal: switch macOS builds to llvm@23 with static libc++ and symbol hiding.

## v2.1.0 - 2026-11-16

- Embed VERSION into binary (`--version` / `status`) and tag Bugsink events with `gws-mcp@<version>`
- Bind HTTP server to 0.0.0.0:10006 by default (pass --host 127.0.0.1 for loopback-only)
- Add `--log-file` redirection and 10 MiB log rotation for the HTTP service
- HTTP server no longer rejects non-loopback hosts, port 0, or foreign Host/Origin headers (slimr-mcp upgrade)
- Internal: align build, CI, Homebrew formula, and documentation with cpp-templates
- Internal: resolve slimr registries from the `slimr-down-now` org
