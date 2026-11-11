import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max: opts.max ?? 5, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

const globalForDb = globalThis as unknown as { __hubDb?: Db };

/** Process-wide DB instance for the Next.js server. */
export async function getDb(): Promise<Db> {
  if (!globalForDb.__hubDb) {
    const { serverEnv } = await import("../lib/env");
    globalForDb.__hubDb = createDb(serverEnv().DATABASE_URL, { max: 10 }).db;
  }
  return globalForDb.__hubDb;
}
