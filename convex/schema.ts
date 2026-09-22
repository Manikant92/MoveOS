import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taskStatus = v.union(
  v.literal("DISCOVERED"), v.literal("RESEARCHING"), v.literal("READY_FOR_APPROVAL"),
  v.literal("APPROVED"), v.literal("IN_PROGRESS"), v.literal("WAITING"),
  v.literal("REPLIED"), v.literal("BLOCKED"), v.literal("COMPLETED"),
  v.literal("NOT_APPLICABLE"), v.literal("NEEDS_INFORMATION"), v.literal("FAILED"),
);
const researchStatus = v.union(
  v.literal("NOT_STARTED"), v.literal("QUEUED"), v.literal("SEARCHING"), v.literal("VALIDATING"),
  v.literal("VERIFIED"), v.literal("PARTIALLY_VERIFIED"), v.literal("NEEDS_INFORMATION"),
  v.literal("NEEDS_VERIFICATION"), v.literal("RATE_LIMITED"), v.literal("RETRY_SCHEDULED"), v.literal("RESEARCH_INCOMPLETE"),
);

const location = v.object({
  city: v.string(), canonicalCity: v.string(), stateOrProvince: v.optional(v.string()),
  country: v.optional(v.string()), countryCode: v.optional(v.string()),
});

