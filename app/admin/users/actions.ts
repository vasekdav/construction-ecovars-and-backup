"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { guardedAction, type ActionState } from "@/lib/actions";
import { createUserSchema, setPasswordSchema, updateUserSchema } from "@/lib/users/schemas";
import { createUser, setUserPassword, updateUser } from "@/lib/users/service";

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction("user.manage", async (actor) => {
    const input = createUserSchema.parse({
      email: formData.get("email"),
      name: formData.get("name"),
      password: formData.get("password"),
      roles: formData.getAll("roles"),
    });
    await createUser(await getDb(), actor, input);
    revalidatePath("/admin/users");
    return { ok: true, message: "created" };
  });
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction("user.manage", async (actor) => {
    const input = updateUserSchema.parse({
      userId: formData.get("userId"),
      roles: formData.getAll("roles"),
      active: formData.get("active") === "on",
    });
    await updateUser(await getDb(), actor, input);
    revalidatePath("/admin/users");
    return { ok: true, message: "saved" };
  });
}

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction("user.manage", async (actor) => {
    const input = setPasswordSchema.parse({
      userId: formData.get("userId"),
      password: formData.get("password"),
    });
    await setUserPassword(await getDb(), actor, input);
    return { ok: true, message: "passwordSet" };
  });
}
