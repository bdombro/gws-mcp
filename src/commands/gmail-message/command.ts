/*
gmail-message: one Gmail message as readable headers, text body, and attachment list.
*/

import { command, OptionKind } from "argsbarg";
import { GmailMessageSummary, type GmailRawMessage, summarizeMessage } from "../../gmail/mime.ts";
import { runGws } from "../../gws/client.ts";

/** Body character cap for a single message. */
const MAX_BODY_CHARS = 50_000;

/** Fetches a Gmail message (format=full) and returns it as readable text. */
export const gmailMessageCommand = command({
  key: "gmail-message",
  description: "Read one Gmail message: headers, body as plain text (HTML converted), attachments, labels.",
  mcpTool: { annotations: { openWorldHint: true, readOnlyHint: true } },
  outputSchema: GmailMessageSummary,
  positionals: [
    {
      name: "id",
      description: "Gmail message id (from gmail users.messages.list).",
      kind: OptionKind.String,
      argMin: 1,
      argMax: 1,
    },
  ],
  handler: async (ctx) => {
    const message = (await runGws(
      ctx.locals.gws,
      [
        "gmail",
        "users",
        "messages",
        "get",
        "--params",
        JSON.stringify({ format: "full", id: ctx.inputs.id, userId: "me" }),
      ],
      { signal: ctx.mcp?.signal },
    )) as GmailRawMessage;
    return summarizeMessage(message, MAX_BODY_CHARS);
  },
});
