import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// The internal sweep is intentionally conservative: it only records reminders; it never sends mail.
crons.interval("review pending approvals", { hours: 24 }, internal.reminders.reviewPending, {});
export default crons;
