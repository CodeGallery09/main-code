import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAccountStatusEvent,
  parseMessageEvent,
  readAccountStatus,
} from "../lib/channels/events.ts";

/* The point of these readers is that Unipile's v1 and v2 docs describe the same two events with
 * different envelopes and different field names. Every shape below is one the docs show. */

test("every documented status word maps to a state, and an unknown one is never 'ok'", () => {
  assert.equal(readAccountStatus("OK"), "ok");
  assert.equal(readAccountStatus("RECONNECTED"), "ok");
  assert.equal(readAccountStatus("SYNC_SUCCESS"), "ok");
  // The hosted-auth notify callback reports a finished sign-in as CREATION_SUCCESS.
  assert.equal(readAccountStatus("CREATION_SUCCESS"), "ok");
  // A freshly connected account is still syncing: not usable yet, but not signed out either.
  assert.equal(readAccountStatus("CONNECTING"), "connecting");
  assert.equal(readAccountStatus("CREDENTIALS"), "credentials");
  assert.equal(readAccountStatus("ERROR"), "error");
  assert.equal(readAccountStatus("STOPPED"), "error");
  assert.equal(readAccountStatus("DELETED"), "deleted");
  // A restriction is its own state: it is not fixed by signing in again.
  assert.equal(readAccountStatus("ACCOUNT_RESTRICTED"), "restricted");
  assert.equal(readAccountStatus("CHECKPOINT"), "restricted");
  // The safe default: something we do not understand must not read as usable.
  assert.equal(readAccountStatus("SOMETHING_NEW"), "error");
  assert.equal(readAccountStatus(""), "error");
});

test("the v1 AccountStatus envelope is read", () => {
  const event = parseAccountStatusEvent({
    AccountStatus: { account_id: "u_1", account_type: "LINKEDIN", message: "CREDENTIALS" },
  });
  assert.equal(event.accountId, "u_1");
  assert.equal(event.accountType, "LINKEDIN");
  // v1 puts the status word in `message`, so that is where it has to be found.
  assert.equal(event.status, "credentials");
  assert.equal(event.detail, "", "the status word is not also a human-readable detail");
});

test("a flat status field is read, and its detail kept verbatim", () => {
  const event = parseAccountStatusEvent({
    account_id: "u_2",
    status: "CREDENTIALS",
    account_type: "linkedin",
    message: "Session expired",
  });
  assert.equal(event.status, "credentials");
  assert.equal(event.accountType, "LINKEDIN");
  assert.equal(event.detail, "Session expired", "the provider's own words are shown, not ours");
});

test("the v2 { event, data } envelope is read", () => {
  const event = parseAccountStatusEvent({
    event: "account.status",
    data: { account_id: "u_3", status: "OK", account_type: "LINKEDIN" },
  });
  assert.equal(event.accountId, "u_3");
  assert.equal(event.status, "ok");
});

test("no account id means no event: there is nothing to apply it to", () => {
  assert.equal(parseAccountStatusEvent({ status: "OK" }), null);
  assert.equal(parseAccountStatusEvent(null), null);
  assert.equal(parseAccountStatusEvent("OK"), null);
});

test("a message is read from either envelope, including a nested data.message", () => {
  const flat = parseMessageEvent({
    account_id: "u_1",
    message_id: "m_1",
    chat_id: "c_1",
    sender_id: "linkedin.com/in/dana",
    text: "Happy to chat",
    timestamp: "2026-10-01T09:00:00.000Z",
  });
  assert.equal(flat.messageId, "m_1");
  assert.equal(flat.text, "Happy to chat");
  assert.equal(flat.sentAt, "2026-10-01T09:00:00.000Z");

  const nested = parseMessageEvent({
    event: "message.created",
    data: { message: { account_id: "u_1", id: "m_2", chat_id: "c_2", body: "Hi" } },
  });
  assert.equal(nested.messageId, "m_2");
  assert.equal(nested.text, "Hi");
});

test("our own sends are recognised, however the payload spells it", () => {
  assert.equal(parseMessageEvent({ account_id: "a", message_id: "m", from_me: true }).fromMe, true);
  assert.equal(parseMessageEvent({ account_id: "a", message_id: "m", is_sender: 1 }).fromMe, true);
  assert.equal(parseMessageEvent({ account_id: "a", message_id: "m" }).fromMe, false);
});

test("a message with no id is refused, because dedupe would be impossible", () => {
  assert.equal(parseMessageEvent({ account_id: "u_1", text: "Hi" }), null);
  assert.equal(parseMessageEvent({ message_id: "m_1", text: "Hi" }), null);
});

test("the hosted-auth notify body reads as a connected account", () => {
  // Exactly what Unipile posts to notify_url when the wizard succeeds: the status word is
  // CREATION_SUCCESS and `name` echoes our connect-session reference.
  const event = parseAccountStatusEvent({ status: "CREATION_SUCCESS", account_id: "acc_1", name: "cx_abc" });
  assert.equal(event?.accountId, "acc_1");
  assert.equal(event?.status, "ok");
});

/* ---------- accepted invitations, email and tracking ----------------------- */

import {
  addressesIn,
  htmlToText,
  isAutoReply,
  isBounce,
  parseEmailEvent,
  parseRelationEvent,
  parseTrackingEvent,
  slugOf,
} from "../lib/channels/events.ts";

