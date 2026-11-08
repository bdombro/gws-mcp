/*
status: report the app version and the gws profile in use.
*/

import { command } from "argsbarg";
import { z } from "zod";
import { profileArgs } from "../../gws/client.ts";

/** JSON result of `google-gws-mcp status`. */
export const StatusOutput = z.strictObject({
  profile: z.string().describe("gws profile passed as --profile (GWS_PROFILE, default bdombro); empty when omitted."),
  version: z.string().describe("App version."),
});
export type StatusOutput = z.infer<typeof StatusOutput>;

/** Returns the app version and gws profile. */
export const statusCommand = command({
  key: "status",
  description: "Show the app version and the gws profile in use.",
  mcpTool: { annotations: { openWorldHint: false, readOnlyHint: true } },
  outputSchema: StatusOutput,
  handler: (ctx): StatusOutput => ({ profile: profileArgs()[1] ?? "", version: ctx.spec.version }),
});
