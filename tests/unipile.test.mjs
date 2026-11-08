import test from "node:test";
import assert from "node:assert/strict";
import {
  hostedAuthBody,
  readAccount,
  readHostedAuthUrl,
  readWebhooks,
  unipileBaseUrl,
} from "../lib/channels/unipileRequests.ts";
import { readAccountStatus } from "../lib/channels/events.ts";

test("a DSN is turned into an API base however the dashboard spelled it", () => {
  // The dashboard hands out a host and port, with no scheme.
  assert.equal(unipileBaseUrl("api1.unipile.com:13111"), "https://api1.unipile.com:13111/api/v1");
  assert.equal(unipileBaseUrl("https://api1.unipile.com:13111/"), "https://api1.unipile.com:13111/api/v1");
  // Pasted with the path already on it, which is the easiest mistake to make.
  assert.equal(unipileBaseUrl("https://api.unipile.com/api/v1"), "https://api.unipile.com/api/v1");
  assert.throws(() => unipileBaseUrl("  "), /UNIPILE_DSN/);
});

const request = {
  kind: "create",
  reference: "cx_abc",
  successUrl: "https://app.example/dashboard/integrations?connected=cx_abc",
  failureUrl: "https://app.example/dashboard/integrations?failed=cx_abc",
  notifyUrl: "https://app.example/api/webhooks/unipile/notify",
  expiresAt: new Date("2026-10-01T09:15:00.000Z"),
};

test("a create asks for LinkedIn and carries our reference as the name", () => {
  const body = hostedAuthBody(request, "https://api1.unipile.com:13111/api/v1");
  assert.equal(body.type, "create");
  assert.deepEqual(body.providers, ["LINKEDIN"]);
  assert.equal(body.api_url, "https://api1.unipile.com:13111/api/v1");
  assert.equal(body.expiresOn, "2026-10-01T09:15:00.000Z");
  // `name` is what the provider echoes to notify_url — the only thing tying the new account to a
  // workspace. If this stops being the session id, every connection becomes unattributable.
  assert.equal(body.name, "cx_abc");
  assert.equal(body.notify_url, request.notifyUrl);
});

test("a reconnect names the account and does not ask for a provider", () => {
  const body = hostedAuthBody({ ...request, kind: "reconnect", providerAccountId: "u_9" }, "https://x/api/v1");
  assert.equal(body.type, "reconnect");
  assert.equal(body.reconnect_account, "u_9");
  assert.equal(body.providers, undefined);
  assert.throws(() => hostedAuthBody({ ...request, kind: "reconnect" }, "https://x/api/v1"), /providerAccountId/);
});

test("the hosted auth URL is found in either answer shape", () => {
  assert.equal(readHostedAuthUrl({ object: "HostedAuthURL", url: "https://acc.unipile.com/x" }), "https://acc.unipile.com/x");
  assert.equal(readHostedAuthUrl({ data: { url: "https://acc.unipile.com/y" } }), "https://acc.unipile.com/y");
  assert.equal(readHostedAuthUrl({}), "", "an answer with no link is not a link");
});

test("an account's status comes from its sources, and a broken source wins", () => {
  const ok = readAccount(
    {
      id: "u_1",
      name: "Dana Reyes",
      sources: [{ id: "s1", status: "OK" }],
      connection_params: { im: { public_identifier: "dana-reyes" } },
      created_at: "2026-10-01T09:00:00.000Z",
    },
    readAccountStatus,
  );
  assert.equal(ok.status, "ok");
  assert.equal(ok.handle, "linkedin.com/in/dana-reyes");
  assert.equal(ok.name, "Dana Reyes");

  const broken = readAccount({ id: "u_2", sources: [{ status: "OK" }, { status: "CREDENTIALS" }] }, readAccountStatus);
  assert.equal(broken.status, "credentials", "one broken source makes the account unusable");

  // No status at all is not health: an account we know nothing about must not read as ready.
  assert.equal(readAccount({ id: "u_3" }, readAccountStatus).status, "error");
  // The provider's own word is kept, so a screen can say what it actually reported.
  const syncing = readAccount({ id: "u_4", sources: [{ status: "CONNECTING" }] }, readAccountStatus);
  assert.equal(syncing.status, "connecting");
  assert.equal(syncing.rawStatus, "CONNECTING");
  assert.equal(readAccount({ id: "u_5", sources: [{ status: "OK" }] }, readAccountStatus).rawStatus, "");
  assert.equal(readAccount({ name: "no id" }, readAccountStatus), null);
});

