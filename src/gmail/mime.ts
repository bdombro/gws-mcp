/*
Gmail message simplification: walks the MIME tree of a `format=full` message and returns
headers, a readable text body, and attachment metadata.
*/

import { z } from "zod";
import { htmlToText } from "../html-to-text.ts";

/** One attachment's metadata (fetch bytes with `users.messages.attachments.get`). */
export const GmailAttachment = z.strictObject({
  attachmentId: z
    .string()
    .optional()
    .describe("Pass to gmail users.messages.attachments.get (with the message id) to download the bytes."),
  filename: z.string().describe("Attachment file name."),
  mimeType: z.string().describe("Attachment MIME type."),
  size: z.number().describe("Attachment size in bytes."),
});
export type GmailAttachment = z.infer<typeof GmailAttachment>;

/** A Gmail message reduced to what a reader needs. */
export const GmailMessageSummary = z.strictObject({
  attachments: z.array(GmailAttachment).describe("Attachments (parts with a filename)."),
  body: z.string().describe("Body as plain text (text/plain part, else HTML converted to text)."),
  bodySource: z.enum(["text/plain", "text/html", "none"]).describe("Which MIME part the body came from."),
  bodyTruncated: z.boolean().describe("True when the body was cut to the character limit."),
  cc: z.string().optional().describe("Cc header."),
  date: z.string().optional().describe("Date header."),
  from: z.string().optional().describe("From header."),
  id: z.string().describe("Message id."),
  labelIds: z.array(z.string()).describe("Gmail label ids (e.g. INBOX, UNREAD)."),
  snippet: z.string().optional().describe("Gmail's short snippet."),
  subject: z.string().optional().describe("Subject header."),
  threadId: z.string().describe("Thread id."),
  to: z.string().optional().describe("To header."),
});
export type GmailMessageSummary = z.infer<typeof GmailMessageSummary>;

/** Subset of the Gmail API `MessagePart` this module reads. */
export type GmailPart = {
  body?: { attachmentId?: string; data?: string; size?: number };
  filename?: string;
  headers?: { name: string; value: string }[];
  mimeType?: string;
  parts?: GmailPart[];
};

/** Subset of the Gmail API `Message` this module reads. */
export type GmailRawMessage = {
  id: string;
  labelIds?: string[];
  payload?: GmailPart;
  snippet?: string;
  threadId: string;
};

/** Lists parts that carry a filename (attachments and named inline images), depth-first. */
export function collectAttachments(part: GmailPart | undefined): GmailAttachment[] {
  if (!part) return [];
  const own: GmailAttachment[] = part.filename
    ? [
        {
          attachmentId: part.body?.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType ?? "application/octet-stream",
          size: part.body?.size ?? 0,
        },
      ]
    : [];
  return [...own, ...(part.parts ?? []).flatMap(collectAttachments)];
}

/** Decodes a part's base64url body using the charset from its Content-Type (default UTF-8). */
export function decodePartBody(part: GmailPart): string {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const contentType = headerValue(part.headers, "content-type") ?? "";
  const charset = /charset="?([^";\s]+)"?/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Finds the first non-attachment part of `mimeType` with inline body data, depth-first. */
export function findBodyPart(part: GmailPart | undefined, mimeType: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part;
  for (const child of part.parts ?? []) {
    const hit = findBodyPart(child, mimeType);
    if (hit) return hit;
  }
  return undefined;
}

/** Reduces a `format=full` Gmail message to headers, text body, and attachments. */
export function summarizeMessage(message: GmailRawMessage, maxBodyChars: number): GmailMessageSummary {
  const headers = message.payload?.headers;
  const plain = findBodyPart(message.payload, "text/plain");
  const html = plain ? undefined : findBodyPart(message.payload, "text/html");
  let body = "";
  let bodySource: GmailMessageSummary["bodySource"] = "none";
  if (plain) {
    body = decodePartBody(plain)
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    bodySource = "text/plain";
  } else if (html) {
    body = htmlToText(decodePartBody(html));
    bodySource = "text/html";
  }
  const bodyTruncated = body.length > maxBodyChars;
  return {
    attachments: collectAttachments(message.payload),
    body: bodyTruncated ? `${body.slice(0, maxBodyChars)}\n…[truncated]` : body,
    bodySource,
    bodyTruncated,
    cc: headerValue(headers, "cc"),
    date: headerValue(headers, "date"),
    from: headerValue(headers, "from"),
    id: message.id,
    labelIds: message.labelIds ?? [],
    snippet: message.snippet,
    subject: headerValue(headers, "subject"),
    threadId: message.threadId,
    to: headerValue(headers, "to"),
  };
}

/** Case-insensitive header lookup (first match). */
function headerValue(headers: GmailPart["headers"], name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name)?.value;
}
