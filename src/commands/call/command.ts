/*
call: run any Google Workspace API method through gws and return its parsed JSON.
*/

import { command } from "argsbarg";
import { z } from "zod";
import { capJson } from "../../gws/cap.ts";
import { runGws } from "../../gws/client.ts";

/** gws services that map to Google discovery APIs (helper-only and auth commands excluded). */
export const GWS_SERVICES = [
  "admin-reports",
  "calendar",
  "chat",
  "classroom",
  "docs",
  "drive",
  "events",
  "forms",
  "gmail",
  "keep",
  "meet",
  "modelarmor",
  "people",
  "script",
  "sheets",
  "slides",
  "tasks",
] as const;

/** An API name segment; the leading letter blocks flag injection (`--upload`, `+send`). */
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Tool body for `call`. */
export const CallInput = z.strictObject({
  body: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Request body for POST/PATCH/PUT methods (e.g. an event, a task, a contact)."),
  fields: z
    .string()
    .optional()
    .describe(
      'Google partial-response field mask, e.g. "messages(id,threadId),nextPageToken" or "files(id,name,mimeType)". Strongly recommended to keep results small.',
    ),
  method: z
    .string()
    .regex(NAME_PATTERN)
    .describe('API method name, e.g. "list", "get", "insert", "patch", "getProfile".'),
  pageAll: z
    .boolean()
    .default(false)
    .describe("Auto-paginate list methods; the result becomes { pages: [...] } (one entry per page)."),
  pageLimit: z.number().int().min(1).max(100).optional().describe("Max pages to fetch with pageAll (gws default 10)."),
  params: z
    .record(z.string(), z.unknown())
    .default({})
    .describe('URL path and query parameters, e.g. {"userId":"me","q":"from:alice","maxResults":10}.'),
  resource: z
    .array(z.string().regex(NAME_PATTERN))
    .min(1)
    .describe(
      'Resource path from the service down to the method, e.g. ["users","messages"] for gmail, ["people","connections"] for people, ["tasks"] for tasks.tasks.list.',
    ),
  service: z.enum(GWS_SERVICES).describe("gws service (Google API) name."),
});
export type CallInput = z.infer<typeof CallInput>;

/** Calls any Google Workspace API method; may mutate data (send mail, delete files). */
export const callCommand = command({
  key: "call",
  description:
    "Call any Google Workspace API method (gws <service> <resource…> <method>) and return the JSON response. Can read or write. Blocked for safety: sending Gmail (messages.send, drafts.send), Gmail filters, forwarding addresses, delegates and auto-forwarding, Drive permissions.create/update and files.delete, Calendar acl.*, and script.scripts.run. For sharing use gdocsmith, or ask Brian.",
  kind: "document",
  inputSchema: CallInput,
  mcpTool: {
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true, readOnlyHint: false },
  },
  notes:
    'Example: {"service":"gmail","resource":["users","messages"],"method":"list","params":{"userId":"me","q":"is:unread","maxResults":5},"fields":"messages(id,threadId)"}. Discover parameters with the schema tool (e.g. "gmail.users.messages.list").',
  handler: async (ctx) => {
    const blocked = blockedMethod(ctx.inputs);
    if (blocked) {
      throw new Error(
        `Blocked: ${blocked} is not allowed through call (sending mail, Gmail filters/forwarding/delegates, Drive sharing and deletes, Calendar ACLs and Apps Script runs are refused). Use gdocsmith for sharing, or ask Brian.`,
      );
    }
    const result = await runGws(ctx.locals.gws, buildCallArgs(ctx.inputs), {
      ndjson: ctx.inputs.pageAll,
      signal: ctx.mcp?.signal,
    });
    const shaped = ctx.inputs.pageAll ? { pages: result } : result;
    return capJson(
      shaped,
      'Use `fields` to select only needed fields (e.g. "files(id,name)"), lower maxResults/pageSize, or drop pageAll.',
    ) as Record<string, unknown>;
  },
});

/** Methods `call` refuses, as dotted `service.resource….method` paths; a trailing `*` blocks everything below. */
export const BLOCKED_METHODS = [
  "gmail.users.messages.send",
  "gmail.users.drafts.send",
  "gmail.users.settings.filters.*",
  "gmail.users.settings.forwardingAddresses.*",
  "gmail.users.settings.delegates.*",
  "gmail.users.settings.updateAutoForwarding",
  "drive.permissions.create",
  "drive.permissions.update",
  "drive.files.delete",
  "calendar.acl.*",
  "script.scripts.run",
];

/**
 * The blocked method path a call targets (e.g. "gmail.users.messages.send"), or undefined.
 * Service, resource and method are joined into one dotted path and compared case-insensitively
 * with `-`/`_` removed, so `Gmail`, `forwarding-addresses` and extra or shifted segments cannot
 * dodge the list (a rule also matches when the call path just starts with it).
 */
export function blockedMethod(
  /** The `call` input. */
  input: Pick<CallInput, "method" | "resource" | "service">,
): string | undefined {
  const path = [input.service, ...input.resource, input.method].map(normalizeSegment);
  return BLOCKED_METHODS.find((rule) => {
    const parts = rule.split(".").map(normalizeSegment);
    const wildcard = parts.at(-1) === "*";
    const prefix = wildcard ? parts.slice(0, -1) : parts;
    return prefix.every((part, i) => path[i] === part) && (wildcard ? path.length > prefix.length : true);
  });
}

/** Builds gws argv (without the profile flag) for a `call` body. */
export function buildCallArgs(input: CallInput): string[] {
  const params: Record<string, unknown> = { ...input.params };
  if (input.fields) {
    params.fields =
      input.pageAll && !input.fields.includes("nextPageToken") ? `nextPageToken,${input.fields}` : input.fields;
  }
  const args: string[] = [input.service, ...input.resource, input.method];
  if (Object.keys(params).length) args.push("--params", JSON.stringify(params));
  if (input.body) args.push("--json", JSON.stringify(input.body));
  if (input.pageAll) {
    args.push("--page-all");
    if (input.pageLimit) args.push("--page-limit", String(input.pageLimit));
  }
  return args;
}

/** Lowercases a path segment and drops `-`/`_` so spelling variants compare equal. */
function normalizeSegment(segment: string): string {
  return segment.toLowerCase().replace(/[-_]/g, "");
}
