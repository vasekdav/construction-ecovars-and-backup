import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { ROLES } from "@/lib/auth/roles";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(200);

export const rolesSchema = z.array(z.enum(ROLES)).max(ROLES.length);

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  password: passwordSchema,
  roles: rolesSchema,
});

export const updateUserSchema = z.object({
  userId: z.uuid(),
  roles: rolesSchema,
  active: z.boolean(),
});

export const setPasswordSchema = z.object({
  userId: z.uuid(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
