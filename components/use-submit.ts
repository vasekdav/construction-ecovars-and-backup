"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submit handler for forms bound to `useActionState`. Using `onSubmit` instead
 * of the `action` prop keeps the user's input after a validation error
 * (React 19 resets uncontrolled inputs after every form action).
 */
export function useSubmit(formAction: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };
}
