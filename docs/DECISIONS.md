# Architektonická rozhodnutí (ADR)

Krátký formát: kontext → rozhodnutí → důsledky.

## ADR-001 Verze stacku
Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript **5.9** (ne 7.x: nativní kompilátor zatím nemá ověřenou kompatibilitu s Next/ESLint toolingem), ESLint **9** (`eslint-config-next` 16), Tailwind 4, Zod 4, Drizzle ORM 0.45, Vitest 5, Playwright 1.63. Verze jsou v `package.json` zafixované přesně.

## ADR-002 Autentizace
Auth.js ve stabilní řadě **NextAuth v4** (v5 je stále beta), provider Credentials, JWT session na 8 h. Účty zakládá admin, žádná registrace ani e-mailová služba. Hesla: `scrypt` z Node (N=2^15, r=8, p=3, OWASP), bez balíčku bcrypt. Role a stav účtu se při každém požadavku čtou z DB, takže deaktivace i změna rolí platí okamžitě. Fáze 6: Entra ID SSO.

## ADR-003 Nasazení
Vercel + Neon zatím nejsou připojeny. Fáze končí zeleným CI (GitHub Actions s Postgres 16) a lokálním během. Pro nasazení stačí nastavit `DATABASE_URL`, `NEXTAUTH_SECRET` a `NEXTAUTH_URL` a spustit `npm run db:migrate`.

## ADR-004 Append-only audit log
Tabulka `audit_log` má DB trigger, který odmítne `UPDATE`, `DELETE` i `TRUNCATE` (migrace `0001`). Záznam se zapisuje ve stejné transakci jako změna. Zamítnuté pokusy o přístup se logují jako `security.forbidden`, přihlášení jako `auth.login` / `auth.login_failed`. Hesla ani jejich hashe se nelogují.

## ADR-005 Rule engine (fáze 3)
Vlastní malý jazyk výrazů (AST validovaný přes Zod) místo `json-logic-js`: potřebujeme tříhodnotovou logiku (GO / FAIL / NEVYHODNOCENO), kterou knihovna nemá. Chybějící vstup nebo parametr → `NEVYHODNOCENO`, nikdy GO.

## ADR-006 Rate limiting
Fixní okno v paměti procesu (`lib/rate-limit.ts`): přihlášení 10 / 15 min na e-mail + IP, API 300 / min na IP, server actions 120 / min na uživatele. Omezení: na Vercelu má každá instance vlastní čítače. Pro striktní globální limit je potřeba sdílené úložiště (např. Redis).

## ADR-007 Content Security Policy
CSP zatím povoluje `'unsafe-inline'` pro skripty, protože Next.js bez nonce vkládá inline skripty pro hydrataci. Ostatní hlavičky: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`. Plán: nonce-based CSP v `proxy.ts` před nasazením s reálnými daty.

## ADR-008 Šablona procesu
Kroky 1–10 a jejich závislosti (`1 → 2 → {4, 5, 7} → 8 → {3, 9} → 6 → 10`) jsou data šablony. Kroky navíc mají vlastní kódy (`H1`, `C1`, …) a jsou ve výchozím stavu vypnuté. Krok 3 a 9 sdílí objekt `LayoutVersion` (v0 = koncept, vN = finál).

## ADR-009 Expansion ratio
`expansion_ratio = ρ_liq / ρ_gas,normal`. Obě hustoty a definice normálních podmínek jsou konfigurační parametry `TBD-VERIFY` bez výchozí hodnoty. CoolProp (WASM) se ve v1 nepoužívá kvůli velikosti a složitosti nasazení.

## ADR-010 Vazba pravidlo → krok
Pole `stages` v datech pravidla určuje, jehož gate NO-GO blokuje. Výchozí návrh (otevřená otázka 9):
- krok 8: R-CAP-01, R-VAP-02, R-ENV-01
- kroky 3 a 9: R-SD-01, R-SD-02, R-VAP-03, R-ACC-01, R-ACC-02, R-FIL-01, R-SIG-01
- krok 4: R-O2-01, R-O2-02, R-O2-03, R-MAT-01, R-VAP-01, R-PSV-01, R-PSV-02, R-CTL-01, R-CTL-02, R-CTL-03, R-MON-01

## ADR-011 Politika `npm audit`
CI blokuje každou zranitelnost od úrovně moderate v runtime závislostech a od úrovně high ve všech závislostech. K 2026-11-11 jsou známé dvě moderate zranitelnosti, obě jen ve vývojových nástrojích (esbuild v `drizzle-kit`, minimatch v `typescript-eslint`); oprava vyžaduje downgrade. Nejsou součástí produkčního bundle, sledujeme je přes Dependabot.

## ADR-012 Databázový driver
`postgres` (postgres.js) přes `drizzle-orm/postgres-js`. Funguje lokálně i s Neonem (TCP, `prepare: false`).

## ADR-013 UI komponenty
Komponenty ve stylu shadcn/ui jsou psané ručně v `components/ui` (CLI shadcn potřebuje přístup k registru). Závislosti: `class-variance-authority`, `clsx`, `tailwind-merge`. Radix primitiva se přidají, až budou potřeba (dialog, select).

## ADR-014 Odepřený přístup
Stránky bez oprávnění přesměrují na `/forbidden` a pokus zalogují. Experimentální `forbidden()` z Next.js nepoužíváme. Server actions vrací chybu `forbidden` a pokus také logují.
