import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { classifyMove, normalizeLocation, scopeForCategory } from "./location";
import { evidenceApplies, reconcile, enqueue, researchKey, locationKey, definitions, landlordOnly } from "./researchModel";

const taskStatusArg = v.union(
  v.literal("DISCOVERED"), v.literal("RESEARCHING"), v.literal("READY_FOR_APPROVAL"), v.literal("APPROVED"),
  v.literal("IN_PROGRESS"), v.literal("WAITING"), v.literal("REPLIED"), v.literal("BLOCKED"), v.literal("COMPLETED"),
  v.literal("NOT_APPLICABLE"), v.literal("NEEDS_INFORMATION"), v.literal("FAILED"),
);
const researchStatusArg = v.union(
  v.literal("NOT_STARTED"), v.literal("QUEUED"), v.literal("SEARCHING"), v.literal("VALIDATING"), v.literal("VERIFIED"),
  v.literal("PARTIALLY_VERIFIED"), v.literal("NEEDS_INFORMATION"), v.literal("NEEDS_VERIFICATION"), v.literal("RATE_LIMITED"),
  v.literal("RETRY_SCHEDULED"), v.literal("RESEARCH_INCOMPLETE"),
);

const taskStatuses = ["DISCOVERED", "RESEARCHING", "READY_FOR_APPROVAL", "APPROVED", "IN_PROGRESS", "WAITING", "REPLIED", "BLOCKED", "COMPLETED", "NOT_APPLICABLE", "FAILED"] as const;

const addActivity = async (ctx: any, eventId: any, message: string, kind: string, isDemo: boolean, taskId?: any) => {
  await ctx.db.insert("activity", { eventId, taskId, message, kind, isDemo, createdAt: Date.now() });
};

export const listMoves = query({ args: {}, returns: v.array(v.any()), handler: (ctx) => ctx.db.query("lifeEvents").order("desc").take(50) });
export const getDashboard = query({
  args: { eventId: v.id("lifeEvents") }, returns: v.any(),
  handler: async (ctx, args) => {
    const move = await ctx.db.get(args.eventId);
    if (!move) return null;
    const [allTasks, dependencies, activity, impactEvents] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(100),
      ctx.db.query("dependencies").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(100),
      ctx.db.query("activity").withIndex("by_eventId_and_createdAt", (q) => q.eq("eventId", args.eventId)).order("desc").take(40),
      ctx.db.query("impactEvents").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).order("desc").take(10),
    ]);
    const tasks = allTasks.filter((task) => !task.archived);
    const taskIds = new Set(tasks.map((task) => task._id));
    const approvals = (await Promise.all(tasks.map((task) => ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(3)))).flat();
    const allEvidence = (await Promise.all(allTasks.map((task) => ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).order("desc").take(200)))).flat();
    const evidence = allEvidence.filter((item) => evidenceApplies(item, move, tasks.find((task) => task._id === item.taskId)));
    const communications = (await Promise.all(tasks.map((task) => ctx.db.query("communications").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(3)))).flat();
    const impacts = (await Promise.all(impactEvents.map((event) => ctx.db.query("impacts").withIndex("by_impactEventId", (q) => q.eq("impactEventId", event._id)).take(100)))).flat();
    const domains = definitions(move).map((task) => task.category);
    const verified = new Set(evidence.filter((item) => !item.isDemo).map((item) => item.taskId)).size;
    return { move, tasks, verified, dependencies: dependencies.filter((d) => taskIds.has(d.sourceTaskId) && taskIds.has(d.targetTaskId)), approvals, evidence, historicalEvidence: allEvidence.filter((item) => !evidenceApplies(item, move, tasks.find((task) => task._id === item.taskId))), communications, activity, impactEvents, impacts, coverage: { considered: domains.length, domains } };
  },
});

