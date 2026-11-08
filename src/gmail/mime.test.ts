import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { b64url } from "../test-helpers.ts";
import { collectAttachments, findBodyPart, type GmailRawMessage, summarizeMessage } from "./mime.ts";

const headers = [
  { name: "From", value: "Alice <alice@example.com>" },
  { name: "To", value: "brian@example.com" },
  { name: "CC", value: "bob@example.com" },
  { name: "Date", value: "Fri, 6 Nov 2026 10:00:00 -0600" },
  { name: "Subject", value: "Field trip" },
];

/** multipart/mixed > (multipart/alternative > plain + html) + pdf attachment. */
const MIXED: GmailRawMessage = {
  id: "m1",
  labelIds: ["INBOX", "UNREAD"],
  payload: {
    headers,
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          {
            body: { data: b64url("Hi,\r\n\r\n\r\n\r\nSee attached.\r\n"), size: 20 },
            headers: [{ name: "Content-Type", value: 'text/plain; charset="UTF-8"' }],
            mimeType: "text/plain",
          },
          { body: { data: b64url("<p>Hi,</p><p>See <b>attached</b>.</p>") }, mimeType: "text/html" },
        ],
      },
      {
        body: { attachmentId: "ATT1", size: 12345 },
        filename: "permission.pdf",
        mimeType: "application/pdf",
      },
    ],
  },
  snippet: "Hi, See attached.",
  threadId: "t1",
};

describe("gmail MIME walking", () => {
  test("prefers text/plain inside nested multiparts", () => {
    const summary = summarizeMessage(MIXED, 1000);
    assert.equal(summary.bodySource, "text/plain");
    assert.equal(summary.body, "Hi,\n\nSee attached.");
  });

  test("extracts headers case-insensitively, labels and thread id", () => {
    const s = summarizeMessage(MIXED, 1000);
    assert.equal(s.from, "Alice <alice@example.com>");
    assert.equal(s.cc, "bob@example.com");
    assert.equal(s.subject, "Field trip");
    assert.deepEqual(s.labelIds, ["INBOX", "UNREAD"]);
    assert.equal(s.threadId, "t1");
  });

  test("lists attachments with id, type and size", () => {
    assert.deepEqual(collectAttachments(MIXED.payload), [
      { attachmentId: "ATT1", filename: "permission.pdf", mimeType: "application/pdf", size: 12345 },
    ]);
  });

  test("falls back to HTML converted to text", () => {
    const htmlOnly: GmailRawMessage = {
      id: "m2",
      payload: { body: { data: b64url("<div>Hello&nbsp;there</div><div>Bye</div>") }, headers, mimeType: "text/html" },
      threadId: "t2",
    };
    const s = summarizeMessage(htmlOnly, 1000);
    assert.equal(s.bodySource, "text/html");
    assert.equal(s.body, "Hello there\nBye");
    assert.deepEqual(s.labelIds, []);
  });

  test("ignores text parts that are attachments", () => {
    const part = { body: { data: b64url("notes") }, filename: "notes.txt", mimeType: "text/plain" };
    assert.equal(findBodyPart({ mimeType: "multipart/mixed", parts: [part] }, "text/plain"), undefined);
  });

  test("decodes declared non-UTF-8 charsets", () => {
    const latin1: GmailRawMessage = {
      id: "m3",
      payload: {
        body: { data: Buffer.from("Caf\xe9", "latin1").toString("base64url") },
        headers: [{ name: "Content-Type", value: "text/plain; charset=ISO-8859-1" }],
        mimeType: "text/plain",
      },
      threadId: "t3",
    };
    assert.equal(summarizeMessage(latin1, 100).body, "Café");
  });

  test("truncates long bodies and reports none when no text part", () => {
    const long: GmailRawMessage = {
      id: "m4",
      payload: { body: { data: b64url("x".repeat(50)) }, mimeType: "text/plain" },
      threadId: "t4",
    };
    const s = summarizeMessage(long, 10);
    assert.equal(s.bodyTruncated, true);
    assert.match(s.body, /^x{10}\n…\[truncated\]$/);
    const empty = summarizeMessage({ id: "m5", payload: { mimeType: "multipart/mixed" }, threadId: "t5" }, 10);
    assert.equal(empty.bodySource, "none");
    assert.equal(empty.body, "");
  });
});