export default defineSchema({
  lifeEvents: defineTable({
    type: v.literal("MOVE"), title: v.string(), origin: v.string(), destination: v.string(),
    moveDate: v.string(), householdSize: v.string(), notes: v.optional(v.string()),
    originLocation: v.optional(location), destinationLocation: v.optional(location),
    moveType: v.optional(v.union(v.literal("DOMESTIC"), v.literal("INTERNATIONAL"), v.literal("UNRESOLVED"))),
    contextVersion: v.optional(v.number()), housingConfirmed: v.optional(v.boolean()), baselineVersion: v.optional(v.number()),
    status: v.union(v.literal("ACTIVE"), v.literal("COMPLETED"), v.literal("ARCHIVED")),
    isDemo: v.boolean(), demoKey: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_demoKey", ["demoKey"]),
  entities: defineTable({
    eventId: v.id("lifeEvents"), name: v.string(), category: v.string(), website: v.optional(v.string()),
    contact: v.optional(v.string()), source: v.union(v.literal("DISCOVERY"), v.literal("USER"), v.literal("RESEARCH")),
    status: v.union(v.literal("CANDIDATE"), v.literal("RESEARCHED"), v.literal("ACTIVE")),
  }).index("by_eventId", ["eventId"]),
  tasks: defineTable({
    eventId: v.id("lifeEvents"), entityId: v.optional(v.id("entities")), title: v.string(), description: v.string(),
    category: v.string(), status: taskStatus, priority: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW")),
    dueDate: v.optional(v.string()), reason: v.string(), nextAction: v.string(), requiresApproval: v.boolean(),
    draftSubject: v.optional(v.string()), draftBody: v.optional(v.string()), recipient: v.optional(v.string()),
    dedupeKey: v.string(), isDemo: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
    geographicScope: v.optional(v.union(v.literal("ORIGIN"), v.literal("DESTINATION"), v.literal("BOTH"), v.literal("NATIONAL"), v.literal("INTERNATIONAL"))),
    provider: v.optional(v.string()), inputQuestion: v.optional(v.string()), contextVersion: v.optional(v.number()), archived: v.optional(v.boolean()),
    researchStatus: v.optional(researchStatus), applicability: v.optional(v.union(v.literal("LIKELY_APPLICABLE"), v.literal("CONFIRMED_APPLICABLE"), v.literal("MAY_APPLY"), v.literal("NOT_APPLICABLE"), v.literal("NEEDS_INFORMATION"))),
  }).index("by_eventId", ["eventId"]).index("by_eventId_and_status", ["eventId", "status"])
    .index("by_eventId_and_dedupeKey", ["eventId", "dedupeKey"]),
  dependencies: defineTable({
    eventId: v.id("lifeEvents"), sourceTaskId: v.id("tasks"), targetTaskId: v.id("tasks"),
    relationship: v.string(), condition: v.string(), status: v.union(v.literal("ACTIVE"), v.literal("SATISFIED"), v.literal("BLOCKED")),
  }).index("by_eventId", ["eventId"]).index("by_sourceTaskId", ["sourceTaskId"]),
  evidence: defineTable({
    taskId: v.id("tasks"), sourceUrl: v.string(), sourceTitle: v.string(), excerpt: v.string(),
    sourceType: v.union(v.literal("OFFICIAL"), v.literal("DEMO")), retrievedAt: v.number(),
    extractedRequirement: v.string(), confidence: v.number(), isDemo: v.boolean(),
    authority: v.optional(v.union(v.literal("GOVERNMENT"), v.literal("REGULATOR"), v.literal("OFFICIAL_PROVIDER"), v.literal("AUTHORITATIVE"), v.literal("SECONDARY"))),
    geographicRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))),
    applicableLocation: v.optional(v.string()), needsVerification: v.optional(v.boolean()), contextVersion: v.optional(v.number()),
    taskRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))),
    userRoleRelevance: v.optional(v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("NONE"))),
    validationReasons: v.optional(v.array(v.string())), geographicScope: v.optional(v.union(v.literal("ORIGIN"), v.literal("DESTINATION"), v.literal("BOTH"), v.literal("NATIONAL"), v.literal("INTERNATIONAL"))),
    activeStatus: v.optional(v.union(v.literal("ACTIVE"), v.literal("STALE"), v.literal("SUPERSEDED"))), staleReason: v.optional(v.string()), contextSnapshot: v.optional(v.any()),
  }).index("by_taskId", ["taskId"]),
  communications: defineTable({
    taskId: v.id("tasks"), agentMailThreadId: v.optional(v.string()), agentMailMessageId: v.optional(v.string()),
    direction: v.union(v.literal("OUTBOUND"), v.literal("INBOUND")), sender: v.optional(v.string()), recipient: v.optional(v.string()),
    subject: v.string(), body: v.string(), status: v.union(v.literal("DRAFT"), v.literal("SENDING"), v.literal("SENT"), v.literal("RECEIVED"), v.literal("FAILED"), v.literal("SIMULATED")),
    externalEventId: v.optional(v.string()), isDemo: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_taskId", ["taskId"]).index("by_agentMailThreadId", ["agentMailThreadId"])
    .index("by_externalEventId", ["externalEventId"]),
  approvals: defineTable({
    taskId: v.id("tasks"), action: v.string(), proposedContent: v.string(),
    status: v.union(v.literal("PENDING"), v.literal("APPROVED"), v.literal("REJECTED"), v.literal("EXECUTED"), v.literal("FAILED")),
    requestId: v.string(), approvedAt: v.optional(v.number()), rejectedAt: v.optional(v.number()), createdAt: v.number(),
  }).index("by_taskId", ["taskId"]).index("by_requestId", ["requestId"]),
  activity: defineTable({
    eventId: v.id("lifeEvents"), taskId: v.optional(v.id("tasks")), kind: v.string(), message: v.string(),
    isDemo: v.boolean(), createdAt: v.number(),
  }).index("by_eventId", ["eventId"]).index("by_eventId_and_createdAt", ["eventId", "createdAt"]),
  researchJobs: defineTable({
    taskId: v.id("tasks"), status: v.union(v.literal("QUEUED"), v.literal("RUNNING"), v.literal("COMPLETED"), v.literal("FAILED"), v.literal("RETRY_SCHEDULED")),
    provider: v.literal("FIRECRAWL"), error: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(), contextVersion: v.optional(v.number()), attemptCount: v.optional(v.number()), nextRetryAt: v.optional(v.number()),
    researchKey: v.optional(v.string()), priority: v.optional(v.number()), leaseUntil: v.optional(v.number()),
  }).index("by_taskId", ["taskId"]).index("by_status", ["status"]).index("by_researchKey", ["researchKey"]).index("by_status_and_priority", ["status", "priority"]),
  webhookEvents: defineTable({ eventId: v.string(), receivedAt: v.number() }).index("by_eventId", ["eventId"]),
  impactEvents: defineTable({ eventId: v.id("lifeEvents"), triggerType: v.string(), triggerDescription: v.string(), previousContext: v.any(), newContext: v.any(), status: v.union(v.literal("RUNNING"), v.literal("COMPLETED")), createdAt: v.number() }).index("by_eventId", ["eventId"]),
  impacts: defineTable({ impactEventId: v.id("impactEvents"), eventId: v.id("lifeEvents"), taskId: v.optional(v.id("tasks")), impactType: v.string(), previousValue: v.optional(v.string()), proposedValue: v.optional(v.string()), reason: v.string(), approvalRequired: v.boolean(), status: v.union(v.literal("OPEN"), v.literal("APPLIED"), v.literal("DISMISSED")), createdAt: v.number() }).index("by_impactEventId", ["impactEventId"]).index("by_eventId", ["eventId"]),
});
