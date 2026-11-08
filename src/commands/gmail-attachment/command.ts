/*
gmail-attachment: download one Gmail attachment to a local file. `call` can't do this for real
files because its results are capped at 100 KB and attachments come back as base64url JSON.
Local-only by nature: it writes a file on this machine.
*/

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { type GwsRunner, runGws } from "../../gws/client.ts";

/** Download result. */
export const GmailAttachmentOutput = z.strictObject({
  path: z.string().describe("Absolute path of the file written."),
  bytes: z.number().int().describe("Bytes written."),
});
export type GmailAttachmentOutput = z.infer<typeof GmailAttachmentOutput>;

/** Saves one attachment to disk. */
export const gmailAttachmentCommand = command({
  key: "gmail-attachment",
  description: "Download one Gmail attachment (by message id and attachment id from gmail-message) to a local file.",
  mcpTool: { annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false } },
  options: [
    { name: "message-id", description: "Gmail message id.", kind: OptionKind.String, required: true },
    {
      name: "attachment-id",
      description: "Attachment id (from gmail-message `attachments[].attachmentId`).",
      kind: OptionKind.String,
      required: true,
    },
    {
      name: "out",
      description: "Local file path to write (overwritten if it exists).",
      kind: OptionKind.String,
      required: true,
    },
  ],
  outputSchema: GmailAttachmentOutput,
  handler: async (ctx) => {
    const bytes = await fetchAttachment(
      ctx.locals.gws,
      ctx.inputs["message-id"] as string,
      ctx.inputs["attachment-id"] as string,
    );
    const path = resolve(ctx.inputs.out as string);
    writeFileSync(path, bytes);
    return { path, bytes: bytes.length };
  },
});

/** Decoded bytes of one attachment (gmail users.messages.attachments.get, base64url `data`). */
export async function fetchAttachment(
  /** gws runner. */
  gws: GwsRunner,
  /** Gmail message id. */
  messageId: string,
  /** Attachment id. */
  attachmentId: string,
): Promise<Buffer> {
  const res = (await runGws(gws, [
    "gmail",
    "users",
    "messages",
    "attachments",
    "get",
    "--params",
    JSON.stringify({ userId: "me", messageId, id: attachmentId }),
  ])) as { data?: string };
  if (!res.data) throw new Error("Gmail returned no attachment data.");
  return Buffer.from(res.data, "base64url");
}
