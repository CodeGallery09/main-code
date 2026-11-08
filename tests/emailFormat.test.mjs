import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeEmail, replySubject, stripQuoted, textToHtml } from "../lib/channels/emailFormat.ts";

test("plain copy becomes paragraphs and line breaks, with everything escaped", () => {
  assert.equal(
    textToHtml("Hi Maya,\n\nSaw Smith & Co <Ltd> is hiring.\nWorth a chat?"),
    "<p>Hi Maya,</p>\n<p>Saw Smith &amp; Co &lt;Ltd&gt; is hiring.<br>Worth a chat?</p>",
  );
});

test("bare links become anchors, so a click can be tracked — without swallowing punctuation", () => {
  assert.equal(
    textToHtml("Have a look at https://acme.example/demo."),
    '<p>Have a look at <a href="https://acme.example/demo">https://acme.example/demo</a>.</p>',
  );
  assert.match(textToHtml("www.acme.example"), /<a href="https:\/\/www\.acme\.example">www\.acme\.example<\/a>/);
});

test("markup typed into copy is shown, not run", () => {
  assert.doesNotMatch(textToHtml('<img src=x onerror="alert(1)">'), /<img/);
});

test("a follow-up subject is Re: once, never Re: Re:", () => {
  assert.equal(replySubject("Quick question"), "Re: Quick question");
  assert.equal(replySubject("Re: Quick question"), "Re: Quick question");
  assert.equal(replySubject("  "), "");
});

test("a reply is cut above the quoted thread", () => {
  assert.equal(stripQuoted("Sounds good, Tuesday works.\n\nOn Mon, 3 Nov 2026 at 10:02, Sam <sam@acme.example> wrote:\n> Hi"), "Sounds good, Tuesday works.");
  assert.equal(stripQuoted("Yes please\n-----Original Message-----\nFrom: x"), "Yes please");
  assert.equal(stripQuoted("Thanks!\nFrom: Sam\nSent: Monday\nTo: Maya"), "Thanks!");
  assert.equal(stripQuoted("No quote here."), "No quote here.");
});

test("an address is checked for shape before anything is sent to it", () => {
  assert.equal(looksLikeEmail("maya@northwind.example"), true);
  assert.equal(looksLikeEmail("maya@northwind"), false);
  assert.equal(looksLikeEmail(""), false);
  assert.equal(looksLikeEmail(null), false);
});
