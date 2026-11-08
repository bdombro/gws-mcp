import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { b64url, mockGws } from "../../test-helpers.ts";
import { fetchAttachment } from "./command.ts";

describe("fetchAttachment", () => {
  test("decodes base64url data", async () => {
    const gws = mockGws(() => ({ data: b64url("%PDF-1.4 hello?>") }));
    assert.equal((await fetchAttachment(gws, "m1", "a1")).toString("utf8"), "%PDF-1.4 hello?>");
    assert.match(
      gws.calls[0]?.join(" ") ?? "",
      /attachments get --params \{"userId":"me","messageId":"m1","id":"a1"\}/,
    );
  });

  test("fails when there is no data", async () => {
    await assert.rejects(
      fetchAttachment(
        mockGws(() => ({})),
        "m1",
        "a1",
      ),
      /no attachment data/,
    );
  });
});
