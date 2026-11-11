"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ label }: { label: string }) {
  return (
    <button type="button" className="underline-offset-2 hover:underline" onClick={() => signOut({ callbackUrl: "/login" })}>
      {label}
    </button>
  );
}
