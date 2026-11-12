import { z } from "zod";
import { authMode } from "./auth/mode";

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters").optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AUTH_MODE: z.string().optional(),
  })
  // The secret signs sessions, so it is required only when there are sessions (ADR-039).
  .refine((env) => authMode(env) === "open" || !!env.NEXTAUTH_SECRET, {
    path: ["NEXTAUTH_SECRET"],
    message: "NEXTAUTH_SECRET is required when AUTH_MODE=password",
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Validated server env. Lazy so that importing modules never crashes a build. */
export function serverEnv(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}

/** Validates an env object; an empty variable counts as unset. Exported for tests. */
export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return parsed.data;
}
