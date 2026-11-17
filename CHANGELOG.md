# Changelog

## Unreleased

- Pin `slimr-mcp` v0.2.1 and `slimr-serve` v0.3.0 (OpenAPI 3.1 `GET /openapi.json` / `--openapi` and `127.0.0.1` default bind).
- Internal: update `test-mcp.ts` to verify `GET /openapi.json` and document `overlay-ports` in `docs/development.md`.

## v2.2.0 - 2026-11-16

- Internal: pin `slimr-mcp` v0.2.0 and `slimr-serve` v0.1.1 baselines and remove temporary `overlay-ports`.
- Migrate to `slimr-serve` / `slimr-mcp` typed output schemas (`outputSchema` / `structuredContent`) and drop stdio `mcp` mode.
- Re-enable direct CLI tool calls (`gws-mcp <tool> '{...}'`), now opt-in since `slimr-mcp` v0.1.4
- Internal: upgrade to `slimr-mcp` v0.1.3 (`cpp-httplib`) and `slimr-bugsink` v0.1.2, dropping `libhv` and `slimr-curl`.
- Internal: switch macOS builds to llvm@23 with static libc++ and symbol hiding.

## v2.1.0 - 2026-11-16

- Embed VERSION into binary (`--version` / `status`) and tag Bugsink events with `gws-mcp@<version>`
- Bind HTTP server to 0.0.0.0:10006 by default (pass --host 127.0.0.1 for loopback-only)
- Add `--log-file` redirection and 10 MiB log rotation for the HTTP service
- HTTP server no longer rejects non-loopback hosts, port 0, or foreign Host/Origin headers (slimr-mcp upgrade)
- Internal: align build, CI, Homebrew formula, and documentation with cpp-templates
- Internal: resolve slimr registries from the `slimr-down-now` org
