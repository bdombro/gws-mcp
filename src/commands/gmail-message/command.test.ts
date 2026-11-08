import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { profileArgs } from "../../gws/client.ts";
import { appWithGws, b64url, mockGws } from "../../test-helpers.ts";

const message = (id: string, text: string) => ({
  id,
  labelIds: ["INBOX"],
  payload: {
    body: { data: b64url(text) },
    headers: [{ name: "Subject", value: `S ${id}` }],
    mimeType: "text/plain",
  },
  threadId: "t1",
});

describe("gmail-message command", () => {
  test("fetches format=full and returns a readable summary", async () => {
    const gws = mockGws(() => message("m1", "Hello"));
    const result = await appWithGws(gws).invoke(["gmail-message", "m1"], { invocation: "mcp" });
    assert.equal(result.kind, "ok");
    assert.deepEqual(gws.calls[0], [
      ...profileArgs(),
      "gmail",
      "users",
      "messages",
      "get",
      "--params",
      '{"format":"full","id":"m1","userId":"me"}',
    ]);
    const body = result.response?.body as { body: string; subject: string };
    assert.equal(body.body, "Hello");
    assert.equal(body.subject, "S m1");
  });
});

describe("gmail-thread command", () => {
  test("summarizes every message in the thread", async () => {
    const gws = mockGws(() => ({ id: "t1", messages: [message("m1", "one"), message("m2", "two")] }));
    const result = await appWithGws(gws).invoke(["gmail-thread", "t1"], { invocation: "mcp" });
    assert.equal(result.kind, "ok");
    assert.equal(gws.calls[0]?.includes("threads"), true);
    const body = result.response?.body as { messages: { body: string }[]; threadId: string };
    assert.equal(body.threadId, "t1");
    assert.deepEqual(
      body.messages.map((m) => m.body),
      ["one", "two"],
    );
  });
});
