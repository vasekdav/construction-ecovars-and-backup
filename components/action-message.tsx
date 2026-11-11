"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions";

/** Renders the result of a server action: success text or a translated error. */
export function ActionMessage({ state, successText }: { state: ActionState; successText?: string }) {
  const tErr = useTranslations("errors");
  const tCommon = useTranslations("common");
  if (!state) return null;
  if (state.ok) return successText === "" ? null : <Alert tone="success">{successText ?? tCommon("saved")}</Alert>;
  const key = tErr.has(state.error) ? state.error : "unknown";
  const fields = state.fieldErrors ? Object.keys(state.fieldErrors).filter((k) => state.fieldErrors?.[k]?.length) : [];
  return (
    <Alert tone="error">
      {tErr(key)}
      {fields.length > 0 && <span> ({fields.join(", ")})</span>}
    </Alert>
  );
}
