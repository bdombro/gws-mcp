# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-11-08

### Security

- `gmail-attachment`: always saves to `~/Downloads/gws/<messageId>/<sanitized name>` with no overwrite; the `out` option is replaced by an optional `filename`.
- `drive-upload`: refuses files outside `$HOME` / OS temp dirs, hidden paths, `~/Library` and non-regular files.
- `call`: code-level blocklist (send mail, Gmail filters/forwarding/delegates, Drive permissions create/update and files.delete, Calendar acl, script run).
- HTML-to-text drops hidden elements (inline style, `hidden` attribute); MCP instructions mark email content as untrusted.
- HTTP server disabled.

- `gmail-attachment`: save one Gmail attachment to a local file (`call` caps results at 100 KB, too small for real attachments).
- `drive-upload`: upload a local file to a Drive folder (by id or My Drive path, created when missing).

### Added

- `call`: run any Google Workspace API method through `gws` (service, resource path, method, params, body, `fields`, `pageAll`/`pageLimit`); responses over 100 KB return a truncation notice with a hint. Annotated destructive/open-world.
- `schema`: show a method's parameters and request/response schema (`gws schema`, optional `--resolve-refs`).
- `gmail-message` / `gmail-thread`: readable Gmail messages (headers, text body with HTML converted, attachments, labels).
- Zero-dependency email HTML-to-text converter (`src/html-to-text.ts`).
- `GWS_PROFILE` (default `bdombro`) and `GWS_BIN` env settings.

### Removed

- Template demo commands (`echo`, `render-json`, `workspaces`) and the in-memory database.
