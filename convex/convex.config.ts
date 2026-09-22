import { defineApp } from "convex/server";
import migrations from "@convex-dev/migrations/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";
const app = defineApp();
app.use(migrations);
// Keep existing root HTTP routes (including AgentMail) and mount static hosting in the catch-all.
app.use(staticHosting);
export default app;
