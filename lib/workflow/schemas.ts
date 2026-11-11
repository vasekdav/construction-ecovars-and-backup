import { z } from "zod";
import { MEDIA } from "./template";
import { DECISION_OUTCOMES, TRANSITIONS } from "./types";

/** Only https links (SharePoint); files are never uploaded (SPEC §4). */
export const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .pipe(z.url())
  .refine((u) => new URL(u).protocol === "https:", { message: "https_only" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const isoDate = z.iso.date();
const optionalDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  customer: z.string().trim().min(1).max(160),
  location: z.string().trim().min(1).max(160),
  medium: z.enum(MEDIA),
  ownerUserId: optionalUuid,
});

export const transitionSchema = z.object({
  stageId: z.uuid(),
  transition: z.enum(TRANSITIONS),
  reason: optionalText(1000),
});

export const stageSettingsSchema = z.object({
  stageId: z.uuid(),
  dueDate: optionalDate,
  ownerUserId: optionalUuid,
});

export const stageEnabledSchema = z.object({ stageId: z.uuid(), enabled: z.boolean() });

export const addTaskSchema = z.object({
  stageId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  assigneeUserId: optionalUuid,
  dueDate: optionalDate,
});

export const setTaskDoneSchema = z.object({ taskId: z.uuid(), done: z.boolean() });

export const addDocumentLinkSchema = z.object({
  stageId: z.uuid(),
  kind: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(200),
  url: httpsUrl,
  version: optionalText(60),
  documentDate: optionalDate,
  author: optionalText(120),
});

export const removeDocumentLinkSchema = z.object({ linkId: z.uuid() });

export const confirmCheckSchema = z.object({
  stageId: z.uuid(),
  checkId: z.string().min(1).max(64),
  confirmed: z.boolean(),
});

export const addCommentSchema = z.object({ stageId: z.uuid(), body: z.string().trim().min(1).max(4000) });

export const recordDecisionSchema = z.object({
  stageId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  outcome: z.enum(DECISION_OUTCOMES),
  rationale: z.string().trim().min(1).max(4000),
});

export const addLayoutVersionSchema = z.object({
  stageId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  drawingUrl: httpsUrl.nullable().optional().transform((v) => v ?? null),
});

export function isSharePointUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "sharepoint.com" || host.endsWith(".sharepoint.com");
  } catch {
    return false;
  }
}
