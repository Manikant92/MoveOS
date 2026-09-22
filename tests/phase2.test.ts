import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { normalizeLocation, classifyMove } from "../convex/location";
import { baseline } from "../convex/researchModel";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const fresh = () => convexTest({ schema, modules });
const input = (destination = "Pune") => ({ origin: "Hyderabad, Telangana, India", destination, moveDate: destination === "Pune" ? "2026-10-10" : "2026-10-26", householdSize: "2 adults + 1 child" });
async function create(t: ReturnType<typeof fresh>, destination = "Pune") {
  const eventId = await t.mutation(api.operations.createMove, input(destination));
  return { eventId, dashboard: await t.query(api.operations.getDashboard, { eventId }) };
}
async function drain(t: ReturnType<typeof fresh>, eventId: any) {
  for (let i = 0; i < 500; i++) {
    await vi.advanceTimersByTimeAsync(1000);
    await t.finishInProgressScheduledFunctions();
    if ((await t.query(internal.researchQueue.inspect, { eventId })).activeCount === 0) return;
  }
  throw new Error("Queue failed to drain");
}
async function evidence(t: ReturnType<typeof fresh>, d: any, category: string, scope: "NATIONAL" | "DESTINATION" = "DESTINATION", overrides: any = {}) {
  const task = d.tasks.find((t: any) => t.category === category);
  return t.run((ctx) => ctx.db.insert("evidence", {
    taskId: task._id, sourceUrl: "https://www.gov.in/requirements", sourceTitle: "Official requirements", excerpt: "Official guidance", sourceType: "OFFICIAL", retrievedAt: Date.now(), extractedRequirement: "Provide a current address to update the record.", confidence: .9, isDemo: false,
    authority: "GOVERNMENT", geographicRelevance: "HIGH", taskRelevance: "HIGH", userRoleRelevance: "HIGH", needsVerification: false, activeStatus: "ACTIVE", contextVersion: d.move.contextVersion, geographicScope: scope,
    contextSnapshot: { taskId: task._id, taskCategory: category, provider: task.provider ?? "", originLocation: d.move.originLocation, destinationLocation: d.move.destinationLocation, moveDate: d.move.moveDate, householdSize: d.move.householdSize, nationalValidated: scope === "NATIONAL" }, ...overrides,
  }));
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T10:00:00Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Phase 2 acceptance", () => {
  it("Pune resolution accepts qualified cities and refuses conflicting geography", () => {
    const pune = normalizeLocation(" Pune, Maharashtra, India ");
    expect(pune).toEqual({ city: "Pune", canonicalCity: "Pune", stateOrProvince: "Maharashtra", country: "India", countryCode: "IN" });
    expect(classifyMove(normalizeLocation(input().origin), pune)).toBe("DOMESTIC");
    expect(normalizeLocation("London, Ontario, Canada").countryCode).toBeUndefined();
  });
  it("Domestic baseline exists in the creation transaction before any API", async () => {
    const t = fresh(), { dashboard: d } = await create(t);
    expect(d.move.moveType).toBe("DOMESTIC");
    expect(d.coverage.domains).toEqual(baseline.map((b) => b.category));
    expect(d.tasks).toHaveLength(17);
    expect(d.evidence).toHaveLength(0); expect(d.verified).toBe(0);
  });
  it("Child-specific education is considered and follows household changes", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    expect(d.tasks.find((t: any) => t.category === "EDUCATION").status).not.toBe("NOT_APPLICABLE");
    await t.mutation(api.operations.updateMove, { eventId, householdSize: "2 adults + 0 children" });
    const next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.tasks.find((t: any) => t.category === "EDUCATION").status).toBe("NOT_APPLICABLE");
  });
  it("Healthcare is separate from education, with independent task identities", async () => {
    const { dashboard: d } = await create(fresh());
    const relevant = d.tasks.filter((t: any) => ["EDUCATION", "HEALTHCARE"].includes(t.category));
    expect(relevant).toHaveLength(2); expect(relevant[0]._id).not.toBe(relevant[1]._id);
    expect(d.tasks.some((t: any) => /school.*healthcare/i.test(t.title))).toBe(false);
  });
  it("Stale evidence is invalidated in storage and in queries, in both directions", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    const id = await evidence(t, d, "HOUSING");
    await t.mutation(api.operations.updateMove, { eventId, destination: "Bengaluru" });
    let next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.evidence).toHaveLength(0); expect(next.impactEvents).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(id)))?.activeStatus).toBe("STALE");
    const bengaluru = await evidence(t, next, "HOUSING", "DESTINATION", { applicableLocation: "Bengaluru, Karnataka" });
    await t.mutation(api.operations.updateMove, { eventId, destination: "Pune" });
    next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.evidence).toHaveLength(0); expect(next.impactEvents).toHaveLength(2);
    expect((await t.run((ctx) => ctx.db.get(bengaluru)))?.activeStatus).toBe("STALE");
    expect((await t.query(internal.researchQueue.inspect, { eventId })).duplicateActiveKeys).toEqual([]);
  });
  it("Verified count excludes unvalidated, stale, superseded and legacy evidence", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    await evidence(t, d, "HOUSING");
    for (const overrides of [{ activeStatus: "STALE" }, { activeStatus: "SUPERSEDED" }, { needsVerification: true }, { userRoleRelevance: "NONE" }, { contextSnapshot: {} }]) await evidence(t, d, "HEALTHCARE", "DESTINATION", overrides);
    const next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.evidence).toHaveLength(1); expect(next.verified).toBe(1); expect(next.historicalEvidence).toHaveLength(5);
  });
  it("National evidence survives domestic city changes, not country changes", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    const id = await evidence(t, d, "FINANCIAL", "NATIONAL");
    for (const destination of ["Bengaluru", "Pune"]) {
      await t.mutation(api.operations.updateMove, { eventId, destination });
      expect((await t.query(api.operations.getDashboard, { eventId })).verified).toBe(1);
      expect((await t.run((ctx) => ctx.db.get(id)))?.activeStatus).toBe("ACTIVE");
    }
    await t.mutation(api.operations.updateMove, { eventId, destination: "London" });
    expect((await t.query(api.operations.getDashboard, { eventId })).verified).toBe(0);
  });
  it("No-op date and canonical geography updates perform zero writes", async () => {
    const t = fresh(), { eventId } = await create(t);
    const before = await t.query(api.operations.getDashboard, { eventId });
    const jobs = await t.query(internal.researchQueue.inspect, { eventId });
    await t.mutation(api.operations.updateMove, { eventId, moveDate: "2026-10-10", origin: "Hyderabad", destination: "Pune, Maharashtra, India" });
    expect(await t.query(api.operations.getDashboard, { eventId })).toEqual(before);
    expect(await t.query(internal.researchQueue.inspect, { eventId })).toEqual(jobs);
  });
  it("Research-job deduplication returns one active job under repeated requests", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    const taskId = d.tasks.find((t: any) => t.category === "ELECTRICITY")._id;
    await Promise.all(Array.from({ length: 8 }, () => t.mutation(api.operations.requestResearch, { taskId })));
    const state = await t.query(internal.researchQueue.inspect, { eventId });
    expect(state.duplicateActiveKeys).toEqual([]);
    expect(state.jobs.filter((job: any) => job.taskId === taskId)).toHaveLength(1);
    await Promise.all([t.mutation(internal.researchQueue.dispatch, {}), t.mutation(internal.researchQueue.dispatch, {})]);
    expect((await t.query(internal.researchQueue.inspect, { eventId })).jobs.filter((j: any) => j.status === "RUNNING")).toHaveLength(1);
  });
  it("Needs-information blocks only required context and supplying it auto-queues", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    const questions = d.tasks.filter((t: any) => t.researchStatus === "NEEDS_INFORMATION");
    expect(questions.map((t: any) => t.category).sort()).toEqual(["BROADBAND", "INSURANCE"]);
    const taskId = questions[0]._id;
    await expect(t.mutation(api.operations.provideTaskInfo, { taskId, provider: " " })).rejects.toThrow();
    await t.mutation(api.operations.provideTaskInfo, { taskId, provider: "Airtel" });
    expect((await t.query(api.operations.getDashboard, { eventId })).tasks.find((t: any) => t._id === taskId).researchStatus).toBe("QUEUED");
    const unresolved = await create(t, "Unresolved City");
    expect((await t.query(internal.researchQueue.inspect, { eventId: unresolved.eventId })).activeCount).toBe(0);
  });
  it("Automatic queue progresses without clicks when Firecrawl fails", async () => {
    const t = fresh(), { eventId } = await create(t);
    vi.stubEnv("FIRECRAWL_API_KEY", "test-only");
    const fetch = vi.fn().mockResolvedValue(new Response("unavailable", { status: 400 })); vi.stubGlobal("fetch", fetch);
    await drain(t, eventId);
    expect(fetch).toHaveBeenCalledTimes(15);
    const d = await t.query(api.operations.getDashboard, { eventId });
    expect(d.tasks.filter((t: any) => t.researchStatus === "RESEARCH_INCOMPLETE")).toHaveLength(15);
    expect(d.tasks.some((t: any) => t.status === "FAILED")).toBe(false);
  });
  it("London international baseline is complete before research", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t, "London, England, United Kingdom");
    expect(d.move.moveType).toBe("INTERNATIONAL"); expect(d.tasks).toHaveLength(23);
    expect(new Set(d.tasks.map((t: any) => t.dedupeKey)).size).toBe(23);
    expect((await t.query(internal.researchQueue.inspect, { eventId })).activeCount).toBe(21);
  });
  it("Legacy repair normalizes persisted moves and retires combined/duplicate tasks", async () => {
    const t = fresh();
    const eventId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("lifeEvents", { type: "MOVE", title: "Old move", ...input(), moveType: "UNRESOLVED", status: "ACTIVE", isDemo: false, createdAt: 1, updatedAt: 1 });
      for (const title of ["School and healthcare — records transition", "Destination healthcare", "Healthcare continuity"]) await ctx.db.insert("tasks", { eventId: id, title, description: title, category: title.startsWith("School") ? "FAMILY" : "HEALTHCARE", status: "FAILED", priority: "HIGH", reason: "Legacy", nextAction: "Retry", requiresApproval: false, dedupeKey: title, isDemo: false, createdAt: 1, updatedAt: 1 });
      return id;
    });
    await t.mutation(internal.operations.repairMove, { eventId });
    await t.mutation(internal.operations.repairMove, { eventId });
    const d = await t.query(api.operations.getDashboard, { eventId });
    expect(d.move.moveType).toBe("DOMESTIC"); expect(d.tasks).toHaveLength(17);
    expect(d.tasks.filter((t: any) => t.category === "HEALTHCARE")).toHaveLength(1);
    expect(d.tasks.some((t: any) => /school.*healthcare/i.test(t.title))).toBe(false);
    expect((await t.query(internal.researchQueue.inspect, { eventId })).duplicateActiveKeys).toEqual([]);
  });
  it("Housing role relevance excludes and revalidates old landlord-only evidence", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t, "London, England, United Kingdom");
    const id = await evidence(t, d, "HOUSING", "DESTINATION", { sourceTitle: "Renting out your property: Tenancy types - GOV.UK", sourceUrl: "https://www.gov.uk/renting-out-a-property/tenancy-types" });
    expect((await t.query(api.operations.getDashboard, { eventId })).verified).toBe(0);
    await t.mutation(internal.operations.repairMove, { eventId });
    expect((await t.run((ctx) => ctx.db.get(id)))?.activeStatus).toBe("STALE");
  });
  it.each(["Pune", "London, England, United Kingdom"])("Firecrawl 429 resilience and retries: %s", async (destination) => {
    const t = fresh(), { eventId, dashboard: d } = await create(t, destination);
    vi.stubEnv("FIRECRAWL_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    await drain(t, eventId);
    const next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.tasks).toHaveLength(d.tasks.length); expect(next.tasks.every((t: any) => t.status !== "FAILED")).toBe(true);
    const state = await t.query(internal.researchQueue.inspect, { eventId });
    expect(state.jobs.every((job: any) => job.attemptCount === 3)).toBe(true); expect(state.activeCount).toBe(0);
  });
  it("Late worker cannot publish evidence after destination changes", async () => {
    const t = fresh(), { eventId } = await create(t);
    await t.mutation(internal.researchQueue.dispatch, {});
    const job = (await t.query(internal.researchQueue.inspect, { eventId })).jobs.find((j: any) => j.status === "RUNNING");
    await t.mutation(api.operations.updateMove, { eventId, destination: "Bengaluru" });
    await t.mutation(internal.operations.saveResearch, { taskId: job.taskId, jobId: job._id, attempt: job.attemptCount, sourceUrl: "https://www.gov.in", sourceTitle: "Stale research", excerpt: "Pune", requirement: "Old requirement", confidence: .9 });
    expect((await t.query(api.operations.getDashboard, { eventId })).evidence).toHaveLength(0);
  });
  it("A real worker response parser saves tenant evidence and rejects a landlord candidate", async () => {
    const t = fresh(), { eventId } = await create(t, "London, England, United Kingdom");
    vi.stubEnv("FIRECRAWL_API_KEY", "test-only"); vi.stubEnv("OPENAI_API_KEY", "test-only");
    const extracted = { applicable: true, geographicRelevance: "HIGH", taskRelevance: "HIGH", userRoleRelevance: "HIGH", applicableLocation: "London, England, United Kingdom", requirement: "Check the tenancy agreement before signing.", confidence: .9, needsVerification: false, validationReasons: ["Tenant guidance"], sourceScope: "DESTINATION", nationalValidated: false };
    const fetch = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes("firecrawl") ? { data: { web: [
      { url: "https://www.gov.uk/renting-out-a-property/tenancy-types", title: "Renting out your property", markdown: "Landlord guidance" },
      { url: "https://www.gov.uk/private-renting", title: "Private renting", markdown: "Tenant guidance in England" },
    ] } } : { output: [{ content: [{ type: "output_text", text: JSON.stringify(extracted) }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await t.mutation(internal.researchQueue.dispatch, {});
    const job = (await t.query(internal.researchQueue.inspect, { eventId })).jobs.find((j: any) => j.status === "RUNNING");
    await t.action(internal.integrations.researchTask, { taskId: job.taskId, jobId: job._id, attempt: job.attemptCount });
    const next = await t.query(api.operations.getDashboard, { eventId });
    expect(next.verified).toBe(1); expect(next.evidence[0].sourceTitle).toBe("Private renting");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("Stale evidence cannot authorize an external action", async () => {
    const t = fresh(), { eventId, dashboard: d } = await create(t);
    const taskId = d.tasks.find((t: any) => t.category === "HOUSING")._id;
    await evidence(t, d, "HOUSING", "DESTINATION", { activeStatus: "STALE" });
    const approvalId = await t.run((ctx) => ctx.db.insert("approvals", { taskId, action: "Contact provider", proposedContent: "Please confirm requirements", status: "PENDING", requestId: "test-approval", createdAt: Date.now() }));
    await expect(t.mutation(api.operations.approve, { approvalId })).rejects.toThrow("Current verified evidence");
    expect((await t.query(internal.operations.getDispatch, { taskId, approvalId })).evidenceValid).toBe(false);
  });
});
