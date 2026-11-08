import test from "node:test";
import assert from "node:assert/strict";
import { normaliseDomain, readDkim, readDmarc, readSpf } from "../lib/data/dnsRecords.ts";

test("a domain is read out of whatever was pasted", () => {
  assert.equal(normaliseDomain("https://www.GetAcme.com/about"), "getacme.com");
  assert.equal(normaliseDomain("sam@getacme.com"), "getacme.com");
  assert.equal(normaliseDomain("mail.acme.co.uk."), "mail.acme.co.uk");
  assert.equal(normaliseDomain("not a domain"), null);
  assert.equal(normaliseDomain("localhost"), null);
  assert.equal(normaliseDomain("-bad.com"), null);
});

test("SPF passes with exactly one record, and says what to add without one", () => {
  assert.equal(readSpf([["v=spf1 include:_spf.google.com ~all"], ["google-site-verification=x"]]).ok, true);
  const none = readSpf([["google-site-verification=x"]]);
  assert.equal(none.ok, false);
  assert.match(none.note, /No SPF record/);
  const two = readSpf([["v=spf1 a ~all"], ["v=spf1 mx ~all"]]);
  assert.equal(two.ok, false, "two SPF records is an error receivers punish");
  assert.match(two.note, /More than one/);
});

test("a TXT record split into chunks is read whole", () => {
  assert.equal(readSpf([["v=spf1 include:_spf.google.com ", "~all"]]).record, "v=spf1 include:_spf.google.com ~all");
});

test("DMARC passes in monitoring mode and names the policy", () => {
  const none = readDmarc([["v=DMARC1; p=none; rua=mailto:d@acme.example"]]);
  assert.equal(none.ok, true);
  assert.match(none.note, /p=none/);
  assert.match(readDmarc([["v=DMARC1; p=reject"]]).note, /p=reject/);
  assert.equal(readDmarc([]).ok, false);
});

test("DKIM is found under whichever common selector has a key", () => {
  const found = readDkim([
    { selector: "google", records: [] },
    { selector: "selector1", records: [["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"]] },
  ]);
  assert.equal(found.ok, true);
  assert.equal(found.selector, "selector1");
  const missing = readDkim([{ selector: "google", records: [] }]);
  assert.equal(missing.ok, false);
  assert.match(missing.note, /custom selector/, "a custom selector is not called broken");
});
