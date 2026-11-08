/*
Response size cap: keeps tool results small enough for agent context windows.
*/

/** Default cap on serialized JSON results (bytes). */
export const MAX_RESULT_BYTES = 100_000;

/** Returned in place of a result whose JSON exceeds the cap. */
export type TruncatedResult = {
  /** Serialized size of the full result in bytes. */
  bytes: number;
  /** How to get a smaller result. */
  hint: string;
  /** Cap that was exceeded, in bytes. */
  limitBytes: number;
  /** First characters of the serialized JSON (not valid JSON on its own). */
  preview: string;
  truncated: true;
};

/** Returns `value` unchanged when its JSON fits in `limitBytes`, else a truncation notice with a hint. */
export function capJson<T>(value: T, hint: string, limitBytes = MAX_RESULT_BYTES): T | TruncatedResult {
  const text = JSON.stringify(value) ?? "";
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= limitBytes) return value;
  return {
    bytes,
    hint: `Result was ${bytes} bytes, over the ${limitBytes}-byte limit. ${hint}`,
    limitBytes,
    preview: text.slice(0, 2000),
    truncated: true,
  };
}