export const createMove = mutation({
  args: { origin: v.string(), destination: v.string(), moveDate: v.string(), householdSize: v.string(), notes: v.optional(v.string()) }, returns: v.id("lifeEvents"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const originLocation = normalizeLocation(args.origin);
    const destinationLocation = normalizeLocation(args.destination);
    const eventId = await ctx.db.insert("lifeEvents", { type: "MOVE", title: `${originLocation.canonicalCity} → ${destinationLocation.canonicalCity}`, ...args, originLocation, destinationLocation, moveType: classifyMove(originLocation, destinationLocation), contextVersion: 1, status: "ACTIVE", isDemo: false, createdAt: now, updatedAt: now });
    await addActivity(ctx, eventId, `${originLocation.canonicalCity} resolved to ${originLocation.stateOrProvince ?? "an unresolved region"}, ${originLocation.country ?? "an unresolved country"}.`, "LOCATION_RESOLVED", false);
    await addActivity(ctx, eventId, `${destinationLocation.canonicalCity} resolved to ${destinationLocation.stateOrProvince ?? "an unresolved region"}, ${destinationLocation.country ?? "an unresolved country"}.`, "LOCATION_RESOLVED", false);
    await addActivity(ctx, eventId, `${classifyMove(originLocation, destinationLocation)} relocation detected.`, "MOVE_CLASSIFIED", false);
    await addActivity(ctx, eventId, "Move created. MOVEOS is discovering affected operations.", "MOVE_CREATED", false);
    await reconcile(ctx, eventId);
    return eventId;
  },
});

export const updateMove = mutation({
  args: { eventId: v.id("lifeEvents"), origin: v.optional(v.string()), destination: v.optional(v.string()), moveDate: v.optional(v.string()), householdSize: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const move = await ctx.db.get(args.eventId);
    if (!move) throw new Error("Move not found");
    const origin = (args.origin ?? move.origin).trim(), destination = (args.destination ?? move.destination).trim();
    const originLocation = normalizeLocation(origin), destinationLocation = normalizeLocation(destination);
    const moveDate = (args.moveDate ?? move.moveDate).trim(), householdSize = (args.householdSize ?? move.householdSize).trim().replace(/\s+/g, " ");
    const originChanged = locationKey(normalizeLocation(move.origin)) !== locationKey(originLocation);
    const destinationChanged = locationKey(normalizeLocation(move.destination)) !== locationKey(destinationLocation);
    const dateChanged = moveDate !== move.moveDate.trim(), householdChanged = householdSize.toLowerCase() !== move.householdSize.trim().replace(/\s+/g, " ").toLowerCase();
    // Important: absolutely no writes or scheduling before the canonical no-op check.
    if (!originChanged && !destinationChanged && !dateChanged && !householdChanged) return null;
    const next = { origin, destination, originLocation, destinationLocation, moveDate, householdSize, moveType: classifyMove(originLocation, destinationLocation), contextVersion: (move.contextVersion ?? 1) + 1 };
    const descriptions = [
      ...(originChanged ? [`origin: ${move.origin} → ${origin}`] : []),
      ...(destinationChanged ? [`destination: ${move.destination} → ${destination}`] : []),
      ...(dateChanged ? [`date: ${move.moveDate} → ${moveDate}`] : []),
      ...(householdChanged ? [`household: ${move.householdSize} → ${householdSize}`] : []),
    ];
    const impactEventId = await ctx.db.insert("impactEvents", { eventId: move._id, triggerType: "ROOT_CONTEXT_CHANGED", triggerDescription: descriptions.join("; "), previousContext: { origin: move.origin, destination: move.destination, moveDate: move.moveDate, householdSize: move.householdSize, contextVersion: move.contextVersion ?? 1 }, newContext: next, status: "COMPLETED", createdAt: Date.now() });
    await ctx.db.patch(move._id, { ...next, title: `${originLocation.canonicalCity} → ${destinationLocation.canonicalCity}`, updatedAt: Date.now() });
    const tasks = await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", move._id)).take(200);
    for (const task of tasks) {
      if (task.archived) continue;
      const scope = task.geographicScope ?? scopeForCategory(task.category);
      const countriesChanged = move.originLocation?.countryCode !== originLocation.countryCode || move.destinationLocation?.countryCode !== destinationLocation.countryCode;
      const affected = dateChanged || householdChanged || (scope === "NATIONAL" ? countriesChanged : (scope !== "DESTINATION" && originChanged) || (scope !== "ORIGIN" && destinationChanged));
      if (affected) await ctx.db.insert("impacts", { eventId: move._id, impactEventId, taskId: task._id, impactType: dateChanged ? "RESCHEDULED" : "CONTEXT_CHANGED", reason: descriptions.join("; "), approvalRequired: false, status: "OPEN", createdAt: Date.now() });
    }
    await reconcile(ctx, move._id);
    await addActivity(ctx, move._id, `Impact Cascade: ${descriptions.join("; ")}.`, "IMPACT_CASCADE", move.isDemo);
    return null;
  },
});

