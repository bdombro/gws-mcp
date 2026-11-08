import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mockGws } from "../../test-helpers.ts";
import { ensureFolderPath } from "./command.ts";

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
