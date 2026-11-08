/*
gws CLI client: builds argv, spawns `gws` without a shell, and parses its JSON stdout.
The runner is injectable (ctx.locals.gws) so tests never touch the network.
*/

import { execFile } from "node:child_process";
import type { InvokeHookContext } from "argsbarg";

/** Raw result of one `gws` process. */
export type GwsRun = {
  /** Process exit code (null when killed by a signal). */
  exitCode: number | null;
  /** Signal that killed the process, if any. */
  signal?: string | null;
  stderr: string;
  stdout: string;
};

/** Spawns `gws` with argv (profile flag included), optionally in `cwd`, and returns its raw output. */
export type GwsRunner = (args: string[], signal?: AbortSignal, cwd?: string) => Promise<GwsRun>;

/** Thrown when gws exits non-zero; `message` carries the API error text. */
export class GwsError extends Error {
  override name = "GwsError";
}

/** Attaches the real runner to `ctx.locals.gws` (app `beforeInvoke` hook). */
export function attachGws(ctx: InvokeHookContext): void {
  ctx.locals.gws ??= execGws;
}

/** Real runner: `execFile` of `$GWS_BIN` (default `gws`), no shell. */
export const execGws: GwsRunner = (args, signal, cwd) =>
  new Promise((resolve, reject) => {
    const bin = process.env.GWS_BIN || "gws";
    execFile(bin, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, signal, cwd }, (err, stdout, stderr) => {
      if (err && typeof err.code === "string") {
        const hint = err.code === "ENOENT" ? ` (is ${bin} installed and on PATH? set GWS_BIN to override)` : "";
        reject(new GwsError(`Could not run ${bin}: ${err.message}${hint}`));
        return;
      }
      resolve({
        exitCode: err ? (typeof err.code === "number" ? err.code : null) : 0,
        signal: err?.signal ?? null,
        stderr,
        stdout,
      });
    });
  });

/** Profile flag from `$GWS_PROFILE` (default `bdombro`); empty string omits it. Must lead argv for the shim. */
export function profileArgs(profile: string | undefined = process.env.GWS_PROFILE): string[] {
  const resolved = profile ?? "bdombro";
  return resolved ? ["--profile", resolved] : [];
}

/**
 * Runs gws and parses stdout as JSON (or NDJSON pages when `ndjson`).
 * Empty stdout on success yields `{}` (e.g. DELETE responses).
 */
export async function runGws(
  runner: GwsRunner,
  args: string[],
  opts: { ndjson?: boolean; signal?: AbortSignal; cwd?: string } = {},
): Promise<unknown> {
  const run = await runner([...profileArgs(), ...args], opts.signal, opts.cwd);
  const stdout = run.stdout.trim();
  if (run.exitCode !== 0) throw new GwsError(describeFailure(run, stdout));
  if (!stdout) return {};
  try {
    if (opts.ndjson) {
      return stdout
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    }
    return JSON.parse(stdout);
  } catch {
    throw new GwsError(`gws printed non-JSON output: ${stdout.slice(0, 500)}`);
  }
}

/** Builds an error message from gws's JSON error body, else from stderr minus keyring noise. */
function describeFailure(run: GwsRun, stdout: string): string {
  try {
    const body = JSON.parse(stdout) as { error?: { code?: number; message?: string; reason?: string } };
    if (body.error?.message) {
      const tag = [body.error.code, body.error.reason].filter(Boolean).join(" ");
      return `gws error${tag ? ` (${tag})` : ""}: ${body.error.message.trim()}`;
    }
  } catch {
    // fall through to stderr
  }
  const stderr = run.stderr
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("Using keyring backend"))
    .join("\n")
    .trim();
  const status = run.signal ? `signal ${run.signal}` : `exit ${run.exitCode}`;
  return `gws failed (${status})${stderr ? `: ${stderr.slice(0, 2000)}` : ""}`;
}