// Explicit, repeatable legacy repair. Kept internal: no new public admin surface.
export const repairMove = internalMutation({
  args: { eventId: v.id("lifeEvents") }, returns: v.null(),
  handler: async (ctx, { eventId }) => { await reconcile(ctx, eventId); return null; },
});

export const seedDemo = mutation({
  args: {}, returns: v.id("lifeEvents"),
  handler: async (ctx) => {
    const existing = await ctx.db.query("lifeEvents").withIndex("by_demoKey", (q) => q.eq("demoKey", "hyderabad-bangalore-2026")).first();
    if (existing) {
      const originLocation = normalizeLocation(existing.origin);
      const destinationLocation = normalizeLocation(existing.destination);
      await ctx.db.patch(existing._id, { originLocation, destinationLocation, moveType: classifyMove(originLocation, destinationLocation), contextVersion: existing.contextVersion ?? 1, title: `${originLocation.canonicalCity} → ${destinationLocation.canonicalCity}` });
      return existing._id;
    }
    const now = Date.now();
    const originLocation = normalizeLocation("Hyderabad");
    const destinationLocation = normalizeLocation("Bangalore");
    const eventId = await ctx.db.insert("lifeEvents", { type: "MOVE", title: "Hyderabad → Bengaluru", origin: "Hyderabad", destination: "Bangalore", originLocation, destinationLocation, moveType: classifyMove(originLocation, destinationLocation), moveDate: "2026-10-01", householdSize: "2 adults + 1 child", status: "ACTIVE", isDemo: true, demoKey: "hyderabad-bangalore-2026", contextVersion: 1, createdAt: now, updatedAt: now });
    const broadband = await ctx.db.insert("tasks", { eventId, title: "Transfer broadband service", description: "Arrange a destination installation before moving day.", category: "INTERNET", status: "READY_FOR_APPROVAL", priority: "HIGH", dueDate: "2026-09-24", reason: "Internet access is needed immediately at the destination.", nextAction: "Approve the provider transfer request.", requiresApproval: true, draftSubject: "Request to transfer broadband service", draftBody: "Hello,\n\nI am moving from Hyderabad to Bangalore on October 1, 2026. Please let me know the transfer process, earliest installation date, and any documents required.\n\nThank you.", dedupeKey: "broadband-transfer", isDemo: true, geographicScope: "BOTH", contextVersion: 1, createdAt: now, updatedAt: now });
    const electricity = await ctx.db.insert("tasks", { eventId, title: "Schedule final electricity meter reading", description: "Close the Hyderabad service after the final reading.", category: "UTILITIES", status: "IN_PROGRESS", priority: "HIGH", dueDate: "2026-09-30", reason: "A final bill depends on the final meter reading.", nextAction: "Confirm the final reading appointment.", requiresApproval: false, dedupeKey: "electricity-final-reading", isDemo: true, geographicScope: "ORIGIN", contextVersion: 1, createdAt: now, updatedAt: now });
    const address = await ctx.db.insert("tasks", { eventId, title: "Update insurance address", description: "Keep policy correspondence and risk address current.", category: "INSURANCE", status: "DISCOVERED", priority: "MEDIUM", dueDate: "2026-10-08", reason: "Coverage documents should reflect the new residence.", nextAction: "Research the insurer’s address-change policy.", requiresApproval: false, dedupeKey: "insurance-address", isDemo: true, geographicScope: "NATIONAL", contextVersion: 1, createdAt: now, updatedAt: now });
    const presence = await ctx.db.insert("tasks", { eventId, title: "Be present for installation", description: "Coordinate an adult at the Bangalore home for the installation window.", category: "FAMILY", status: "WAITING", priority: "HIGH", dueDate: "2026-09-29", reason: "The provider requires someone to be present to complete installation.", nextAction: "Confirm who can attend the appointment.", requiresApproval: false, dedupeKey: "installation-presence", isDemo: true, geographicScope: "DESTINATION", contextVersion: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("dependencies", { eventId, sourceTaskId: broadband, targetTaskId: presence, relationship: "requires", condition: "Installation appointment is confirmed", status: "ACTIVE" });
    await ctx.db.insert("dependencies", { eventId, sourceTaskId: electricity, targetTaskId: broadband, relationship: "precedes", condition: "Close-out work should finish before move day", status: "ACTIVE" });
    await ctx.db.insert("evidence", { taskId: broadband, sourceUrl: "https://example.com/demo-broadband-policy", sourceTitle: "Demo provider relocation policy", excerpt: "Demo evidence: service transfer requests require advance notice and an adult present for installation.", sourceType: "DEMO", retrievedAt: now, extractedRequirement: "Request transfer in advance and arrange an adult at installation.", confidence: 0.94, isDemo: true });
    await ctx.db.insert("approvals", { taskId: broadband, action: "Send provider transfer request", proposedContent: "Request a Bangalore installation and transfer details.", status: "PENDING", requestId: "demo-broadband-approval", createdAt: now });
    await ctx.db.insert("communications", { taskId: broadband, direction: "OUTBOUND", subject: "Request to transfer broadband service", body: "Demo draft only — no message has been sent.", status: "DRAFT", isDemo: true, createdAt: now, updatedAt: now });
    for (const [kind, message] of [["MOVE_CREATED", "Demo move created: Hyderabad → Bangalore."], ["DISCOVERY", "MOVEOS discovered 14 potentially affected areas."], ["RESEARCH", "Demo research identified a broadband relocation requirement."], ["APPROVAL", "Broadband draft is ready for your approval."]] as const) await addActivity(ctx, eventId, message, kind, true);
    return eventId;
  },
});

export const requestResearch = mutation({
  args: { taskId: v.id("tasks") }, returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    if (task.isDemo) throw new Error("Demo tasks cannot call external research.");
    const move = await ctx.db.get(task.eventId);
    if (move) await enqueue(ctx, task, move);
    return null;
  },
});
export const provideTaskInfo = mutation({
  args: { taskId: v.id("tasks"), provider: v.string() }, returns: v.null(),
  handler: async (ctx, { taskId, provider }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    const cleaned = provider.trim().replace(/\s+/g, " ");
    if (!cleaned || cleaned.length > 120) throw new Error("Enter a provider name (1–120 characters).");
    if (task.provider?.toLowerCase() === cleaned.toLowerCase()) return null;
    await ctx.db.patch(taskId, { provider: cleaned, status: "DISCOVERED", researchStatus: "NOT_STARTED", inputQuestion: undefined, nextAction: "Research official provider requirements.", updatedAt: Date.now() });
    const move = await ctx.db.get(task.eventId);
    if (move) await reconcile(ctx, move._id);
    return null;
  },
});

export const approve = mutation({
  args: { approvalId: v.id("approvals") }, returns: v.null(),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "PENDING") return null;
    const task = await ctx.db.get(approval.taskId);
    if (!task) throw new Error("Task not found");
    if (!task.isDemo) {
      const move = await ctx.db.get(task.eventId);
      const evidence = await ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).order("desc").take(200);
      if (!move || !evidence.some((item) => evidenceApplies(item, move, task))) throw new Error("Current verified evidence is required before approving an external action.");
    }
    const now = Date.now();
    await ctx.db.patch(approval._id, { status: "APPROVED", approvedAt: now });
    await ctx.db.patch(task._id, { status: "APPROVED", updatedAt: now });
    await addActivity(ctx, task.eventId, `Approval granted for ${task.title}.`, "APPROVED", task.isDemo, task._id);
    if (task.isDemo) {
      await ctx.db.patch(task._id, { status: "IN_PROGRESS", updatedAt: Date.now() });
      await addActivity(ctx, task.eventId, "Demo mode: no external message was sent.", "DEMO_GUARD", true, task._id);
    } else {
      await ctx.scheduler.runAfter(0, internal.integrations.executeApproved, { taskId: task._id, approvalId: approval._id });
    }
    return null;
  },
});

