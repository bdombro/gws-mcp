/*
Test helpers: a recording mock gws runner and an app wired to it (no network).
*/

import { argsbarg } from "argsbarg";
import { app } from "./app.ts";
import type { GwsRun, GwsRunner } from "./gws/client.ts";

/** A mock runner that records argv and replies with canned output. */
export type MockGws = GwsRunner & { calls: string[][] };

/** Builds an app whose commands use `runner` instead of spawning gws. */
export function appWithGws(runner: GwsRunner) {
  return argsbarg({
    ...app.spec,
    hooks: {
      beforeInvoke: (ctx) => {
        ctx.locals.gws = runner;
      },
    },
  });
}

/** Returns a runner that records each argv and answers with `reply(args)` (JSON-stringified unless a GwsRun). */
export function mockGws(reply: (args: string[]) => unknown | GwsRun): MockGws {
  const calls: string[][] = [];
  const runner = async (args: string[]): Promise<GwsRun> => {
    calls.push(args);
    const out = reply(args);
    if (out && typeof out === "object" && "exitCode" in out && "stdout" in out) return out as GwsRun;
    return { exitCode: 0, stderr: "Using keyring backend: keyring\n", stdout: JSON.stringify(out) };
  };
  return Object.assign(runner, { calls });
}

/** Encodes text as Gmail base64url body data. */
export function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}
