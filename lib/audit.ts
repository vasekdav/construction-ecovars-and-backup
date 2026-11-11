import { desc } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { auditLog } from "@/db/schema";

export interface AuditEntryInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  projectId?: string | null;
}

/** Append one audit entry. Call inside the same transaction as the change. */
export async function writeAudit(db: DbOrTx, entry: AuditEntryInput): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    projectId: entry.projectId ?? null,
  });
}

export async function listAudit(db: DbOrTx, limit = 200) {
  return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
}