export const reject = mutation({
  args: { approvalId: v.id("approvals") }, returns: v.null(),
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.status !== "PENDING") return null;
    const task = await ctx.db.get(approval.taskId);
    if (!task) throw new Error("Task not found");
    await ctx.db.patch(approval._id, { status: "REJECTED", rejectedAt: Date.now() });
    await ctx.db.patch(task._id, { status: "BLOCKED", updatedAt: Date.now() });
    await addActivity(ctx, task.eventId, `Approval rejected for ${task.title}.`, "REJECTED", task.isDemo, task._id);
    return null;
  },
});

export const createDiscoveredTask = internalMutation({
  args: { eventId: v.id("lifeEvents"), title: v.string(), description: v.string(), category: v.string(), priority: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")), reason: v.string(), dedupeKey: v.string(), geographicScope: v.optional(v.union(v.literal("ORIGIN"), v.literal("DESTINATION"), v.literal("BOTH"), v.literal("NATIONAL"), v.literal("INTERNATIONAL"))), provider: v.optional(v.string()), inputQuestion: v.optional(v.string()), status: v.optional(taskStatusArg), researchStatus: v.optional(researchStatusArg), applicability: v.optional(v.union(v.literal("LIKELY_APPLICABLE"), v.literal("CONFIRMED_APPLICABLE"), v.literal("MAY_APPLY"), v.literal("NOT_APPLICABLE"), v.literal("NEEDS_INFORMATION"))) }, returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("tasks").withIndex("by_eventId_and_dedupeKey", (q) => q.eq("eventId", args.eventId).eq("dedupeKey", args.dedupeKey)).first();
    if (existing) return existing._id;
    const now = Date.now();
    const move = await ctx.db.get(args.eventId);
    const { status, ...taskArgs } = args;
    const taskId = await ctx.db.insert("tasks", { ...taskArgs, status: status ?? "DISCOVERED", researchStatus: args.researchStatus ?? (status === "NEEDS_INFORMATION" ? "NEEDS_INFORMATION" : "NOT_STARTED"), applicability: args.applicability ?? (status === "NEEDS_INFORMATION" ? "NEEDS_INFORMATION" : "LIKELY_APPLICABLE"), geographicScope: args.geographicScope ?? scopeForCategory(args.category), contextVersion: move?.contextVersion ?? 1, nextAction: args.inputQuestion ?? "Research official requirements.", requiresApproval: false, isDemo: false, createdAt: now, updatedAt: now });
    await addActivity(ctx, args.eventId, `Discovered: ${args.title}.`, "DISCOVERY", false, taskId);
    return taskId;
  },
});

