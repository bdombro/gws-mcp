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
 * Drops comments, head/style/script/title and elements hidden by a `hidden` attribute or inline
 * style (so hidden injected text never reaches an agent); renders links as `text (url)` with `utm_*`
 * params removed (mailto and over-long links keep only their text); turns block tags into
 * newlines; decodes entities; strips `\r` and zero-width characters; collapses whitespace
 * and blank runs; and drops a paragraph identical to the one before it.
 */
export function htmlToText(html: string): string {
  return dropHiddenElements(
    html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, ""),
  )
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

/** Tags that never have a closing tag. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "wbr",
]);

/** Matches an opening tag, capturing its name and attribute text (quoted values may contain `>`). */
const OPEN_TAG = /<([a-z][a-z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;

/** Matches an opening or closing tag of any element, capturing the slash and name. */
const ANY_TAG = /<(\/?)([a-z][a-z0-9]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;

/**
 * Removes every element hidden by a `hidden` attribute or inline style, with its contents
 * (nested same-name tags are matched by depth). An unclosed hidden element drops the rest of
 * the document, which is lossy on sloppy HTML but never leaks hidden text.
 */
function dropHiddenElements(html: string): string {
  let out = "";
  let pos = 0;
  const open = new RegExp(OPEN_TAG.source, "gi");
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const name = (m[1] as string).toLowerCase();
    const attrs = m[2] as string;
    if (m.index < pos || VOID_TAGS.has(name) || attrs.endsWith("/") || !isHidden(attrs)) continue;
    out += html.slice(pos, m.index);
    pos = elementEnd(html, name, m.index + m[0].length);
    open.lastIndex = pos;
  }
  return out + html.slice(pos);
}

/** Index just after the closing tag matching an element opened before `from` (end of text if none). */
function elementEnd(html: string, name: string, from: number): number {
  const tags = new RegExp(ANY_TAG.source, "gi");
  tags.lastIndex = from;
  let depth = 1;
  for (let t = tags.exec(html); t; t = tags.exec(html)) {
    if ((t[2] as string).toLowerCase() !== name) continue;
    depth += t[1] ? -1 : t[0].endsWith("/>") ? 0 : 1;
    if (depth === 0) return t.index + t[0].length;
  }
  return html.length;
}

/** True when an element's attribute text hides it (`hidden` attribute or a hiding inline style). */
function isHidden(attrs: string): boolean {
  if (/(?:^|\s)hidden(?=[\s=/]|$)/i.test(attrs.replace(/"[^"]*"|'[^']*'/g, '""'))) return true;
  const style = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!style) return false;
  const css = decodeEntities(style[1] ?? style[2] ?? style[3] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  return css.split(";").some((declaration) => {
    const colon = declaration.indexOf(":");
    if (colon < 0) return false;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!\s*important/i, "")
      .trim()
      .toLowerCase();
    if (property === "display") return value === "none";
    if (property === "visibility") return value === "hidden" || value === "collapse";
    return ZERO_PROPERTIES.has(property) && ZERO_VALUE.test(value);
  });
}

/** Inline style properties that hide content when zero. */
const ZERO_PROPERTIES = new Set(["font-size", "height", "max-height", "max-width", "opacity", "width"]);

/** A zero CSS length or number (`0`, `0.0`, `0px`, `.0em`, `0%`). */
const ZERO_VALUE = /^(?:0+(?:\.0*)?|\.0+)[a-z%]*$/;
