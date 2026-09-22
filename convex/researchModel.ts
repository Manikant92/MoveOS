import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { classifyMove, normalizeLocation } from "./location";

type Scope = NonNullable<Doc<"tasks">["geographicScope"]>;
type Baseline = { category: string; title: string; description: string; geographicScope: Scope; priority: "HIGH" | "MEDIUM" | "LOW"; inputQuestion?: string; child?: boolean };
export const baseline: Baseline[] = [
  { category: "HOUSING", title: "Destination housing", description: "Confirm tenancy, deposit, move-in and proof-of-address requirements as a prospective tenant.", geographicScope: "DESTINATION", priority: "HIGH" },
  { category: "MOVING_LOGISTICS", title: "Moving logistics", description: "Plan packing, inventory, transport and delivery arrangements.", geographicScope: "BOTH", priority: "HIGH" },
  { category: "ELECTRICITY", title: "Electricity — origin close-out", description: "Check final meter readings, account closure and final billing.", geographicScope: "ORIGIN", priority: "HIGH" },
  { category: "WATER_GAS_UTILITIES", title: "Water and gas utilities", description: "Check origin close-out and destination water and gas connections.", geographicScope: "BOTH", priority: "MEDIUM" },
  { category: "BROADBAND", title: "Broadband — transfer or replacement", description: "Check service transfer, cancellation and replacement availability.", geographicScope: "BOTH", priority: "HIGH", inputQuestion: "Who is your current broadband provider?" },
  { category: "TELECOM", title: "Mobile and telecom", description: "Review mobile service continuity and address-tied telecom records.", geographicScope: "BOTH", priority: "LOW" },
  { category: "FINANCIAL", title: "Financial accounts — address updates", description: "Review national banking address-update requirements and account continuity.", geographicScope: "NATIONAL", priority: "MEDIUM" },
  { category: "INSURANCE", title: "Insurance — address update", description: "Check policy address changes and continuity of coverage.", geographicScope: "NATIONAL", priority: "MEDIUM", inputQuestion: "Which insurer/policy should MOVEOS evaluate?" },
  { category: "EMPLOYMENT_PAYROLL", title: "Employment and payroll", description: "Review employer address, payroll and employment continuity; for international moves check right-to-work dependencies.", geographicScope: "BOTH", priority: "MEDIUM" },
  { category: "HEALTHCARE", title: "Healthcare / medical continuity", description: "Arrange medical records, prescriptions and destination healthcare access.", geographicScope: "BOTH", priority: "HIGH" },
  { category: "EDUCATION", title: "Education / school transition", description: "Plan school placement, transfer records and admission timing for the child.", geographicScope: "BOTH", priority: "HIGH", child: true },
  { category: "GOVERNMENT_ADMIN", title: "Government and identity records", description: "Review government address and identity administration requirements.", geographicScope: "NATIONAL", priority: "MEDIUM" },
  { category: "ADDRESS_CHANGE", title: "Address changes", description: "List organisations that need the new correspondence address.", geographicScope: "BOTH", priority: "MEDIUM" },
  { category: "TRANSPORT_VEHICLE", title: "Vehicle and transport", description: "Check vehicle relocation, driving licence, registration and local transport needs.", geographicScope: "BOTH", priority: "MEDIUM" },
  { category: "SUBSCRIPTIONS_SERVICES", title: "Subscriptions and deliveries", description: "Update delivery addresses, memberships and recurring services.", geographicScope: "BOTH", priority: "LOW" },
  { category: "IMPORTANT_DOCUMENTS", title: "Important documents", description: "Collect identity, education, employment, medical, insurance and tenancy records.", geographicScope: "BOTH", priority: "HIGH" },
  { category: "FAMILY_CHILD", title: "Family and child arrangements", description: "Plan childcare, dependent records and family arrival arrangements.", geographicScope: "BOTH", priority: "MEDIUM", child: true },
];
export const internationalBaseline: Baseline[] = [
  { category: "IMMIGRATION", title: "Immigration — right to reside", description: "Check the applicable visa or residence pathway without assuming eligibility.", geographicScope: "INTERNATIONAL", priority: "HIGH" },
  { category: "TRAVEL_DOCUMENTS", title: "Travel documents", description: "Check passport validity and dependent travel documentation.", geographicScope: "INTERNATIONAL", priority: "HIGH" },
  { category: "CUSTOMS", title: "Customs — household goods", description: "Review declarations, import restrictions and household goods shipping.", geographicScope: "INTERNATIONAL", priority: "HIGH" },
  { category: "TRAVEL", title: "Travel and arrival plan", description: "Plan baggage, arrival transport and temporary accommodation.", geographicScope: "INTERNATIONAL", priority: "MEDIUM" },
  { category: "CROSS_BORDER_FINANCE", title: "Cross-border finance", description: "Review international banking, payments and financial continuity.", geographicScope: "INTERNATIONAL", priority: "MEDIUM" },
  { category: "TAX_ADMIN", title: "Tax and destination registration", description: "Identify tax-residence and destination registration questions for qualified advice.", geographicScope: "INTERNATIONAL", priority: "MEDIUM" },
];
export function definitions(move: Pick<Doc<"lifeEvents">, "moveType">) {
  return [...baseline, ...(move.moveType === "INTERNATIONAL" ? internationalBaseline : [])];
}
export const locationKey = (location: any) => [location?.canonicalCity, location?.stateOrProvince, location?.countryCode].join("|").toLowerCase();
export const hasChildren = (household: string) => /\b[1-9]\d*\s*(child|children|kid|kids|dependent)/i.test(household);
export const providerQuestion = (task: Pick<Doc<"tasks">, "category">) => baseline.find((item) => item.category === task.category)?.inputQuestion;
export const activeJob = (job: Pick<Doc<"researchJobs">, "status">) => ["QUEUED", "RUNNING", "RETRY_SCHEDULED"].includes(job.status);
export function researchKey(task: Doc<"tasks">, move: Doc<"lifeEvents">) {
  return JSON.stringify([task._id, move.contextVersion ?? 1, task.provider?.trim().toLowerCase() ?? "", locationKey(move.originLocation), locationKey(move.destinationLocation), task.geographicScope, "OFFICIAL_REQUIREMENTS"]);
}
export function landlordOnly(source: { sourceTitle: string; sourceUrl: string }, task: Pick<Doc<"tasks">, "category">) {
  return task.category === "HOUSING" && /renting.out.your.property|landlord|letting.your.property/i.test(`${source.sourceTitle} ${source.sourceUrl}`);
}
// Missing legacy validation metadata is not a verified fact. It must be researched again.
export function evidenceApplies(item: Doc<"evidence">, move: Doc<"lifeEvents">, task?: Doc<"tasks">): boolean {
  if (!task || task.archived || task.applicability === "NOT_APPLICABLE") return false;
  if (item.isDemo) return move.isDemo;
  if (item.activeStatus !== "ACTIVE" || item.needsVerification !== false || !item.extractedRequirement.trim() || landlordOnly(item, task)) return false;
  if (!item.authority || item.authority === "SECONDARY" || ![item.geographicRelevance, item.taskRelevance, item.userRoleRelevance].every((r) => r === "HIGH" || r === "MEDIUM")) return false;
  const snap = item.contextSnapshot;
  if (!snap || snap.taskId !== task._id || snap.taskCategory !== task.category || (snap.provider ?? "").toLowerCase() !== (task.provider ?? "").toLowerCase() || !item.contextVersion) return false;
  if (!snap.originLocation?.countryCode || !snap.destinationLocation?.countryCode || !move.originLocation?.countryCode || !move.destinationLocation?.countryCode) return false;
  if (snap.moveDate !== move.moveDate || snap.householdSize !== move.householdSize) return false;
  const scope = item.geographicScope;
  if (scope === "NATIONAL") {
    // National scope must be source-validated, not inferred from a banking task label.
    return snap.nationalValidated === true && snap.originLocation.countryCode === move.originLocation.countryCode && snap.destinationLocation.countryCode === move.destinationLocation.countryCode;
  }
  if (!scope) return false;
  if (scope !== "DESTINATION" && locationKey(snap.originLocation) !== locationKey(move.originLocation)) return false;
  if (scope !== "ORIGIN" && locationKey(snap.destinationLocation) !== locationKey(move.destinationLocation)) return false;
  return true;
}
export async function activity(ctx: MutationCtx, task: Doc<"tasks">, kind: string, message: string) {
  await ctx.db.insert("activity", { eventId: task.eventId, taskId: task._id, kind, message, isDemo: task.isDemo, createdAt: Date.now() });
}
export async function enqueue(ctx: MutationCtx, task: Doc<"tasks">, move: Doc<"lifeEvents">) {
  if (task.isDemo || task.archived || task.status === "COMPLETED" || task.applicability === "NOT_APPLICABLE" || task.status === "NOT_APPLICABLE") return null;
  const question = move.moveType === "UNRESOLVED" ? "Resolve the origin and destination (city, region and country) before research." : !task.provider?.trim() ? providerQuestion(task) : undefined;
  if (question) {
    await ctx.db.patch(task._id, { researchStatus: "NEEDS_INFORMATION", inputQuestion: question, nextAction: question, applicability: "NEEDS_INFORMATION", status: task.status === "FAILED" ? "DISCOVERED" : task.status });
    return null;
  }
  const key = researchKey(task, move);
  const jobs = await ctx.db.query("researchJobs").withIndex("by_researchKey", (q) => q.eq("researchKey", key)).order("desc").take(30);
  const existing = jobs.find(activeJob);
  if (existing) return existing._id;
  const now = Date.now();
  const jobId = await ctx.db.insert("researchJobs", { taskId: task._id, provider: "FIRECRAWL", researchKey: key, contextVersion: move.contextVersion ?? 1, status: "QUEUED", priority: task.priority === "HIGH" ? 0 : task.priority === "MEDIUM" ? 1 : 2, attemptCount: 0, createdAt: now, updatedAt: now });
  await ctx.db.patch(task._id, { status: ["FAILED", "NEEDS_INFORMATION", "RESEARCHING"].includes(task.status) ? "DISCOVERED" : task.status, researchStatus: "QUEUED", inputQuestion: undefined, applicability: "LIKELY_APPLICABLE", contextVersion: move.contextVersion ?? 1, updatedAt: now });
  await activity(ctx, task, "RESEARCH_QUEUED", `Research queued for ${task.title}.`);
  await ctx.scheduler.runAfter(0, internal.researchQueue.dispatch, {});
  return jobId;
}

