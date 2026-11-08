/*
drive-upload: upload a local file to Google Drive (gws drive files create --upload), into a folder
given by id or by a "My Drive" path that is created when missing. Local-only by nature: it reads a
file from this machine.
*/

import { command, OptionKind } from "argsbarg";
import { z } from "zod";
import { type GwsRunner, runGws } from "../../gws/client.ts";

/** Upload result. */
export const DriveUploadOutput = z.strictObject({
  id: z.string().describe("New Drive file id."),
  name: z.string().describe("File name in Drive."),
  folderId: z.string().describe("Folder it was uploaded into."),
  webViewLink: z.string().optional().describe("Link to open the file."),
});
export type DriveUploadOutput = z.infer<typeof DriveUploadOutput>;

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Uploads one file. */
export const driveUploadCommand = command({
  key: "drive-upload",
  description:
    "Upload a local file to Google Drive into a folder (by id, or a My Drive path like 'Backups/personal-log', created if missing).",
  mcpTool: { annotations: { destructiveHint: false, openWorldHint: true, readOnlyHint: false } },
  options: [
    { name: "file", description: "Local file path to upload.", kind: OptionKind.String, required: true },
    { name: "name", description: "Name in Drive (default: the local file name).", kind: OptionKind.String },
    { name: "folder-id", description: "Destination folder id.", kind: OptionKind.String },
    {
      name: "folder-path",
      description: "Destination folder path under My Drive, e.g. 'Backups/personal-log'; created when missing.",
      kind: OptionKind.String,
    },
    { name: "mime-type", description: "MIME type (default: guessed from the extension).", kind: OptionKind.String },
  ],
  outputSchema: DriveUploadOutput,
  handler: async (ctx) => {
    const file = ctx.inputs.file as string;
    const name = (ctx.inputs.name as string | undefined) ?? file.split("/").pop() ?? file;
    const folderId =
      (ctx.inputs["folder-id"] as string | undefined) ??
      (await ensureFolderPath(ctx.locals.gws, (ctx.inputs["folder-path"] as string | undefined) ?? ""));
    const mime = ctx.inputs["mime-type"] as string | undefined;
    const created = (await runGws(ctx.locals.gws, [
      "drive",
      "files",
      "create",
      "--upload",
      file,
      ...(mime ? ["--upload-content-type", mime] : []),
      "--params",
      JSON.stringify({ fields: "id,name,webViewLink" }),
      "--json",
      JSON.stringify({ name, parents: [folderId] }),
    ])) as { id: string; name: string; webViewLink?: string };
    return { id: created.id, name: created.name, folderId, webViewLink: created.webViewLink };
  },
});

/** Folder id for a My Drive path, creating missing folders; "" means My Drive itself. */
export async function ensureFolderPath(
  /** gws runner. */
  gws: GwsRunner,
  /** Slash-separated path under My Drive. */
  path: string,
): Promise<string> {
  let parent = "root";
  for (const part of path.split("/").filter(Boolean)) {
    const q = `name = '${part.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}' and '${parent}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const found = (await runGws(gws, [
      "drive",
      "files",
      "list",
      "--params",
      JSON.stringify({ q, fields: "files(id)", pageSize: 1 }),
    ])) as { files?: { id: string }[] };
    const hit = found.files?.[0]?.id;
    if (hit) {
      parent = hit;
      continue;
    }
    const made = (await runGws(gws, [
      "drive",
      "files",
      "create",
      "--params",
      JSON.stringify({ fields: "id" }),
      "--json",
      JSON.stringify({ name: part, mimeType: FOLDER_MIME, parents: [parent] }),
    ])) as { id: string };
    parent = made.id;
  }
  return parent;
}
