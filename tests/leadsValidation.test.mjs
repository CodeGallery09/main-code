import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, parseDelimited } from "../lib/leads/table.ts";
import { checkEmail, checkUrl, suggestMapping, validateUpload } from "../lib/leads/validation.ts";
import { checkPhone } from "../lib/leads/phone.ts";

test("csv reader handles quotes, embedded commas and blank lines", () => {
  const table = parseCsv('Name,Email\r\n"Reyes, Maya",maya@example.com\r\n\r\n"He said ""hi""",b@c.io\r\n');
  assert.deepEqual(table.headers, ["Name", "Email"]);
  assert.deepEqual(table.rows, [
    ["Reyes, Maya", "maya@example.com"],
    ['He said "hi"', "b@c.io"],
  ]);
});

test("csv reader picks up semicolons and tabs", () => {
  assert.deepEqual(parseDelimited("a;b;c\n1;2;3"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
  assert.deepEqual(parseDelimited("a\tb\n1\t2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("email is judged on the @ being there", () => {
  assert.equal(checkEmail("Maya@Example.com").ok, true);
  assert.equal(checkEmail("Maya@Example.com").value, "maya@example.com");
  assert.equal(checkEmail("maya.example.com").reason, "“@” is not present");
  assert.equal(checkEmail("@example.com").ok, false);
  assert.equal(checkEmail("maya@").ok, false);
  assert.equal(checkEmail("").reason, "Email is blank");
});

test("linkedin needs a web URL to be present", () => {
  assert.equal(checkUrl("https://www.linkedin.com/in/maya").ok, true);
  assert.equal(checkUrl("linkedin.com/in/maya").value, "https://linkedin.com/in/maya");
  assert.equal(checkUrl("maya reyes").reason, "URL not present");
  assert.equal(checkUrl("").reason, "URL not present");
});

test("mobile numbers need a + country code and that country's digit count", () => {
  assert.equal(checkPhone("+91 98200 55123").ok, true, "10 digits is valid for +91");
  assert.equal(checkPhone("+91 98200 551234").ok, false, "11 digits is not");
  assert.match(checkPhone("+91 98200 551234").reason, /needs exactly 10 digits, found 11/);
  assert.match(checkPhone("+91 9820055").reason, /needs exactly 10 digits, found 7/);
  assert.equal(checkPhone("9820055123").reason, "No country code — the number must start with +");
  assert.match(checkPhone("+999 12345").reason, /not recognised/);
  assert.equal(checkPhone("+1 415 555 0142").ok, true);
  assert.equal(checkPhone("+44 7400 123456").ok, true);
});

test("mapping is guessed from headers, but validation ignores header names", () => {
  assert.deepEqual(suggestMapping(["Full name", "Work Email", "Mobile", "WhatsApp", "LinkedIn URL"]), {
    email: "Work Email",
    whatsapp: "WhatsApp",
    mobile: "Mobile",
    linkedin: "LinkedIn URL",
  });

  // Columns named nothing like their contents still validate on content alone.
  const headers = ["col_a", "col_b"];
  const rows = [["maya@example.com", "+91 9820055123"]];
  const summary = validateUpload(headers, rows, { email: "col_a", mobile: "col_b" }, checkPhone);
  assert.equal(summary.reachableRows, 1);
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.leads[0].email, "maya@example.com");
  assert.equal(summary.leads[0].mobile, "+919820055123");
});

test("the summary counts reachable leads per channel and logs every bad row", () => {
  const headers = ["email", "phone", "li"];
  const rows = [
    ["maya@example.com", "+91 9820055123", "linkedin.com/in/maya"],
    ["omar.example.com", "+91 98200551234", ""],
    ["", "+1 4155550142", "https://linkedin.com/in/dan"],
  ];
  const summary = validateUpload(headers, rows, { email: "email", mobile: "phone", linkedin: "li" }, checkPhone);

  assert.equal(summary.totalRows, 3);
  // Row 2 fails on every mapped channel, so it is not reachable at all.
  assert.equal(summary.reachableRows, 2);

  const byChannel = Object.fromEntries(summary.channels.map((c) => [c.attribute, c]));
  assert.deepEqual(
    { total: byChannel.email.total, reachable: byChannel.email.reachable },
    { total: 3, reachable: 1 },
  );
  assert.equal(byChannel.mobile.reachable, 2);
  assert.equal(byChannel.linkedin.reachable, 2);
  assert.equal(byChannel.whatsapp.mapped, false);

  assert.deepEqual(
    summary.errors.map((e) => [e.row, e.attribute, e.reason]),
    [
      [2, "email", "“@” is not present"],
      [2, "mobile", "Invalid digit count for country code +91 — needs exactly 10 digits, found 11"],
      [2, "linkedin", "URL not present"],
      [3, "email", "Email is blank"],
    ],
  );
});

test("unmapped columns are kept on the lead rather than dropped", () => {
  const summary = validateUpload(
    ["email", "company"],
    [["maya@example.com", "Example Co"]],
    { email: "email" },
    checkPhone,
  );
  assert.deepEqual(summary.leads[0].extra, { company: "Example Co" });
});