test("a new relation names the account and the person, by id and by slug", () => {
  const event = parseRelationEvent({
    event: "new_relation",
    account_id: "acc_1",
    account_type: "LINKEDIN",
    webhook_name: "Flightpath users",
    user_full_name: "Maya Ortiz",
    user_provider_id: "ACoAAB123",
    user_public_identifier: "maya-ortiz",
    user_profile_url: "https://www.linkedin.com/in/maya-ortiz",
  });
  assert.deepEqual(event, {
    accountId: "acc_1",
    providerId: "ACoAAB123",
    publicIdentifier: "maya-ortiz",
    profileUrl: "https://www.linkedin.com/in/maya-ortiz",
    name: "Maya Ortiz",
  });
});

test("a relation with only a profile URL still yields the slug to match on", () => {
  const event = parseRelationEvent({ account_id: "acc_1", user_profile_url: "https://linkedin.com/in/Sam-Lee/" });
  assert.equal(event.publicIdentifier, "sam-lee");
  assert.equal(slugOf("https://www.linkedin.com/company/acme"), "");
});

test("a relation payload missing the account, or every way to identify the person, is refused", () => {
  assert.equal(parseRelationEvent({ user_provider_id: "ACo1" }), null);
  assert.equal(parseRelationEvent({ account_id: "acc_1" }), null);
  assert.equal(parseRelationEvent({ account_id: "acc_1", event: "profile_viewed", user_provider_id: "ACo1" }), null);
});

const received = {
  email_id: "em_1",
  account_id: "acc_mail",
  event: "mail_received",
  webhook_name: "Flightpath emails",
  date: "2026-11-08T10:00:00.000Z",
  from_attendee: { display_name: "Maya Ortiz", identifier: "Maya@Northwind.example", identifier_type: "EMAIL_ADDRESS" },
  to_attendees: [{ display_name: "Sam", identifier: "sam@getacme.example" }],
  subject: "Re: Quick question",
  body: "<p>Yes &amp; Tuesday works.</p><br>On Mon, Sam wrote:",
  body_plain: "",
  message_id: "<abc@mail.example>",
  provider_id: "prov_1",
  role: "inbox",
  folders: ["INBOX"],
  tracking_id: "",
  in_reply_to: { message_id: "<x@y>", id: "em_0" },
};

test("an email webhook reads into one shape: who, what, and what it answers", () => {
  const email = parseEmailEvent(received);
  assert.equal(email.event, "mail_received");
  assert.equal(email.accountId, "acc_mail");
  assert.equal(email.emailId, "em_1");
  assert.deepEqual(email.from, { email: "maya@northwind.example", name: "Maya Ortiz" }, "lower-cased for matching");
  assert.equal(email.to[0].email, "sam@getacme.example");
  assert.equal(email.subject, "Re: Quick question");
  assert.match(email.text, /^Yes & Tuesday works\./, "the HTML is read as text when there is no plain body");
  assert.equal(email.role, "inbox");
  assert.equal(email.inReplyTo, "em_0");
});

test("an email payload without the account or the email id is refused", () => {
  assert.equal(parseEmailEvent({ ...received, account_id: undefined }), null);
  assert.equal(parseEmailEvent({ account_id: "acc_mail" }), null);
});

test("a delivery failure is a bounce, not a reply, and names the address it was about", () => {
  assert.equal(isBounce({ from: { email: "mailer-daemon@googlemail.com", name: "" }, subject: "Delivery Status Notification (Failure)" }), true);
  assert.equal(isBounce({ from: { email: "postmaster@outlook.com", name: "" }, subject: "x" }), true);
  assert.equal(isBounce({ from: { email: "noreply@x.example", name: "" }, subject: "Undeliverable: Quick question" }), true);
  assert.equal(isBounce({ from: { email: "maya@northwind.example", name: "" }, subject: "Re: Quick question" }), false);
  assert.deepEqual(addressesIn("Your message to Maya@Northwind.example couldn't be delivered. maya@northwind.example"), [
    "maya@northwind.example",
  ]);
});

test("an out-of-office is told apart from the person writing back", () => {
  assert.equal(isAutoReply({ subject: "Automatic reply: Quick question", text: "" }), true);
  assert.equal(isAutoReply({ subject: "Out of Office", text: "" }), true);
  assert.equal(isAutoReply({ subject: "Re: Quick question", text: "I'm out next week but yes" }), false);
});

test("HTML mail reads as text: breaks kept, tags and entities gone", () => {
  assert.equal(htmlToText("<div>Hi&nbsp;Sam</div><p>A &lt;b&gt; tag</p><style>p{}</style>"), "Hi Sam\nA <b> tag");
});

test("opens and clicks are read, matched by our label or the tracking id", () => {
  const open = parseTrackingEvent({
    event: "mail_opened",
    event_id: "te_1",
    tracking_id: "tr_1",
    date: "2026-11-08T10:00:00.000Z",
    email_id: "em_1",
    account_id: "acc_mail",
    ip: "1.2.3.4",
    user_agent: "x",
    label: "ev_send1",
  });
  assert.equal(open.kind, "opened");
  assert.equal(open.label, "ev_send1");
  assert.equal(open.url, "", "an open has no link");
  const click = parseTrackingEvent({ event: "mail_link_clicked", tracking_id: "tr_1", url: "https://acme.example/demo" });
  assert.equal(click.kind, "clicked");
  assert.equal(click.url, "https://acme.example/demo");
});

test("a tracking payload that is neither an open nor a click, or names no send, is refused", () => {
  assert.equal(parseTrackingEvent({ event: "mail_sent", tracking_id: "tr_1" }), null);
  assert.equal(parseTrackingEvent({ event: "mail_opened" }), null);
});
