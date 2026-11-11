"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useSubmit } from "./use-submit";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { ActionMessage } from "./action-message";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Generic form bound to a server action with pending state and result message. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  variant,
  size = "sm",
  successText,
  resetOnSuccess = true,
  testId,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  successText?: string;
  resetOnSuccess?: boolean;
  testId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = useSubmit(formAction);
  return (
    <form ref={ref} onSubmit={onSubmit} method="post" className={cn("space-y-2", className)} data-testid={testId}>
      {children}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {submitLabel}
      </Button>
      <ActionMessage state={state} successText={successText} />
    </form>
  );
}