export const saveResearch = internalMutation({
  args: { jobId: v.optional(v.id("researchJobs")), attempt: v.optional(v.number()), nationalValidated: v.optional(v.boolean()), sourceScope: v.optional(v.union(v.literal("ORIGIN"), v.literal("DESTINATION"), v.literal("BOTH"), v.literal("NATIONAL"), v.literal("INTERNATIONAL"))), taskId: v.id("tasks"), sourceUrl: v.string(), sourceTitle: v.string(), excerpt: v.string(), requirement: v.string(), confidence: v.number(), authority: v.optional(v.union(v.literal("GOVERNMENT"), v.literal("REGULATOR"), v.literal("OFFICIAL_PROVIDER"), v.literal("AUTHORITATIVE"), v.literal("SECONDARY"))), geographicRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))), applicableLocation: v.optional(v.string()), needsVerification: v.optional(v.boolean()), contextVersion: v.optional(v.number()), taskRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))), userRoleRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))), validationReasons: v.optional(v.array(v.string())) }, returns: v.null(),
  handler: async (ctx, args) => {
    // Old scheduled workers lack a job token: they may never publish evidence.
    if (!args.jobId || args.attempt === undefined) return null;
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "RUNNING" || job.attemptCount !== args.attempt || job.taskId !== args.taskId) return null;
    const task = await ctx.db.get(args.taskId), move = task && await ctx.db.get(task.eventId);
    if (!task || !move || task.archived || researchKey(task, move) !== job.researchKey) {
      await ctx.db.patch(job._id, { status: "FAILED", error: "Stale attempt discarded.", updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.researchQueue.dispatch, {});
      return null;
    }
    const now = Date.now();
    const sourceScope = args.sourceScope ?? task.geographicScope ?? "BOTH";
    const record = {
      taskId: task._id, sourceUrl: args.sourceUrl, sourceTitle: args.sourceTitle, excerpt: args.excerpt.slice(0, 1200),
      sourceType: "OFFICIAL" as const, retrievedAt: now, extractedRequirement: args.requirement.trim(), confidence: Math.max(0, Math.min(args.confidence, 1)), isDemo: false,
      authority: args.authority, geographicRelevance: args.geographicRelevance, applicableLocation: args.applicableLocation,
      needsVerification: args.needsVerification ?? true, contextVersion: job.contextVersion,
      taskRelevance: args.taskRelevance, userRoleRelevance: args.userRoleRelevance, validationReasons: args.validationReasons,
      geographicScope: sourceScope, activeStatus: "ACTIVE" as const,
      contextSnapshot: { originLocation: move.originLocation ?? null, destinationLocation: move.destinationLocation ?? null, provider: task.provider ?? "", taskId: task._id, taskCategory: task.category, geographicScope: sourceScope, contextVersion: job.contextVersion ?? 1, moveDate: move.moveDate, householdSize: move.householdSize, nationalValidated: args.nationalValidated === true },
    };
    const accepted = evidenceApplies({ ...record, _id: "" as any, _creationTime: now }, move, task);
    await ctx.db.insert("evidence", { ...record, needsVerification: !accepted, ...(accepted ? {} : { activeStatus: "STALE" as const, staleReason: landlordOnly(record, task) ? "Landlord-only guidance does not substantiate a tenant task." : "Source applicability requires verification." }) });
    await ctx.db.patch(task._id, { status: task.status === "FAILED" ? "DISCOVERED" : task.status, researchStatus: accepted ? "VERIFIED" : "NEEDS_VERIFICATION", nextAction: accepted ? args.requirement : "Continue the checklist manually or retry official research.", updatedAt: now });
    await ctx.db.patch(job._id, { status: "COMPLETED", leaseUntil: undefined, updatedAt: now });
    await addActivity(ctx, task.eventId, accepted ? `Verified evidence saved for ${task.title}.` : `Source requires verification for ${task.title}; checklist remains actionable.`, "RESEARCH_COMPLETE", false, task._id);
    await ctx.scheduler.runAfter(0, internal.researchQueue.dispatch, {});
    return null;
  },
});

