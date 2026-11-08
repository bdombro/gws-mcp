# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
