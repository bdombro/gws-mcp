/*
google-gws-mcp's Bugsink reporter (Sentry-compatible), built on argsbarg's createErrorReporter.
The app passes it as `errorReporter`, so command failures are reported automatically. Off when BUGSINK_DSN is set to an empty string.
*/
import { createErrorReporter } from "argsbarg";

/** google-gws-mcp's Bugsink project DSN (send-only key); override with BUGSINK_DSN, "" disables. */
const DEFAULT_DSN = "https://c1b4b00aa4fa465c951508f223687595@bugsink.btek.cc/6";
/** The app's error reporter. */
export const errors = createErrorReporter({ dsn: DEFAULT_DSN, env: "BUGSINK_DSN" });