// Compatibility handlers for pre-upgrade scheduled actions. Never mutate a newer job.
export const setResearchFailure = internalMutation({
  args: { taskId: v.id("tasks"), error: v.string() }, returns: v.null(), handler: async () => null,
});
export const markResearchRunning = internalMutation({
  args: { taskId: v.id("tasks") }, returns: v.null(), handler: async () => null,
});

export const getDispatch = internalQuery({
  args: { taskId: v.id("tasks"), approvalId: v.id("approvals") }, returns: v.any(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId), approval = await ctx.db.get(args.approvalId);
    const move = task && await ctx.db.get(task.eventId);
    const evidence = task ? await ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).order("desc").take(200) : [];
    return { task, approval, evidenceValid: Boolean(task && move && approval?.taskId === task._id && evidence.some((item) => evidenceApplies(item, move, task))) };
  },
});
export const getMove = internalQuery({ args: { eventId: v.id("lifeEvents") }, returns: v.any(), handler: (ctx, args) => ctx.db.get(args.eventId) });
export const getTask = internalQuery({ args: { taskId: v.id("tasks") }, returns: v.any(), handler: (ctx, args) => ctx.db.get(args.taskId) });
export const countRunningResearch = internalQuery({ args: {}, returns: v.number(), handler: async (ctx) => (await ctx.db.query("researchJobs").withIndex("by_status", (q) => q.eq("status", "RUNNING")).take(2)).length });

