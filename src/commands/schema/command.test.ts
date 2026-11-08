import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { profileArgs } from "../../gws/client.ts";
import { appWithGws, mockGws } from "../../test-helpers.ts";

describe("schema command", () => {
  test("runs gws schema with optional --resolve-refs", async () => {
    const gws = mockGws(() => ({ httpMethod: "GET" }));
    const app = appWithGws(gws);
    const plain = await app.invoke(["schema", "tasks.tasks.list"], { invocation: "mcp" });
    assert.deepEqual(plain.response?.body, { httpMethod: "GET" });
    await app.invoke(["schema", "tasks.tasks.list", "--resolve-refs"], { invocation: "mcp" });
    assert.deepEqual(gws.calls, [
      [...profileArgs(), "schema", "tasks.tasks.list"],
      [...profileArgs(), "schema", "tasks.tasks.list", "--resolve-refs"],
    ]);
  });

  test("rejects malformed method ids without calling gws", async () => {
    const gws = mockGws(() => ({}));
    const result = await appWithGws(gws).invoke(["schema", "--", "--help"], { invocation: "cli" });
    assert.equal(result.kind, "error");
    assert.equal(gws.calls.length, 0);
  });

  test("hints to drop resolve-refs when gws crashes on recursive schemas", async () => {
    const gws = mockGws(() => ({ exitCode: null, signal: "SIGABRT", stderr: "stack overflow", stdout: "" }));
    const result = await appWithGws(gws).invoke(["schema", "gmail.users.messages.get", "--resolve-refs"], {
      invocation: "cli",
    });
    assert.equal(result.kind, "error");
    assert.match(result.stderr, /retry without it/);
  });
});
