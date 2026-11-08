import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { htmlToText } from "./html-to-text.ts";

/** Newsletter-shaped HTML: head/style, hidden preheader with zero-width padding, table layout, tracking links. */
const NEWSLETTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Weekly Update</title>
<style type="text/css">body{margin:0;padding:0} .btn{color:#fff;background:#06c}</style>
<!--[if mso]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
</head><body>
<div style="display:none">Your weekly roundup&#847;&zwnj;&nbsp;&#8203;&#8203;&#xFEFF;</div>
<table role="presentation" width="100%"><tr><td align="center">
<table width="600"><tr><td><h1>Hi Brian,</h1></td></tr>
<tr><td><p>Here&rsquo;s what&#39;s new this week &mdash; 3 updates.</p></td></tr>
<tr><td><a href="https://example.com/post?id=42&amp;utm_source=newsletter&amp;utm_medium=email" class="btn"><span>Read the post</span></a></td></tr>
<tr><td><a href="https://click.example.com/ls/click?upn=${"x".repeat(400)}">View in browser</a></td></tr>
<tr><td><a href="mailto:help@example.com">Contact support</a> | <a href="https://example.com/u"><img src="logo.png"></a></td></tr>
<tr><td>Price</td><td>&pound;10 &amp; &euro;12</td></tr>
<tr><td><p>Unsubscribe</p></td></tr>
<tr><td><p>Unsubscribe</p></td></tr>
</table></td></tr></table>
<script>track()</script>
</body></html>`;

describe("htmlToText", () => {
  const text = htmlToText(NEWSLETTER);

  test("drops head, style, title, comments and script", () => {
    assert.doesNotMatch(text, /Weekly Update|margin:0|OfficeDocument|track\(\)/);
  });

  test("keeps links as text (url) without utm params", () => {
    assert.match(text, /Read the post \(https:\/\/example\.com\/post\?id=42\)/);
  });

  test("drops long tracking URLs, mailto URLs and image-only links", () => {
    assert.match(text, /View in browser/);
    assert.doesNotMatch(text, /click\.example\.com/);
    assert.match(text, /Contact support \|/);
    assert.doesNotMatch(text, /mailto|logo\.png|example\.com\/u/);
  });

  test("decodes entities and strips zero-width characters", () => {
    assert.match(text, /Here’s what's new this week — 3 updates\./);
    assert.match(text, /Price £10 & €12/);
    assert.doesNotMatch(text, /[\u200b\ufeff]|\u034f|&\w+;/);
  });

  test("block tags become newlines, blank runs collapse, repeated paragraphs drop", () => {
    assert.match(text, /^Your weekly roundup\n/);
    assert.doesNotMatch(text, /\n{3,}/);
    assert.equal(text.match(/Unsubscribe/g)?.length, 1);
    assert.match(text, /Hi Brian,\n/);
  });

  test("strips carriage returns and collapses spaces", () => {
    assert.equal(htmlToText("<p>a\r\n   b</p>\r\n<p>c</p>"), "a\nb\n\nc");
  });

  test("leaves unknown entities and handles invalid code points", () => {
    assert.equal(htmlToText("x &bogus; &#99999999; y"), "x &bogus; &#99999999; y");
  });

  test("strips utm when it is the first query param", () => {
    assert.equal(htmlToText('<a href="https://ex.com/a?utm_source=x&amp;ref=1">A</a>'), "A (https://ex.com/a?ref=1)");
  });
});
