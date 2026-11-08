import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { htmlToText } from "./html-to-text.ts";

/** Newsletter-shaped HTML: head/style, preheader with zero-width padding, table layout, tracking links. */
const NEWSLETTER = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Weekly Update</title>
<style type="text/css">body{margin:0;padding:0} .btn{color:#fff;background:#06c}</style>
<!--[if mso]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->
</head><body>
<div style="color:#fff">Your weekly roundup&#847;&zwnj;&nbsp;&#8203;&#8203;&#xFEFF;</div>
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

  test("drops elements hidden by inline style or the hidden attribute", () => {
    const hidden = [
      '<div style="display:none">IGNORE1</div>',
      '<span style="color:red; Display : NONE !important">IGNORE2</span>',
      '<p style="visibility:hidden">IGNORE3</p>',
      '<span style="font-size:0">IGNORE4</span>',
      '<span style="font-size: 0px;line-height:0">IGNORE5</span>',
      '<div style="width:0;overflow:hidden">IGNORE6</div>',
      '<div style="max-height:0px">IGNORE7</div>',
      '<div style="height:0">IGNORE8</div>',
      '<span style="opacity:0">IGNORE9</span>',
      '<span style="opacity:0.0">IGNORE10</span>',
      "<div hidden>IGNORE11</div>",
      '<div hidden="hidden">IGNORE12</div>',
      "<div style='display&#58;none'>IGNORE13</div>",
      "<div style=display:none>IGNORE14</div>",
    ].join("<p>x</p>");
    const out = htmlToText(`<p>Visible</p>${hidden}<p>Also visible</p>`);
    assert.doesNotMatch(out, /IGNORE/);
    assert.match(out, /Visible/);
    assert.match(out, /Also visible/);
  });

  test("hidden elements drop nested same-name children and keep what follows", () => {
    const out = htmlToText(
      '<div>Before</div><div style="display:none"><div>inner IGNORE</div>more IGNORE</div><div>After</div>',
    );
    assert.equal(out, "Before\nAfter");
  });

  test("hidden void and self-closing tags do not swallow content", () => {
    assert.equal(htmlToText('<img style="display:none" src="x"><p>Kept</p><br hidden><p>Also</p>'), "Kept\n\nAlso");
  });

  test("keeps visible styles and attribute text that only mentions hidden", () => {
    const out = htmlToText(
      '<div style="display:block;opacity:1;font-size:14px;line-height:0">A</div><div class="hidden" title="display:none">B</div><div style="margin:0">C</div>',
    );
    assert.match(out, /A\nB\nC/);
  });

  test("an unclosed hidden element drops the rest of the document", () => {
    assert.equal(htmlToText('<p>Kept</p><div style="display:none">IGNORE <p>tail IGNORE'), "Kept");
  });
});
