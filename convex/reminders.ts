import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const reviewPending = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const moves = await ctx.db.query("lifeEvents").take(50);
    for (const move of moves.filter((item) => item.status === "ACTIVE")) {
      const tasks = await ctx.db.query("tasks").withIndex("by_eventId_and_status", (q) => q.eq("eventId", move._id).eq("status", "READY_FOR_APPROVAL")).take(20);
      if (tasks.length) await ctx.db.insert("activity", { eventId: move._id, kind: "APPROVAL_REMINDER", message: `${tasks.length} action${tasks.length === 1 ? "" : "s"} still need approval. No messages were sent.`, isDemo: move.isDemo, createdAt: Date.now() });
    }
    return null;
  },
});
