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
