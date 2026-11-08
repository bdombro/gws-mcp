import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { appWithGws, mockGws } from "../../test-helpers.ts";
import { ensureFolderPath, resolveUploadPath } from "./command.ts";

const base = mkdtempSync(join(tmpdir(), "gws-upload-"));
const home = join(base, "home");
const temp = join(base, "tmp");
for (const dir of [".ssh", ".config/x", "Library/Caches", "Documents", "visible/.hidden"]) {
  mkdirSync(join(home, dir), { recursive: true });
}
mkdirSync(temp);
const files = {
  config: join(home, ".config/x/a.txt"),
  doc: join(home, "Documents/a.txt"),
  hidden: join(home, "visible/.hidden/a.txt"),
  key: join(home, ".ssh/id_rsa"),
  lib: join(home, "Library/Caches/a.txt"),
  outside: join(base, "outside.txt"),
  scratch: join(temp, "a.txt"),
};
for (const f of Object.values(files)) writeFileSync(f, "x");
symlinkSync(files.key, join(home, "Documents/link"));
symlinkSync(files.doc, join(home, ".dotfile-link"));
after(() => rmSync(base, { force: true, recursive: true }));

const resolveIn = (file: string) => resolveUploadPath(file, home, [temp]);

describe("resolveUploadPath", () => {
  test("allows regular files under home and temp dirs", () => {
    assert.match(resolveIn(files.doc), /Documents\/a\.txt$/);
    assert.match(resolveIn(files.scratch), /tmp\/a\.txt$/);
  });

  test("refuses hidden components, ~/Library, and outside paths", () => {
    for (const f of [files.key, files.config, files.hidden]) assert.throws(() => resolveIn(f), /hidden/);
    assert.throws(() => resolveIn(files.lib), /Library/);
    assert.throws(() => resolveIn(files.outside), /under \$HOME/);
  });

  test("resolves symlinks before checking", () => {
    assert.throws(() => resolveIn(join(home, "Documents/link")), /hidden/);
    // A dotfile symlinked to a visible target (like ~/.zshrc -> dotfiles repo) is still refused.
    assert.throws(() => resolveIn(join(home, ".dotfile-link")), /hidden/);
  });

  test("refuses directories and missing files", () => {
    assert.throws(() => resolveIn(join(home, "Documents")), /regular file/);
    assert.throws(() => resolveIn(join(home, "Documents/nope")), /not found/);
  });
});

describe("drive-upload command", () => {
  test("refuses a sensitive file before calling gws", async () => {
    const gws = mockGws(() => ({ id: "x", name: "x" }));
    const result = await appWithGws(gws).invoke(["drive-upload", "--file", "/etc/hosts"]);
    assert.equal(result.kind, "error");
    assert.match(result.stderr, /Refused/);
    assert.equal(gws.calls.length, 0);
  });
});

describe("ensureFolderPath", () => {
  test("reuses existing folders and creates missing ones", async () => {
    const gws = mockGws((args) => {
      const op = args[4];
      if (op === "list") return args.join(" ").includes("'Backups'") ? { files: [{ id: "f1" }] } : { files: [] };
      return { id: "f2" };
    });
    assert.equal(await ensureFolderPath(gws, "Backups/personal-log"), "f2");
    assert.equal(gws.calls.length, 3);
    assert.match(gws.calls[1]?.join(" ") ?? "", /'personal-log' and 'f1' in parents/);
    assert.match(gws.calls[2]?.join(" ") ?? "", /"parents":\["f1"\]/);
  });

  test("empty path is My Drive", async () => {
    assert.equal(
      await ensureFolderPath(
        mockGws(() => ({})),
        "",
      ),
      "root",
    );
  });
});
