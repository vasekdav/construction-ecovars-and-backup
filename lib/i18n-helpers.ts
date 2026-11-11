import type { Localized } from "@/lib/workflow/template";

export type AppLocale = "cs" | "en";

export function asLocale(locale: string): AppLocale {
  return locale === "en" ? "en" : "cs";
}

export function loc(text: Localized, locale: AppLocale): string {
  return text[locale];
}