const legacyCategories: Record<string, string> = { INTERNET: "BROADBAND", BANKING: "FINANCIAL", EMPLOYMENT: "EMPLOYMENT_PAYROLL", MOVING: "MOVING_LOGISTICS", GOVERNMENT: "GOVERNMENT_ADMIN", ADDRESS: "ADDRESS_CHANGE", TRANSPORT: "TRANSPORT_VEHICLE", SUBSCRIPTIONS: "SUBSCRIPTIONS_SERVICES", DOCUMENTS: "IMPORTANT_DOCUMENTS", FAMILY: "FAMILY_CHILD" };
function identity(task: Doc<"tasks">): string {
  if (/school.*healthcare|healthcare.*school/i.test(task.title)) return "LEGACY_COMBINED";
  if (/travel documents/i.test(task.title)) return "TRAVEL_DOCUMENTS";
  if (/cross.border finance/i.test(task.title)) return "CROSS_BORDER_FINANCE";
  if (/water|gas/i.test(task.title)) return "WATER_GAS_UTILITIES";
  if (task.category === "UTILITIES") return /destination/i.test(task.title) ? "DESTINATION_UTILITIES" : "ELECTRICITY";
  return legacyCategories[task.category] ?? task.category;
}

// Also used for explicit repair of persisted Phase 1/partial Phase 2 moves.
export async function reconcile(ctx: MutationCtx, eventId: Id<"lifeEvents">) {
  const original = await ctx.db.get(eventId);
  if (!original || original.isDemo) return;
  const originLocation = normalizeLocation(original.origin), destinationLocation = normalizeLocation(original.destination);
  const move = { ...original, originLocation, destinationLocation, moveType: classifyMove(originLocation, destinationLocation), contextVersion: original.contextVersion ?? 1 };
  await ctx.db.patch(eventId, { originLocation, destinationLocation, moveType: move.moveType, contextVersion: move.contextVersion, baselineVersion: 2, title: `${originLocation.canonicalCity} → ${destinationLocation.canonicalCity}` });
  const tasks = await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(201);
  if (tasks.length > 200) throw new Error("Move requires paginated repair; too many tasks.");
  const used = new Set<string>();
  for (const spec of definitions(move)) {
    const matches = tasks.filter((t) => !t.archived && identity(t) === spec.category);
    let task = matches.find((t) => t.dedupeKey === `baseline:${spec.category}`) ?? matches[0];
    const applicable = !spec.child || hasChildren(move.householdSize);
    const data = { ...spec, child: undefined };
    delete data.child;
    const patch = { ...data, dedupeKey: `baseline:${spec.category}`, applicability: applicable ? "LIKELY_APPLICABLE" as const : "NOT_APPLICABLE" as const, contextVersion: move.contextVersion };
    if (!task) {
      const id = await ctx.db.insert("tasks", { ...patch, eventId, status: applicable ? "DISCOVERED" : "NOT_APPLICABLE", researchStatus: "NOT_STARTED", reason: spec.description, nextAction: applicable ? spec.description : "No child reported; review if household context changes.", requiresApproval: false, isDemo: false, createdAt: Date.now(), updatedAt: Date.now() });
      task = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(task._id, { ...patch, status: !applicable ? "NOT_APPLICABLE" : ["FAILED", "NEEDS_INFORMATION", "NOT_APPLICABLE", "RESEARCHING"].includes(task.status) ? "DISCOVERED" : task.status });
      task = (await ctx.db.get(task._id))!;
    }
    used.add(task._id);
    const evidence = await ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task!._id)).order("desc").take(200);
    let verified = false;
    for (const item of evidence) {
      if (evidenceApplies(item, move, task)) verified = true;
      else if (!item.activeStatus || item.activeStatus === "ACTIVE") await ctx.db.patch(item._id, { activeStatus: "STALE", staleReason: "Context or source validation no longer applies; retained for audit." });
    }
    const jobs = await ctx.db.query("researchJobs").withIndex("by_taskId", (q) => q.eq("taskId", task!._id)).order("desc").take(200);
    let kept = false;
    for (const job of jobs) if (activeJob(job)) {
      if (!kept && job.researchKey === researchKey(task, move)) kept = true;
      else await ctx.db.patch(job._id, { status: "FAILED", error: "Superseded context or duplicate legacy job.", updatedAt: Date.now() });
    }
    if (verified) await ctx.db.patch(task._id, { researchStatus: "VERIFIED", inputQuestion: undefined });
    else await enqueue(ctx, task, move);
  }
  for (const task of tasks) {
    // Preserve provider-reply follow-up operations; retire only baseline/discovery duplicates.
    if (used.has(task._id) || task.archived || /^(presence-|cancel-old-service|check-termination-fee|find-destination-provider)/.test(task.dedupeKey)) continue;
    await ctx.db.patch(task._id, { archived: true, nextAction: "Superseded by the complete domain checklist; retained in history." });
    for (const item of await ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(200)) await ctx.db.patch(item._id, { activeStatus: "SUPERSEDED", staleReason: "Legacy duplicate task superseded." });
    for (const job of await ctx.db.query("researchJobs").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(200)) if (activeJob(job)) await ctx.db.patch(job._id, { status: "FAILED", error: "Task superseded.", updatedAt: Date.now() });
  }
}
