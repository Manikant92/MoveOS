import test from "node:test";
import assert from "node:assert/strict";
import { canRecordExternalSend, replyNeedsPresence, validInboundMessage } from "../convex/workflowRules.js";

test("a task cannot be marked sent without an approved non-demo AgentMail result", () => {
  assert.equal(canRecordExternalSend({ approvalStatus: "PENDING", isDemo: false, result: { message_id: "m", thread_id: "t" } }), false);
  assert.equal(canRecordExternalSend({ approvalStatus: "APPROVED", isDemo: true, result: { message_id: "m", thread_id: "t" } }), false);
  assert.equal(canRecordExternalSend({ approvalStatus: "APPROVED", isDemo: false, result: { message_id: "m" } }), false);
  assert.equal(canRecordExternalSend({ approvalStatus: "APPROVED", isDemo: false, result: { message_id: "m", thread_id: "t" } }), true);
});

test("webhook ingestion only accepts identifiable inbound messages", () => {
  assert.equal(validInboundMessage({ event_type: "message.received", event_id: "evt_1", message: { thread_id: "thread_1" } }), true);
  assert.equal(validInboundMessage({ event_type: "message.received", event_id: "", message: { thread_id: "thread_1" } }), false);
  assert.equal(validInboundMessage({ event_type: "message.sent", event_id: "evt_1", message: { thread_id: "thread_1" } }), false);
});

test("only unresolved replies requesting attendance create a presence dependency", () => {
  assert.equal(replyNeedsPresence({ outcome: "WAITING", requiresPresence: true }), true);
  assert.equal(replyNeedsPresence({ outcome: "COMPLETED", requiresPresence: true }), false);
  assert.equal(replyNeedsPresence({ outcome: "WAITING", requiresPresence: false }), false);
});
