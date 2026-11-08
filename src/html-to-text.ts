/*
Zero-dependency HTML-to-text for email bodies. Regex-based on purpose: email HTML is
table soup, and this keeps readable text plus links without pulling in a parser.
*/

/** Named entities seen in real email; anything else is left as-is. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "©",
  euro: "€",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  pound: "£",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
  zwnj: "",
};

/** Links longer than this (tracking redirects) keep their text but lose the URL. */
const MAX_LINK_CHARS = 300;

/**
 * Converts email HTML to plain text.
 *
 * Drops comments and head/style/script/title; renders links as `text (url)` with `utm_*`
 * params removed (mailto and over-long links keep only their text); turns block tags into
 * newlines; decodes entities; strips `\r` and zero-width characters; collapses whitespace
 * and blank runs; and drops a paragraph identical to the one before it.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      if (!text || href.startsWith("mailto:") || href.length > MAX_LINK_CHARS) return text;
      return `${text} (${stripUtm(decodeEntities(href))})`;
    })
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (match) => decodeEntities(match))
    .replace(/[\u200b-\u200f\u00ad\u2060\ufeff]|\u034f/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n\n")
    .filter((para, i, all) => para !== all[i - 1])
    .join("\n\n")
    .trim();
}

/** Decodes numeric and known named entities in `text`; unknown entities pass through. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Removes `utm_*` query params, keeping the rest of the URL intact. */
function stripUtm(href: string): string {
  try {
    const url = new URL(href);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return href.replace(/[?&]utm_[^&#]*/g, "");
  }
}
