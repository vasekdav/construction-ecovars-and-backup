# Changelog

## Fáze 0: Základ (2026-11-11)
- Kostra Next.js 16 (App Router, TS strict), Tailwind 4, UI komponenty ve stylu shadcn, next-intl (`cs` výchozí, `en` připraveno).
- Postgres + Drizzle ORM, SQL migrace v `db/migrations`, migrační a seed skript.
- Přihlášení (Auth.js Credentials), hesla přes scrypt, sessions 8 h, rate limit přihlášení.
- RBAC jako datová matice oprávnění (`lib/auth/rbac.ts`), vynucovaná na serveru ve stránkách i server actions.
- Append-only audit log (DB trigger), logování změn uživatelů, přihlášení a zamítnutých pokusů.
- Správa uživatelů pro admina (založení, role, aktivace, nastavení hesla), stránka audit logu.
- Bezpečnostní HTTP hlavičky (CSP, X-Frame-Options, HSTS, …), ochrana proti open redirectu, rate limit API.
- Demo seed: 7 fiktivních účtů (jeden na roli).
- Testy: 40 unit a integračních (Vitest, včetně Postgres), 6 e2e (Playwright).
- CI (GitHub Actions): lint, typecheck, migrace, testy s pokrytím, `npm audit`, build, e2e. Dependabot pro npm a Actions.
