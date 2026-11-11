import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** Arbitrary constant key for the migration advisory lock. */
const MIGRATION_LOCK = 727_274_001;

async function main() {
  // Neon on Vercel: prefer the direct (unpooled) connection for DDL and session locks.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, close } = createDb(url, { max: 1 });
  try {
    // Serialise concurrent deployments (e.g. production and preview builds at the same time).
    await db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK})`);
    await migrate(db, { migrationsFolder: "db/migrations" });
    console.log("Migrations applied.");
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK})`).catch(() => undefined);
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
