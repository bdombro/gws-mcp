/*
gmail-thread: every message in a Gmail thread as readable headers, text bodies, and attachments.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { GmailMessageSummary, type GmailRawMessage, summarizeMessage } from "../../gmail/mime.ts";
import { runGws } from "../../gws/client.ts";

/** Body character budget shared by all messages in a thread. */
const THREAD_BODY_BUDGET = 80_000;

/** Floor on each message's body cap, so long threads still show something per message. */
const MIN_BODY_CHARS = 4_000;

/** JSON result of `gmail-thread`. */
export const GmailThreadOutput = z.strictObject({
  messages: z.array(GmailMessageSummary).describe("Messages oldest first."),
  threadId: z.string().describe("Thread id."),
});
export type GmailThreadOutput = z.infer<typeof GmailThreadOutput>;

/** Fetches a Gmail thread (format=full) and returns each message as readable text. */
export const gmailThreadCommand = command({
  key: "gmail-thread",
  description: "Read a whole Gmail thread: each message's headers, plain-text body, attachments, labels.",
  mcpTool: { annotations: { openWorldHint: true, readOnlyHint: true } },
  outputSchema: GmailThreadOutput,
  positionals: [
    {
      name: "id",
      description: "Gmail thread id (threadId from a message or gmail users.threads.list).",
      kind: OptionKind.String,
      argMin: 1,
      argMax: 1,
    },
  ],
  handler: async (ctx) => {
    const thread = (await runGws(
      ctx.locals.gws,
      [
        "gmail",
        "users",
        "threads",
        "get",
        "--params",
        JSON.stringify({ format: "full", id: ctx.inputs.id, userId: "me" }),
      ],
      { signal: ctx.mcp?.signal },
    )) as { id: string; messages?: GmailRawMessage[] };
    const messages = thread.messages ?? [];
    const perMessage = Math.max(MIN_BODY_CHARS, Math.floor(THREAD_BODY_BUDGET / Math.max(1, messages.length)));
    return { messages: messages.map((m) => summarizeMessage(m, perMessage)), threadId: thread.id };
  },
});
