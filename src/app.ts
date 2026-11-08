/*
App spec — command registration only.
The version is read from `package.json` at runtime, so the same code runs from
`src/` (`node src/index.ts`) and from the committed bundle (`dist/google-gws-mcp.mjs`).
*/

import { readFileSync } from "node:fs";
import { argsbarg } from "argsbarg";
import { callCommand } from "./commands/call/command.ts";
import { driveUploadCommand } from "./commands/drive-upload/command.ts";
import { gmailMessageCommand } from "./commands/gmail-message/command.ts";
import { gmailThreadCommand } from "./commands/gmail-thread/command.ts";
import { schemaCommand } from "./commands/schema/command.ts";
import { statusCommand } from "./commands/status/command.ts";
import { createIdentity } from "./create-identity.ts";
import { attachGws } from "./gws/client.ts";

/** Reads a file from the plugin root (one level above `src/` or `dist/`). */
function packageFile(
  /** Path relative to the plugin root. */
  rel: string,
): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

/** Plugin version from `package.json` (bumped with the manifests by `npm run release`). */
const version = (JSON.parse(packageFile("package.json")) as { version: string }).version;

export const app = argsbarg({
  commands: [callCommand, driveUploadCommand, gmailMessageCommand, gmailThreadCommand, schemaCommand, statusCommand],
  description: createIdentity.desc,
  hooks: {
    beforeInvoke: attachGws,
  },
  httpServer: { enabled: true },
  key: createIdentity.key,
  mcpServer: {
    enabled: true,
    instructions:
      "`call` reaches any Google Workspace API (Gmail, Calendar, Drive, Docs, Sheets, People/Contacts, Tasks…) via the gws CLI. Use `schema` (e.g. gmail.users.messages.list) to discover parameters before calling. Prefer `fields` masks and small page sizes to keep results small. Use `gmail-message` / `gmail-thread` to read email as text, and `drive-upload` to upload a local file.",
  },
  version,
});
