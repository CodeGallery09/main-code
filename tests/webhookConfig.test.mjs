import test from "node:test";
import assert from "node:assert/strict";
import { authorizeFromCarriers, WEBHOOK_HEADER, WEBHOOK_QUERY_PARAM, WEBHOOK_SOURCES } from "../lib/channels/webhookConfig.ts";

/* Unipile's dashboard UI has no header field for an "Account" webhook, so the secret has to be
 * able to travel in the callback URL's query string too (lib/channels/webhookAuth.ts pulls both
 * candidates out of the Request and hands them here). These pin that either carrier works alone,
 * that a missing secret refuses everything, and that an absent carrier is never mistaken for an
 * empty match. */

test("no secret configured: nothing is authorised, however it arrives", () => {
  assert.equal(authorizeFromCarriers(null, ["anything", "anything"]), false);
  assert.equal(authorizeFromCarriers(null, [null, null]), false);
});

test("the first carrier (the header) alone is enough", () => {
  assert.equal(authorizeFromCarriers("s3cr3t-value", ["s3cr3t-value", null]), true);
  assert.equal(authorizeFromCarriers("s3cr3t-value", ["wrong", null]), false);
});

test("the second carrier (the query param) alone is enough", () => {
  assert.equal(authorizeFromCarriers("s3cr3t-value", [null, "s3cr3t-value"]), true);
  assert.equal(authorizeFromCarriers("s3cr3t-value", [null, "wrong"]), false);
});

test("neither carrier present is refused, not treated as an empty-string match", () => {
  assert.equal(authorizeFromCarriers("s3cr3t-value", [null, undefined]), false);
  assert.equal(authorizeFromCarriers("s3cr3t-value", ["", ""]), false);
});

test("a wrong header does not poison a right query param, or the reverse", () => {
  assert.equal(authorizeFromCarriers("s3cr3t-value", ["wrong", "s3cr3t-value"]), true);
  assert.equal(authorizeFromCarriers("s3cr3t-value", ["s3cr3t-value", "wrong"]), true);
});

test("the two constants stay distinct — a route can tell which carrier it read", () => {
  assert.notEqual(WEBHOOK_HEADER, WEBHOOK_QUERY_PARAM);
});

test("both webhook sources still name a path under app/api/webhooks/unipile", () => {
  for (const { path } of Object.values(WEBHOOK_SOURCES)) {
    assert.match(path, /^\/api\/webhooks\/unipile\//);
  }
});
