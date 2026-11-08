import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { profileArgs } from "../../gws/client.ts";
import { appWithGws, mockGws } from "../../test-helpers.ts";
import { buildCallArgs, CallInput } from "./command.ts";

describe("buildCallArgs", () => {
  test("builds service, resource path, method, params and body", () => {
    const input = CallInput.parse({
      body: { title: "Buy milk" },
      method: "insert",
      params: { tasklist: "@default" },
      resource: ["tasks"],
      service: "tasks",
    });
    assert.deepEqual(buildCallArgs(input), [
      "tasks",
      "tasks",
      "insert",
      "--params",
      '{"tasklist":"@default"}',
      "--json",
      '{"title":"Buy milk"}',
    ]);
  });

  test("merges fields into params and omits empty params", () => {
    const withFields = CallInput.parse({
      fields: "names,emailAddresses",
      method: "get",
      params: { resourceName: "people/me" },
      resource: ["people"],
      service: "people",
    });
    assert.deepEqual(buildCallArgs(withFields).slice(3), [
      "--params",
      '{"resourceName":"people/me","fields":"names,emailAddresses"}',
    ]);
    const bare = CallInput.parse({ method: "list", resource: ["calendarList"], service: "calendar" });
    assert.deepEqual(buildCallArgs(bare), ["calendar", "calendarList", "list"]);
  });

  test("pageAll adds --page-all, page limit, and nextPageToken to the field mask", () => {
    const input = CallInput.parse({
      fields: "connections(names)",
      method: "list",
      pageAll: true,
      pageLimit: 3,
      params: { resourceName: "people/me" },
      resource: ["people", "connections"],
      service: "people",
    });
    assert.deepEqual(buildCallArgs(input), [
      "people",
      "people",
      "connections",
      "list",
      "--params",
      '{"resourceName":"people/me","fields":"nextPageToken,connections(names)"}',
      "--page-all",
      "--page-limit",
      "3",
    ]);
  });

  test("rejects flag-like segments and non-API services", () => {
    assert.equal(CallInput.safeParse({ method: "list", resource: ["--upload"], service: "drive" }).success, false);
    assert.equal(CallInput.safeParse({ method: "export", resource: ["x"], service: "auth" }).success, false);
    assert.equal(CallInput.safeParse({ method: "+send", resource: ["users"], service: "gmail" }).success, false);
  });
});

describe("call command", () => {
  test("invokes gws with the profile and returns parsed JSON", async () => {
    const gws = mockGws(() => ({ messages: [{ id: "a" }] }));
    const result = await appWithGws(gws).invoke(["call"], {
      invocation: "mcp",
      toolArgs: { method: "list", params: { userId: "me" }, resource: ["users", "messages"], service: "gmail" },
    });
    assert.equal(result.kind, "ok");
    assert.deepEqual(result.response?.body, { messages: [{ id: "a" }] });
    assert.deepEqual(gws.calls[0], [
      ...profileArgs(),
      "gmail",
      "users",
      "messages",
      "list",
      "--params",
      '{"userId":"me"}',
    ]);
  });

  test("wraps pageAll pages", async () => {
    const gws = mockGws(() => ({ exitCode: 0, stderr: "", stdout: '{"items":[1]}\n{"items":[2]}' }));
    const result = await appWithGws(gws).invoke(["call"], {
      invocation: "mcp",
      toolArgs: { method: "list", pageAll: true, resource: ["tasklists"], service: "tasks" },
    });
    assert.deepEqual(result.response?.body, { pages: [{ items: [1] }, { items: [2] }] });
  });

  test("truncates oversized responses with a fields hint", async () => {
    const gws = mockGws(() => ({
      files: Array.from({ length: 3000 }, (_, i) => ({ id: `file-${i}`, name: "x".repeat(40) })),
    }));
    const result = await appWithGws(gws).invoke(["call"], {
      invocation: "mcp",
      toolArgs: { method: "list", resource: ["files"], service: "drive" },
    });
    const body = result.response?.body as { hint: string; truncated: boolean };
    assert.equal(body.truncated, true);
    assert.match(body.hint, /fields/);
  });

  test("reports gws errors as tool errors", async () => {
    const gws = mockGws(() => ({
      exitCode: 1,
      stderr: "",
      stdout: JSON.stringify({ error: { code: 404, message: "Not Found", reason: "notFound" } }),
    }));
    const result = await appWithGws(gws).invoke(["call"], {
      invocation: "mcp",
      toolArgs: { method: "get", params: { fileId: "nope" }, resource: ["files"], service: "drive" },
    });
    assert.equal(result.kind, "error");
    assert.match(result.stderr, /404 notFound/);
  });
});
