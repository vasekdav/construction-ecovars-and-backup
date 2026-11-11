import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Db } from "@/db/client";
import standardsJson from "@/data/standards/candidates.json";
import { loadCalcConfigFile } from "@/lib/calc/config-file";
import { syncCalcConfigs } from "@/lib/calc/config-service";
import { loadRuleFiles } from "@/lib/rules/catalog";
import { syncRules } from "@/lib/safety/rules-service";
import { syncStandards, type StandardCandidate } from "@/lib/safety/standards-service";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!TEST_DATABASE_URL;

export async function setupTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const handle = createDb(TEST_DATABASE_URL!, { max: 2 });
  await migrate(handle.db, { migrationsFolder: "db/migrations" });
  // Reference data (idempotent): rules, standards, calculation config – all DRAFT, no values.
  await syncRules(handle.db, loadRuleFiles());
  await syncStandards(handle.db, standardsJson.standards as StandardCandidate[]);
  await syncCalcConfigs(handle.db, [loadCalcConfigFile()]);
  return handle;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}
