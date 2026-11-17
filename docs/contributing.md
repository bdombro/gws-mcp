# gws-mcp: Contributing

User installation and configuration are in [README.md](../README.md).

<!-- cpp-templates:begin -->
## Contents

- [Develop and test](#develop-and-test)
- [Unreleased libraries](#unreleased-libraries)
- [Rules](#rules)
- [PR, CI, and release flow](#pr-ci-and-release-flow)
- [Dependency bumps](#dependency-bumps)

## Develop and test

```bash
just doctor
just test
just lint
```

Iterate on a single doctest case with `just test "<case>"` (Debug build with ASan + UBSan, `BUGSINK_DSN=""`). For `homebrew-mcp` repos, run `just test-mcp` as well.

## Unreleased libraries

vcpkg reads extra port dirs from `VCPKG_OVERLAY_PORTS`, and an overlay wins over the registry. Point it at a dir of symlinks, one per unreleased lib; manifests never change:

```sh
mkdir -p ~/.vcpkg/overlays/dev
ln -s ~/dev/slimr/<lib>/ports/slimr-<lib> ~/.vcpkg/overlays/dev/slimr-<lib>
export VCPKG_OVERLAY_PORTS=~/.vcpkg/overlays/dev
just test
```

Remove the symlink (or `unset VCPKG_OVERLAY_PORTS`) to build against the released lib again. Keep the export out of shell startup files.

## Rules

- Never push directly to `main`; all changes land through squash-merged pull requests.
- PRs touch no release files (`VERSION`, `CHANGELOG.md`, `versions/`, `Formula/*.rb`, `Casks/*.rb`).
- Write the PR title (plus optional body) as the changelog entry; squash-merge turns it into one commit on `main`.
- Sanitize everything (no secrets, tokens, DSNs, or personal data in commits, logs, or docs).
- Run `just test` (ASan + UBSan) and `just lint` before opening or updating a PR.

## PR, CI, and release flow

- Every PR runs `test.yml`: a `gate` job skips macOS/Linux builds on docs-only PRs, and a single `ci` summary job gates merge.
- Merging to `main` triggers `release.yml` (one release at a time). It collects squash commits since the last tag (skipping docs-only ranges), picks the bump from merged PR labels (`patch` default, or `release:minor` / `release:major`; agents must ask before adding labels), writes `VERSION`/`vcpkg.json`, `CHANGELOG.md` (and `vcpkg x-add-version` for libraries), commits as the GitHub App, tags `vX.Y.Z`, and publishes the GitHub Release (plus assets and `Formula/*.rb` / `Casks/*.rb` updates).
- Pre-releases are a known option (tag/channel), not currently built.

## Dependency bumps

Bump a library baseline in `vcpkg-configuration.json` only when a bug fix, new API, or security fix requires it; otherwise wait for the next `just upgrade-deps`.
<!-- cpp-templates:end -->

## Repository tips

Set `LLVM_BIN` to override the `llvm@23` binary directory for `clang-format` and `clang-tidy`. Run the direct binary on a separate dev port:

```bash
./build/bin/gws-mcp http --port 20006
```

On Linux (`ubuntu-24.04`), install `llvm@23` via Homebrew and enable lingering so `brew services` systemd user units survive logout (`loginctl enable-linger "$USER"`).

## Architecture

- `src/main.cpp`: `--log-file` parsing, `slimr::enable_http` on port `10006`, `app.run(argc, argv)`.
- `src/log_file.hpp`: file-descriptor redirection and 10 MiB log rotation.
- `src/app.hpp`: `gws::make_google_gws_app()`, API method blocklist, path containment, and typed C++ entrypoints.
- `src/client.hpp`: `posix_spawnp` + `poll()` subprocess runner for `gws`, stderr noise filter, 100 KB response cap.
- `src/mime.hpp`: base64url decoder, Gmail MIME tree walker, charset converter, attachment extractor.
- `src/html_to_text.hpp`: HTML-to-readable-text converter (strips hidden elements and UTM params).
- `tests/test_main.cpp`: unit, mock-runner, CLI, MCP `2026-07-28`, and HTTP concurrency tests.

## Dropped Tooling

Do not re-add foreground runners, local tap/overlay symlinking, GitHub-branch/local-publish/dry-run helpers, standalone formula checks, `release` recipe, or JS formula helpers.
