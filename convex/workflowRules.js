/** Deterministic guards shared by operational paths and tests. */
export function canRecordExternalSend({ approvalStatus, isDemo, result }) {
  return approvalStatus === "APPROVED" && !isDemo && Boolean(result?.message_id) && Boolean(result?.thread_id);
}

export function validInboundMessage(payload) {
  const message = payload?.message ?? payload?.data?.message;
  return payload?.event_type === "message.received" && typeof payload?.event_id === "string" && payload.event_id.length > 0 && typeof message?.thread_id === "string" && message.thread_id.length > 0;
}

export function replyNeedsPresence(classification) {
  return classification?.requiresPresence === true && classification?.outcome !== "COMPLETED";
}
