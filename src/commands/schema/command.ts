/*
schema: describe a Google API method (parameters, request and response shapes) via `gws schema`.
*/

import { command, OptionKind } from "argsbarg";
import { capJson } from "../../gws/cap.ts";
import { GwsError, runGws } from "../../gws/client.ts";

/** Prints the discovery schema for one API method. */
export const schemaCommand = command({
  key: "schema",
  description: "Show a Google API method's parameters and request/response schema (gws schema).",
  mcpTool: { annotations: { openWorldHint: false, readOnlyHint: true } },
  options: [
    {
      name: "resolve-refs",
      description: "Inline referenced schema types (can be large; fails on recursive types like gmail messages).",
      kind: OptionKind.Presence,
    },
  ],
  positionals: [
    {
      name: "method",
      description:
        'Dotted method id: service.resource[.sub].method, e.g. "gmail.users.messages.list", "tasks.tasks.insert".',
      kind: OptionKind.String,
      argMin: 1,
      argMax: 1,
    },
  ],
  handler: async (ctx) => {
    const method = ctx.inputs.method;
    if (!/^[A-Za-z][\w-]*(\.[A-Za-z][\w-]*)+$/.test(method)) {
      throw new Error(`Invalid method id "${method}"; expected e.g. gmail.users.messages.list`);
    }
    const resolveRefs = ctx.inputs["resolve-refs"];
    const args = ["schema", method, ...(resolveRefs ? ["--resolve-refs"] : [])];
    try {
      const result = await runGws(ctx.locals.gws, args, { signal: ctx.mcp?.signal });
      if (resolveRefs && result && typeof result === "object" && !Object.keys(result).length) {
        throw new GwsError("gws schema --resolve-refs returned nothing (recursive schema?); retry without it.");
      }
      return capJson(result, "Retry without resolve-refs.") as Record<string, unknown>;
    } catch (err) {
      if (resolveRefs && err instanceof GwsError && !err.message.includes("retry without")) {
        throw new GwsError(`${err.message}\n(--resolve-refs fails on recursive schemas; retry without it.)`);
      }
      throw err;
    }
  },
});