test("a full profile URL is kept as given rather than wrapped again", () => {
  const account = readAccount(
    { id: "u_4", status: "OK", connection_params: { im: { public_identifier: "linkedin.com/in/dana" } } },
    readAccountStatus,
  );
  assert.equal(account.handle, "linkedin.com/in/dana");
});

test("webhooks are read from a list or a bare array, and rows without an id are dropped", () => {
  const rows = readWebhooks({
    items: [
      { id: "w1", source: "messaging", request_url: "https://app.example/api/webhooks/unipile/messages" },
      { source: "account_status", request_url: "https://app.example/x" },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestUrl, "https://app.example/api/webhooks/unipile/messages");
  assert.equal(readWebhooks([{ id: "w2", source: "account_status", url: "https://a/b" }])[0].source, "account_status");
  assert.deepEqual(readWebhooks(null), []);
});

/* ---------- mailboxes, email and relations --------------------------------- */

import { accountChannel, emailFields, readEmailRows, readEmailSent, readRelations } from "../lib/channels/unipileRequests.ts";

test("a mailbox sign-in offers every mail provider; a LinkedIn one only LinkedIn", () => {
  const base = {
    kind: "create",
    reference: "cx_1",
    successUrl: "https://app.example/ok",
    failureUrl: "https://app.example/no",
    notifyUrl: "https://app.example/n",
    expiresAt: new Date("2026-11-08T10:15:00Z"),
  };
  assert.equal(hostedAuthBody({ ...base, channel: "email" }, "https://api.example/api/v1").providers, "*:MAILING");
  assert.deepEqual(hostedAuthBody({ ...base, channel: "linkedin" }, "https://api.example/api/v1").providers, ["LINKEDIN"]);
});

test("a mailbox account is read as an address, not a LinkedIn URL", () => {
  const box = readAccount(
    {
      object: "Account",
      id: "acc_mail",
      type: "GOOGLE_OAUTH",
      name: "sam@getacme.example",
      created_at: "2026-11-08T10:00:00Z",
      connection_params: { mail: { id: "x", username: "Sam@GetAcme.example" } },
      sources: [{ id: "s", status: "OK" }],
    },
    readAccountStatus,
  );
  assert.equal(box.channel, "email");
  assert.equal(box.handle, "sam@getacme.example");
  assert.equal(box.status, "ok");
  assert.equal(accountChannel("OUTLOOK"), "email");
  assert.equal(accountChannel("MAIL"), "email");
  assert.equal(accountChannel("LINKEDIN"), "linkedin");
  assert.equal(accountChannel(""), "linkedin", "an untyped account is what the LinkedIn flow always saw");
});

test("an email is sent as form fields, with JSON inside, the way Unipile's SDK sends it", () => {
  const fields = emailFields({
    accountId: "acc_mail",
    to: { email: "maya@northwind.example", name: "Maya Ortiz" },
    subject: "Quick question",
    html: "<p>Hi</p>",
    trackingLabel: "ev_send1",
  });
  assert.deepEqual(JSON.parse(fields.to), [{ identifier: "maya@northwind.example", display_name: "Maya Ortiz" }]);
  assert.deepEqual(JSON.parse(fields.tracking_options), { opens: true, links: true, label: "ev_send1" });
  assert.equal(fields.account_id, "acc_mail");
  assert.equal(fields.body, "<p>Hi</p>");
  assert.equal("reply_to" in fields, false, "a first email answers nothing");
  assert.equal(emailFields({ ...{ accountId: "a", to: { email: "x@y.example", name: "" }, subject: "Re: Q", html: "", trackingLabel: "l" }, replyTo: "em_0" }).reply_to, "em_0");
});

test("the send's tracking id is read back", () => {
  assert.equal(readEmailSent({ object: "EmailSent", tracking_id: "tr_9" }), "tr_9");
  assert.equal(readEmailSent(null), "");
});

test("the relation list reads each connection by member id and slug", () => {
  const rows = readRelations({
    object: "UserRelationsList",
    items: [
      { object: "UserRelation", member_id: "ACoAAB123", public_identifier: "maya-ortiz", public_profile_url: "https://www.linkedin.com/in/maya-ortiz", first_name: "Maya", last_name: "Ortiz", created_at: 1 },
      { object: "UserRelation" },
    ],
    cursor: null,
  });
  assert.equal(rows.length, 1, "a row naming nobody is skipped");
  assert.deepEqual(rows[0], {
    providerId: "ACoAAB123",
    publicIdentifier: "maya-ortiz",
    profileUrl: "https://www.linkedin.com/in/maya-ortiz",
    name: "Maya Ortiz",
    createdAt: "",
  });
  assert.equal(readEmailRows({ items: [{ id: "em_1" }, "junk"] }).length, 1);
});
