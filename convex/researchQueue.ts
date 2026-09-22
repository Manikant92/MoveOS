import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { activeJob, researchKey } from "./researchModel";

export const health = internalQuery({
  args: {}, returns: v.any(), handler: async (ctx) => ({
    now: Date.now(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").order("desc").take(30)).map((s) => ({ name: s.name, state: s.state, scheduledTime: s.scheduledTime })),
    running: await ctx.db.query("researchJobs").withIndex("by_status", (q) => q.eq("status", "RUNNING")).take(10),
    recent: await ctx.db.query("researchJobs").withIndex("by_status", (q) => q.eq("status", "FAILED")).order("desc").take(5),
  }),
});

// Selection and claim occur in one serializable transaction. Concurrent dispatches
// read the RUNNING index and conflict, so at most one worker owns the lease.
export const dispatch = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const running = await ctx.db.query("researchJobs").withIndex("by_status", (q) => q.eq("status", "RUNNING")).take(100);
    for (const job of running) {
      if ((job.leaseUntil ?? job.updatedAt + 300000) > now) return null;
      await ctx.db.patch(job._id, { status: "FAILED", error: "Research worker timed out; retry is available.", updatedAt: now });
      const task = await ctx.db.get(job.taskId);
      if (task && !task.archived) await ctx.db.patch(task._id, { researchStatus: "RESEARCH_INCOMPLETE", nextAction: "Continue the checklist manually or retry official research." });
    }
    const queued = await ctx.db.query("researchJobs").withIndex("by_status_and_priority", (q) => q.eq("status", "QUEUED")).take(100);
    const retries = await ctx.db.query("researchJobs").withIndex("by_status_and_priority", (q) => q.eq("status", "RETRY_SCHEDULED")).take(100);
    const candidates = [...queued, ...retries.filter((job) => (job.nextRetryAt ?? 0) <= now)].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1) || a.createdAt - b.createdAt);
    for (const job of candidates) {
      const task = await ctx.db.get(job.taskId), move = task && await ctx.db.get(task.eventId);
      if (!task || !move || task.archived || task.isDemo || task.status === "COMPLETED" || task.applicability === "NOT_APPLICABLE" || move.moveType === "UNRESOLVED" || researchKey(task, move) !== job.researchKey) {
        await ctx.db.patch(job._id, { status: "FAILED", error: "Research context superseded or ineligible.", updatedAt: now });
        continue;
      }
      const attempt = (job.attemptCount ?? 0) + 1;
      await ctx.db.patch(job._id, { status: "RUNNING", attemptCount: attempt, leaseUntil: now + 300000, updatedAt: now });
      await ctx.db.patch(task._id, { researchStatus: "SEARCHING", updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.integrations.researchTask, { taskId: task._id, jobId: job._id, attempt });
      await ctx.scheduler.runAfter(300000, internal.researchQueue.dispatch, {});
      return null;
    }
    if (candidates.length >= 100) await ctx.scheduler.runAfter(0, internal.researchQueue.dispatch, {});
    return null;
  },
});

export const context = internalQuery({
  args: { jobId: v.id("researchJobs"), attempt: v.number() }, returns: v.any(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RUNNING" || job.attemptCount !== args.attempt) return null;
    const task = await ctx.db.get(job.taskId), move = task && await ctx.db.get(task.eventId);
    if (!task || !move || task.archived || researchKey(task, move) !== job.researchKey) return null;
    return { job, task, move };
  },
});

export const fail = internalMutation({
  args: { jobId: v.id("researchJobs"), attempt: v.number(), error: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RUNNING" || job.attemptCount !== args.attempt) return null;
    const task = await ctx.db.get(job.taskId), move = task && await ctx.db.get(task.eventId);
    const current = task && move && !task.archived && researchKey(task, move) === job.researchKey;
    const retry = current && /429|rate.?limit|timeout|timed out|abort|5\d\d/i.test(args.error) && args.attempt < 3;
    const delay = 15000 * 2 ** (args.attempt - 1);
    const error = retry ? "Official research is temporarily unavailable; automatic retry scheduled." : "Official research is incomplete; the checklist remains actionable.";
    await ctx.db.patch(job._id, { status: retry ? "RETRY_SCHEDULED" : "FAILED", error, nextRetryAt: retry ? Date.now() + delay : undefined, leaseUntil: undefined, updatedAt: Date.now() });
    if (current) {
      await ctx.db.patch(task._id, { status: task.status === "FAILED" ? "DISCOVERED" : task.status, researchStatus: retry ? "RETRY_SCHEDULED" : "RESEARCH_INCOMPLETE", nextAction: retry ? "Automatic research retry scheduled; checklist can continue manually." : "Continue the checklist manually or retry official research." });
      await ctx.db.insert("activity", { eventId: task.eventId, taskId: task._id, kind: retry ? "RESEARCH_RETRY_SCHEDULED" : "RESEARCH_INCOMPLETE", message: `${task.title}: ${error}`, isDemo: false, createdAt: Date.now() });
    }
    if (retry) await ctx.scheduler.runAfter(delay, internal.researchQueue.dispatch, {});
    await ctx.scheduler.runAfter(0, internal.researchQueue.dispatch, {});
    return null;
  },
});

// Read-only acceptance diagnostics; no secrets or external provider calls.
export const inspect = internalQuery({
  args: { eventId: v.id("lifeEvents") }, returns: v.any(),
  handler: async (ctx, { eventId }) => {
    const tasks = await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(200);
    const jobs = (await Promise.all(tasks.map((task) => ctx.db.query("researchJobs").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).order("desc").take(100)))).flat();
    const active = jobs.filter(activeJob);
    return { jobs, activeCount: active.length, duplicateActiveKeys: active.map((job) => job.researchKey).filter((key, i, keys) => keys.indexOf(key) !== i) };
  },
});
