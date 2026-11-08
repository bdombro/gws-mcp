import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { appWithGws, b64url, mockGws } from "../../test-helpers.ts";
import { assertMessageId, fetchAttachment, sanitizeFilename, saveAttachment } from "./command.ts";

const root = mkdtempSync(join(tmpdir(), "gws-attach-"));
after(() => rmSync(root, { force: true, recursive: true }));

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

describe("sanitizeFilename", () => {
  test("keeps ordinary names", () => {
    assert.equal(sanitizeFilename("Report 2026-01.pdf"), "Report 2026-01.pdf");
  });

  test("flattens separators and traversal", () => {
    assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
    assert.equal(sanitizeFilename("..\\..\\evil.exe"), "evil.exe");
    assert.equal(sanitizeFilename("a..b/../c..d.txt"), "c.d.txt");
  });

  test("drops leading dots and unsafe characters", () => {
    assert.equal(sanitizeFilename(".bashrc"), "bashrc");
    assert.equal(sanitizeFilename("..."), "attachment");
    assert.equal(sanitizeFilename("a<b>:c|d\u0000e\u202egpj.exe"), "a_b__c_d_e_gpj.exe");
  });

  test("falls back to attachment when empty", () => {
    assert.equal(sanitizeFilename(undefined), "attachment");
    assert.equal(sanitizeFilename("/"), "attachment");
  });

  test("caps length and keeps the extension", () => {
    const name = sanitizeFilename(`${"a".repeat(300)}.pdf`);
    assert.equal(name.length, 100);
    assert.ok(name.endsWith(".pdf"));
  });
});

describe("assertMessageId", () => {
  test("accepts alphanumeric ids and refuses anything else", () => {
    assertMessageId("19a1b6731c6fdd2af");
    for (const bad of ["", "../x", "a/b", "a b", "a.b", "a-b"]) assert.throws(() => assertMessageId(bad), /Invalid/);
  });
});

describe("saveAttachment", () => {
  test("writes under <root>/<messageId>/ and never overwrites", () => {
    const first = saveAttachment(Buffer.from("one"), "m1", "doc.txt", root);
    const second = saveAttachment(Buffer.from("two"), "m1", "doc.txt", root);
    const third = saveAttachment(Buffer.from("three"), "m1", "doc.txt", root);
    assert.equal(first, join(root, "m1", "doc.txt"));
    assert.equal(second, join(root, "m1", "doc-1.txt"));
    assert.equal(third, join(root, "m1", "doc-2.txt"));
    assert.equal(readFileSync(first, "utf8"), "one");
    assert.equal(readFileSync(second, "utf8"), "two");
  });

  test("a traversal name stays inside the message folder", () => {
    const path = saveAttachment(Buffer.from("x"), "m2", "../../../escape.txt", root);
    assert.equal(path, join(root, "m2", "escape.txt"));
    assert.deepEqual(readdirSync(join(root, "m2")), ["escape.txt"]);
  });

  test("refuses a bad message id", () => {
    assert.throws(() => saveAttachment(Buffer.from("x"), "../m3", "a.txt", root), /Invalid/);
  });
});

describe("gmail-attachment command", () => {
  test("refuses a bad message id before calling gws", async () => {
    const gws = mockGws(() => ({ data: b64url("x") }));
    const result = await appWithGws(gws).invoke([
      "gmail-attachment",
      "--message-id",
      "../evil",
      "--attachment-id",
      "a1",
    ]);
    assert.equal(result.kind, "error");
    assert.match(result.stderr, /Invalid Gmail message id/);
    assert.equal(gws.calls.length, 0);
  });
});
