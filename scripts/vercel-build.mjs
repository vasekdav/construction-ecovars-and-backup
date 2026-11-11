// Build command on Vercel (vercel.json → buildCommand).
// Prepares the database on every deployment, then builds the app:
//   1. migrations (idempotent),
//   2. import of rules, standards and calculation config (DRAFT, no values; idempotent),
//   3. fictitious demo users + demo project, only when SEED_DEMO_PASSWORD is set (idempotent).
import { execSync } from "node:child_process";

const run = (cmd, extraEnv = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });

if (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED) {
  run("npm run db:migrate");
  run("npm run db:sync-rules");
  if (process.env.SEED_DEMO_PASSWORD) {
    // Demo seed is blocked in production unless explicitly allowed; on Vercel it is opted in
    // by setting SEED_DEMO_PASSWORD. Remove that variable to stop seeding.
    run("npm run db:seed", { ALLOW_DEMO_SEED: "true" });
  } else {
    console.log("SEED_DEMO_PASSWORD not set – skipping demo users.");
  }
} else {
  console.warn("DATABASE_URL is not set – skipping database preparation. Connect a database in Vercel → Storage.");
}

run("npm run build");
