import type { GwsRunner } from "../gws/client.ts";

declare module "argsbarg" {
  interface Locals {
    /** Spawns gws; replaced with a mock in tests. */
    gws: GwsRunner;
  }
}
