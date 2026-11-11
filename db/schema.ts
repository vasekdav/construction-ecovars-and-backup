import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ROLES } from "../lib/auth/roles";
import { MEDIA } from "../lib/workflow/template";
import { DECISION_OUTCOMES, PROJECT_STATUSES, STAGE_STATES } from "../lib/workflow/types";

export const roleEnum = pgEnum("role", ROLES);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lower-case. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("role_assignments_user_role_uq").on(t.userId, t.role)],
);

/**
 * Append-only audit log (SPEC §2, §10). UPDATE, DELETE and TRUNCATE are
 * rejected by a database trigger (migration 0001_audit_log_append_only).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** null = system action (e.g. failed login of an unknown account, seed). */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    /** Project scope of the entry (null for global entries such as user management). */
    projectId: uuid("project_id"),
  },
  (t) => [
    index("audit_log_project_idx").on(t.projectId, t.occurredAt),
    index("audit_log_occurred_at_idx").on(t.occurredAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const mediumEnum = pgEnum("medium", MEDIA);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const stageStateEnum = pgEnum("stage_state", STAGE_STATES);
export const decisionOutcomeEnum = pgEnum("decision_outcome", DECISION_OUTCOMES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  customer: text("customer").notNull(),
  location: text("location").notNull(),
  medium: mediumEnum("medium").notNull(),
  status: projectStatusEnum("status").notNull().default("ACTIVE"),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  templateKey: text("template_key").notNull(),
  templateVersion: integer("template_version").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable(
  "stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Template stage key: "1".."10" or optional step code ("H1", ...). */
    key: text("key").notNull(),
    sortOrder: integer("sort_order").notNull(),
    enabled: boolean("enabled").notNull(),
    state: stageStateEnum("state").notNull().default("NOT_STARTED"),
    blockedFrom: stageStateEnum("blocked_from"),
    blockedReason: text("blocked_reason"),
    /** Responsible person for the step (e.g. maintenance owner of step 6). */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    /** Manual gate confirmations: { [checkId]: { by: userId, at: ISO } } */
    manualChecks: jsonb("manual_checks").$type<Record<string, { by: string; at: string }>>().notNull().default({}),
    gatePassedAt: timestamp("gate_passed_at", { withTimezone: true }),
    gatePassedBy: uuid("gate_passed_by").references(() => users.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stages_project_key_uq").on(t.projectId, t.key)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_stage_idx").on(t.stageId)],
);

/** Links to SharePoint documents. Files are never stored (SPEC §4). */
export const documentLinks = pgTable(
  "document_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id").references(() => stages.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    version: text("version"),
    documentDate: date("document_date"),
    author: text("author"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [index("document_links_project_idx").on(t.projectId), index("document_links_stage_idx").on(t.stageId)],
);

export const stageComments = pgTable(
  "stage_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("stage_comments_stage_idx").on(t.stageId)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    outcome: decisionOutcomeEnum("outcome").notNull(),
    rationale: text("rationale").notNull(),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: createdAt(),
  },
  (t) => [index("decisions_stage_idx").on(t.stageId)],
);

/** Steps 3 (concept, v0) and 9 (final, v1..vN) are versions of one layout (SPEC §3). */
export const layoutVersions = pgTable(
  "layout_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    label: text("label").notNull(),
    drawingUrl: text("drawing_url"),
    /** Geometric inputs for rule checks (phase 3). */
    geometry: jsonb("geometry"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("layout_versions_project_version_uq").on(t.projectId, t.version)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Stage = typeof stages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type DocumentLink = typeof documentLinks.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type LayoutVersion = typeof layoutVersions.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