export const recordSendResult = internalMutation({
  args: { taskId: v.id("tasks"), approvalId: v.id("approvals"), ok: v.boolean(), messageId: v.optional(v.string()), threadId: v.optional(v.string()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    const approval = await ctx.db.get(args.approvalId);
    if (!task || !approval || approval.status !== "APPROVED") return null;
    const now = Date.now();
    if (args.ok && args.messageId && args.threadId) {
      await ctx.db.insert("communications", { taskId: task._id, agentMailMessageId: args.messageId, agentMailThreadId: args.threadId, direction: "OUTBOUND", recipient: task.recipient, subject: task.draftSubject ?? task.title, body: task.draftBody ?? "", status: "SENT", isDemo: false, createdAt: now, updatedAt: now });
      await ctx.db.patch(task._id, { status: "WAITING", updatedAt: now });
      await ctx.db.patch(approval._id, { status: "EXECUTED" });
      await addActivity(ctx, task.eventId, `AgentMail sent an approved message for ${task.title}.`, "MESSAGE_SENT", false, task._id);
    } else {
      await ctx.db.patch(task._id, { status: "FAILED", updatedAt: now });
      await ctx.db.patch(approval._id, { status: "FAILED" });
      await addActivity(ctx, task.eventId, `No message was sent: ${args.error ?? "provider failure"}`, "SEND_FAILED", false, task._id);
    }
    return null;
  },
});

export const ingestReply = internalMutation({
  args: { externalEventId: v.string(), threadId: v.string(), subject: v.string(), body: v.string(), sender: v.optional(v.string()) }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("webhookEvents").withIndex("by_eventId", (q) => q.eq("eventId", args.externalEventId)).first();
    if (duplicate) return false;
    await ctx.db.insert("webhookEvents", { eventId: args.externalEventId, receivedAt: Date.now() });
    const prior = await ctx.db.query("communications").withIndex("by_agentMailThreadId", (q) => q.eq("agentMailThreadId", args.threadId)).first();
    if (!prior) return false;
    const task = await ctx.db.get(prior.taskId);
    if (!task) return false;
    const now = Date.now();
    await ctx.db.insert("communications", { taskId: task._id, agentMailThreadId: args.threadId, direction: "INBOUND", sender: args.sender, subject: args.subject.slice(0, 300), body: args.body.slice(0, 8000), status: "RECEIVED", externalEventId: args.externalEventId, isDemo: false, createdAt: now, updatedAt: now });
    await ctx.db.patch(task._id, { status: "REPLIED", updatedAt: now });
    await addActivity(ctx, task.eventId, `Provider reply received for ${task.title}.`, "REPLY_RECEIVED", false, task._id);
    await ctx.scheduler.runAfter(0, internal.integrations.classifyReply, { taskId: task._id, body: args.body.slice(0, 8000) });
    return true;
  },
});

