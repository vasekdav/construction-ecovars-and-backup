import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type Db } from "@/db/client";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasDb = !!TEST_DATABASE_URL;

export async function setupTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const handle = createDb(TEST_DATABASE_URL!, { max: 2 });
  await migrate(handle.db, { migrationsFolder: "db/migrations" });
  return handle;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}
