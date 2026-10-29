import test from "node:test";
import assert from "node:assert/strict";
import { displayColumns, identityFill, audienceIdentity } from "../lib/audiences/profile.ts";

const base = { email: null, mobile: null, whatsapp: null, linkedin: null, extra: {} };

test("reads name, company and title from the obvious columns", () => {
  const who = audienceIdentity({
    ...base,
    email: "p@x.example",
    extra: { "Full Name": "Priya Raman", Company: "Kitebox Labs", "Job Title": "Founder" },
  });
  assert.deepEqual(who, { name: "Priya Raman", company: "Kitebox Labs", title: "Founder" });
});

test("joins first and last name columns", () => {
  assert.equal(audienceIdentity({ ...base, extra: { first_name: "Daniel", Surname: "Okafor" } }).name, "Daniel Okafor");
});

test("falls back to the email's local part, as a readable name", () => {
  assert.equal(audienceIdentity({ ...base, email: "priya.raman@kitebox.example" }).name, "Priya Raman");
  assert.equal(audienceIdentity({ ...base, email: "maya_reyes+sales@x.io" }).name, "Maya Reyes");
});

test("a role mailbox is not presented as a person", () => {
  assert.equal(audienceIdentity({ ...base, email: "info@acme.example" }).name, "info");
  assert.notEqual(audienceIdentity({ ...base, email: "sales@acme.example" }).name, "Sales");
});

test("falls back to the LinkedIn slug, dropping the id suffix", () => {
  assert.equal(audienceIdentity({ ...base, linkedin: "https://linkedin.com/in/maya-reyes-1a2b3c/" }).name, "Maya Reyes");
});

test("a phone-only row is named by its number, never left blank", () => {
  assert.equal(audienceIdentity({ ...base, mobile: "+14155550100" }).name, "Contact +14155550100");
  assert.equal(audienceIdentity(base).name, "Unnamed contact");
});

test("a real name column beats anything derived", () => {
  assert.equal(audienceIdentity({ ...base, email: "x.y@z.example", extra: { Name: "Real Name" } }).name, "Real Name");
});

test("long values are clipped to the name limit", () => {
  const who = audienceIdentity({ ...base, extra: { Name: "x".repeat(300), Company: "c".repeat(300) } });
  assert.equal(who.name.length, 120);
  assert.equal(who.company.length, 120);
});

test("company and title stay empty when the file has no such column", () => {
  const who = audienceIdentity({ ...base, email: "a@b.example" });
  assert.equal(who.company, "");
  assert.equal(who.title, "");
});

test("an import fills a matched audience's blank company and title, and never overwrites them", () => {
  const row = { email: "maya@acme.example", mobile: null, whatsapp: null, linkedin: null, extra: { Company: "Acme", "Job Title": "VP Ops" } };
  assert.deepEqual(identityFill({ company: "", title: "" }, row), { company: "Acme", title: "VP Ops" });
  assert.deepEqual(identityFill({ company: "Kitebox", title: "" }, row), { title: "VP Ops" });
  assert.deepEqual(identityFill({ company: "Kitebox", title: "CTO" }, row), {});
  assert.deepEqual(identityFill({ company: "", title: "" }, { ...row, extra: {} }), {}, "no column, nothing invented");
});

/* ---------- which columns feed the display fields ------------------------- */

test("the file's own columns for name, company and title are reported by name", () => {
  // The mapping step only asks about contact attributes, so a "Company Name" column has no control
  // of its own and looks ignored. It is not, and the screen says which column it reads.
  assert.deepEqual(displayColumns(["Name", "Linkedin", "Company Name"]), {
    name: "Name",
    company: "Company Name",
    title: null,
  });

  // Spacing, case and punctuation in the header do not matter.
  assert.deepEqual(displayColumns(["first_name", "JOB TITLE", "organisation"]), {
    name: "first_name",
    company: "organisation",
    title: "JOB TITLE",
  });

  assert.deepEqual(displayColumns(["Email", "Phone"]), { name: null, company: null, title: null });
});