export const applyReplyClassification = internalMutation({
  args: { taskId: v.id("tasks"), outcome: v.union(v.literal("COMPLETED"), v.literal("WAITING"), v.literal("NEEDS_ACTION")), summary: v.string(), requiresPresence: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const now = Date.now();
    const status = args.outcome === "COMPLETED" ? "COMPLETED" : args.outcome === "WAITING" ? "WAITING" : "IN_PROGRESS";
    await ctx.db.patch(task._id, { status, nextAction: args.summary.slice(0, 500), updatedAt: now });
    await addActivity(ctx, task.eventId, `OpenAI classified provider reply: ${args.summary.slice(0, 180)}`, "REPLY_CLASSIFIED", false, task._id);
    if (args.requiresPresence) {
      const key = `presence-${task._id}`;
      const existing = await ctx.db.query("tasks").withIndex("by_eventId_and_dedupeKey", (q) => q.eq("eventId", task.eventId).eq("dedupeKey", key)).first();
      if (!existing) {
        const presenceId = await ctx.db.insert("tasks", { eventId: task.eventId, title: "Be present for provider appointment", description: "A provider response requires an adult to attend the appointment.", category: "FAMILY", status: "DISCOVERED", priority: "HIGH", reason: "Created from a real incoming provider reply.", nextAction: "Assign an adult to the appointment window.", requiresApproval: false, dedupeKey: key, isDemo: false, createdAt: now, updatedAt: now });
        await ctx.db.insert("dependencies", { eventId: task.eventId, sourceTaskId: task._id, targetTaskId: presenceId, relationship: "requires", condition: "Provider requested an adult present", status: "ACTIVE" });
        await addActivity(ctx, task.eventId, "Dependency graph updated: presence is required for the provider appointment.", "DEPENDENCY_CREATED", false, presenceId);
      }
    }
    const refusal = /cannot|can't|unavailable|not possible|unable to transfer|outside our service area/i.test(`${args.summary} ${task.nextAction}`);
    if (refusal) {
      const downstream = [
        ["Cancel old service", "Confirm cancellation and final billing for the unavailable transfer.", "UTILITIES", "HIGH", "The provider cannot transfer the service.", "cancel-old-service"],
        ["Check termination fee", "Verify any contract or early-termination charge before cancellation.", "INTERNET", "MEDIUM", "An unavailable transfer may trigger a termination review.", "check-termination-fee"],
        ["Find destination provider", "Research replacement connectivity available at the destination.", "INTERNET", "HIGH", "A replacement provider is needed because transfer is unavailable.", "find-destination-provider"],
      ] as const;
      let previous = task._id;
      for (const [title, description, category, priority, reason, dedupeKey] of downstream) {
        const existing = await ctx.db.query("tasks").withIndex("by_eventId_and_dedupeKey", (q) => q.eq("eventId", task.eventId).eq("dedupeKey", dedupeKey)).first();
        const child = existing?._id ?? await ctx.db.insert("tasks", { eventId: task.eventId, title, description, category, status: "DISCOVERED", priority, reason, nextAction: "Research official requirements.", requiresApproval: false, dedupeKey, isDemo: false, geographicScope: category === "UTILITIES" ? "ORIGIN" : "DESTINATION", contextVersion: (await ctx.db.get(task.eventId))?.contextVersion ?? 1, createdAt: now, updatedAt: now });
        const duplicateEdge = (await ctx.db.query("dependencies").withIndex("by_sourceTaskId", (q) => q.eq("sourceTaskId", previous)).take(100)).find((edge) => edge.targetTaskId === child);
        if (!duplicateEdge) await ctx.db.insert("dependencies", { eventId: task.eventId, sourceTaskId: previous, targetTaskId: child, relationship: "caused-by", condition: "Provider transfer unavailable", status: "ACTIVE" });
        await addActivity(ctx, task.eventId, `Impact Cascade created: ${title}.`, "DEPENDENCY_CREATED", false, child);
        previous = child;
      }
    }
    return null;
  },
});
