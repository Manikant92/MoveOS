export function canRecordExternalSend(input: {
  approvalStatus: string;
  isDemo: boolean;
  result?: { message_id?: string; thread_id?: string };
}): boolean;

export function validInboundMessage(payload: unknown): boolean;

export function replyNeedsPresence(classification: {
  outcome?: string;
  requiresPresence?: boolean;
}): boolean;
