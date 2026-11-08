import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mockGws } from "../test-helpers.ts";
import { capJson } from "./cap.ts";
import { GwsError, profileArgs, runGws } from "./client.ts";

describe("profileArgs", () => {
  test("defaults to bdombro, honors override, omits when empty", () => {
    assert.deepEqual(profileArgs(undefined), ["--profile", "bdombro"]);
    assert.deepEqual(profileArgs("ss"), ["--profile", "ss"]);
    assert.deepEqual(profileArgs(""), []);
  });
});

describe("runGws", () => {
  test("prepends the profile flag and parses JSON", async () => {
    const gws = mockGws(() => ({ ok: 1 }));
    assert.deepEqual(await runGws(gws, ["drive", "about", "get"]), { ok: 1 });
    assert.deepEqual(gws.calls[0], [...profileArgs(), "drive", "about", "get"]);
  });

  test("parses NDJSON pages", async () => {
    const gws = mockGws(() => ({ exitCode: 0, stderr: "", stdout: '{"p":1}\n{"p":2}\n' }));
    assert.deepEqual(await runGws(gws, ["x"], { ndjson: true }), [{ p: 1 }, { p: 2 }]);
  });

  test("returns {} for empty successful output", async () => {
    const gws = mockGws(() => ({ exitCode: 0, stderr: "", stdout: "" }));
    assert.deepEqual(await runGws(gws, ["x"]), {});
  });

  test("surfaces gws JSON API errors", async () => {
    const stdout = JSON.stringify({ error: { code: 400, message: "Invalid id value", reason: "invalidArgument" } });
    const gws = mockGws(() => ({ exitCode: 1, stderr: "Using keyring backend: keyring\nerror[api]: x", stdout }));
    await assert.rejects(runGws(gws, ["x"]), (err: Error) => {
      assert.ok(err instanceof GwsError);
      assert.equal(err.message, "gws error (400 invalidArgument): Invalid id value");
      return true;
    });
  });

  test("falls back to stderr without keyring noise when killed", async () => {
    const gws = mockGws(() => ({
      exitCode: null,
      signal: "SIGABRT",
      stderr: "Using keyring backend: keyring\nfatal runtime error: stack overflow",
      stdout: "",
    }));
    await assert.rejects(runGws(gws, ["x"]), /gws failed \(signal SIGABRT\): fatal runtime error: stack overflow$/);
  });
});

describe("capJson", () => {
  test("passes small values through", () => {
    const value = { a: 1 };
    assert.equal(capJson(value, "hint"), value);
  });

  test("replaces oversized values with a notice, hint and preview", () => {
    const result = capJson({ big: "x".repeat(500) }, "Use fields.", 100);
    assert.ok("truncated" in result);
    assert.equal(result.limitBytes, 100);
    assert.ok(result.bytes > 100);
    assert.match(result.hint, /over the 100-byte limit\. Use fields\.$/);
    assert.ok(result.preview.startsWith('{"big":"xxx'));
  });
});
