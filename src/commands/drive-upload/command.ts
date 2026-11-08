/*
drive-upload: upload a local file to Google Drive (gws drive files create --upload), into a folder
given by id or by a "My Drive" path that is created when missing. Local-only by nature: it reads a
file from this machine, but only from $HOME (no hidden paths, no ~/Library) or the OS temp dirs.
*/

import { realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, relative, sep } from "node:path";
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
    "Upload a local file to Google Drive into a folder (by id, or a My Drive path like 'Backups/personal-log', created if missing). The file must be a regular file under $HOME or the OS temp dir (/tmp); anything with a hidden path component (~/.ssh, ~/.config, …) or under ~/Library is refused.",
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
    const absolute = resolveUploadPath(file);
    const name = (ctx.inputs.name as string | undefined) ?? basename(file);
    const folderId =
      (ctx.inputs["folder-id"] as string | undefined) ??
      (await ensureFolderPath(ctx.locals.gws, (ctx.inputs["folder-path"] as string | undefined) ?? ""));
    const mime = ctx.inputs["mime-type"] as string | undefined;
    // gws only uploads files inside its working directory, so run it from the file's folder.
    const created = (await runGws(
      ctx.locals.gws,
      [
        "drive",
        "files",
        "create",
        "--upload",
        basename(absolute),
        ...(mime ? ["--upload-content-type", mime] : []),
        "--params",
        JSON.stringify({ fields: "id,name,webViewLink" }),
        "--json",
        JSON.stringify({ name, parents: [folderId] }),
      ],
      { cwd: dirname(absolute) },
    )) as { id: string; name: string; webViewLink?: string };
    return { id: created.id, name: created.name, folderId, webViewLink: created.webViewLink };
  },
});

/**
 * Resolves `file` through symlinks and returns the real path, or throws unless it is a regular
 * file under `home` or one of `tempDirs` with no hidden path component and (under home) not in
 * `Library`.
 */
export function resolveUploadPath(
  /** Path the caller asked to upload. */
  file: string,
  /** Home directory (default: the current user's). */
  home: string = homedir(),
  /** Allowed temp roots (default: /tmp, /private/tmp, /private/var/folders and os.tmpdir()). */
  tempDirs: string[] = [tmpdir(), "/tmp", "/private/tmp", "/private/var/folders"],
): string {
  let real: string;
  try {
    real = realpathSync(file);
  } catch {
    throw new Error(`File not found: ${file}`);
  }
  const roots = [
    { root: realpathSync(home), isHome: true },
    ...realRoots(tempDirs).map((root) => ({ root, isHome: false })),
  ];
  const hit = roots.find(({ root }) => real.startsWith(root + sep));
  if (!hit) throw new Error("Refused: drive-upload only reads files under $HOME or the OS temp dir.");
  const parts = relative(hit.root, real).split(sep);
  if (parts.some((part) => part.startsWith(".")))
    throw new Error("Refused: hidden paths (like ~/.ssh) cannot be uploaded.");
  if (hit.isHome && parts[0] === "Library") throw new Error("Refused: ~/Library cannot be uploaded.");
  if (!statSync(real).isFile()) throw new Error("Refused: only regular files can be uploaded.");
  return real;
}

/** Real paths of the roots that exist. */
function realRoots(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    try {
      out.push(realpathSync(dir));
    } catch {}
  }
  return out;
}

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
