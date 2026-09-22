import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { validInboundMessage } from "./workflowRules.js";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

const http = httpRouter();

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (!expected || request.headers.get("x-moveos-webhook-secret") !== expected) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      const payload = await request.json() as Record<string, any>;
      if (payload.event_type !== "message.received") return new Response("Ignored", { status: 202 });
      const message = payload.message ?? payload.data?.message;
      const eventId = String(payload.event_id ?? "");
      const threadId = String(message?.thread_id ?? "");
      if (!validInboundMessage(payload)) return new Response("Malformed webhook", { status: 400 });
      await ctx.runMutation(internal.operations.ingestReply, {
        externalEventId: eventId,
        threadId,
        subject: String(message?.subject ?? "Provider reply"),
        body: String(message?.text ?? message?.preview ?? "").slice(0, 8000),
        sender: Array.isArray(message?.from) ? String(message.from[0] ?? "") : (message?.from ? String(message.from) : undefined),
      });
      return new Response("Accepted", { status: 202 });
    } catch {
      return new Response("Invalid webhook payload", { status: 400 });
    }
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
