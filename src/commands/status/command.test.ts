import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { app } from "../../app.ts";

describe("status command", () => {
  test("returns version and profile", async () => {
    const result = await app.invoke(["status"], { invocation: "http" });
    assert.equal(result.kind, "ok");
    const body = result.response?.body as { profile: string; version: string };
    assert.match(body.version, /^\d+\.\d+\.\d+/);
    assert.equal(typeof body.profile, "string");
  });
});
