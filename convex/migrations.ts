import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import schema from "./schema";
import { reconcile } from "./researchModel";

const migrations = new Migrations(components.migrations, { schema });
export const repairPhase2 = migrations.define({
  table: "lifeEvents", batchSize: 1,
  migrateOne: async (ctx, move) => {
    if (!move.isDemo && move.status === "ACTIVE" && move.baselineVersion !== 2) await reconcile(ctx, move._id);
  },
});
