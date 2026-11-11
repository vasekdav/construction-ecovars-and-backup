"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { useSubmit } from "@/components/use-submit";
import { ActionMessage as SharedActionMessage } from "@/components/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { ROLES, type Role } from "@/lib/auth/roles";
import { createUserAction, setPasswordAction, updateUserAction } from "./actions";

function ActionMessage({ state }: { state: ActionState }) {
  const t = useTranslations("users");
  return <SharedActionMessage state={state} successText={state?.ok ? t(state.message as "created") : undefined} />;
}

function RoleCheckboxes({ selected, idPrefix }: { selected: readonly Role[]; idPrefix: string }) {
  const tRoles = useTranslations("roles");
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 text-sm" htmlFor={`${idPrefix}-${r}`}>
          <input id={`${idPrefix}-${r}`} type="checkbox" name="roles" value={r} defaultChecked={selected.includes(r)} />
          {tRoles(r)}
        </label>
      ))}
    </div>
  );
}

export function CreateUserForm() {
  const t = useTranslations("users");
  const [state, action, pending] = useActionState(createUserAction, null);
  const onSubmit = useSubmit(action);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} onSubmit={onSubmit} method="post" className="grid gap-4 md:grid-cols-2" data-testid="create-user-form">
      <div className="space-y-2">
        <Label htmlFor="new-email">{t("email")}</Label>
        <Input id="new-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-name">{t("name")}</Label>
        <Input id="new-name" name="name" required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">{t("password")}</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">{t("passwordHint", { min: MIN_PASSWORD_LENGTH })}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("roles")}</legend>
        <RoleCheckboxes selected={[]} idPrefix="new-role" />
      </fieldset>
      <div className="space-y-2 md:col-span-2">
        <ActionMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("create")}
        </Button>
      </div>
    </form>
  );
}

export function EditUserForm({ userId, roles, active }: { userId: string; roles: Role[]; active: boolean }) {
  const t = useTranslations("users");
  const [state, action, pending] = useActionState(updateUserAction, null);
  const onSubmit = useSubmit(action);
  return (
    <form onSubmit={onSubmit} method="post" className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <RoleCheckboxes selected={roles} idPrefix={`edit-${userId}`} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={active} />
        {t("active")}
      </label>
      <ActionMessage state={state} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

export function SetPasswordForm({ userId }: { userId: string }) {
  const t = useTranslations("users");
  const [state, action, pending] = useActionState(setPasswordAction, null);
  const onSubmit = useSubmit(action);
  return (
    <form onSubmit={onSubmit} method="post" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="space-y-1">
        <Label htmlFor={`pw-${userId}`}>{t("newPassword")}</Label>
        <Input
          id={`pw-${userId}`}
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {t("setPassword")}
      </Button>
      <div className="w-full">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
