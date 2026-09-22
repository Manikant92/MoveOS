// Explicit live acceptance only; not run by npm test. Creates two local moves.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
assert.match(env, /VITE_CONVEX_URL\s*=\s*["']?http:\/\/127\.0\.0\.1:3210/, "Acceptance is restricted to the existing local deployment");
function run(name, args = {}) {
  const output = execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", name, JSON.stringify(args)], { encoding: "utf8", timeout: 30000, windowsHide: true }).trim();
  return output ? JSON.parse(output) : null;
}
const existing = run("operations:listMoves").filter((m) => !m.isDemo);
console.log("REPAIRED", JSON.stringify(existing.map((m) => {
  const d = run("operations:getDashboard", { eventId: m._id });
  assert.equal(d.move.baselineVersion, 2);
  assert.equal(d.tasks.length, d.move.moveType === "INTERNATIONAL" ? 23 : 17);
  return { id: m._id, moveType: d.move.moveType, tasks: d.tasks.length, activeEvidence: d.evidence.length, historicalEvidence: d.historicalEvidence.length };
})));
const created = [];
for (const [destination, moveDate, expected] of [["Pune", "2026-10-10", 17], ["London, England, United Kingdom", "2026-10-26", 23]]) {
  const eventId = existing.find((m) => m.notes === "Fresh Phase 2 local acceptance test" && m.destination === destination && m.contextVersion === 1)?._id ?? run("operations:createMove", { origin: "Hyderabad, Telangana, India", destination, moveDate, householdSize: "2 adults + 1 child", notes: "Fresh Phase 2 local acceptance test" });
  const d = run("operations:getDashboard", { eventId });
  assert.equal(d.tasks.length, expected);
  assert.equal(d.move.moveType, expected === 17 ? "DOMESTIC" : "INTERNATIONAL");
  assert.equal(d.verified, new Set(d.evidence.filter((e) => !e.isDemo).map((e) => e.taskId)).size);
  assert.ok(!d.evidence.some((e) => /bengaluru|bangalore/i.test(e.applicableLocation ?? "")));
  const beforeVersion = d.move.contextVersion;
  run("operations:updateMove", { eventId, moveDate });
  const unchanged = run("operations:getDashboard", { eventId });
  assert.equal(unchanged.move.contextVersion, beforeVersion);
  assert.equal(unchanged.impactEvents.length, 0);
  const queue = run("researchQueue:inspect", { eventId });
  assert.equal(queue.duplicateActiveKeys.length, 0);
  assert.ok(queue.jobs.length >= expected - 2);
  if (expected === 17) {
    for (const [city, count] of [["Bengaluru", 1], ["Pune", 2]]) {
      run("operations:updateMove", { eventId, destination: city });
      const changed = run("operations:getDashboard", { eventId });
      assert.equal(changed.impactEvents.length, count);
      assert.equal(changed.move.contextVersion, beforeVersion + count);
      assert.equal(run("researchQueue:inspect", { eventId }).duplicateActiveKeys.length, 0);
    }
  }
  const summary = { eventId, moveType: d.move.moveType, origin: d.move.originLocation, destination: d.move.destinationLocation, domains: d.coverage.domains, tasks: d.tasks.map((t) => t.title), autoJobs: queue.jobs.length, needsInformation: d.tasks.filter((t) => t.researchStatus === "NEEDS_INFORMATION").length, noOpPassed: true, duplicateActiveKeys: queue.duplicateActiveKeys };
  created.push(summary); console.log("FRESH", JSON.stringify(summary));
}
console.log("ACCEPTANCE_PASSED", JSON.stringify(created.map(({ eventId }) => eventId)));
