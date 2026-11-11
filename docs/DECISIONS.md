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
- krok 9 (layout): R-SD-01, R-SD-02, R-O2-02, R-VAP-03, R-ACC-01, R-ACC-02, R-FIL-01, R-SIG-01 (upraveno ve fázi 3: krok 3 je koncept a vyžaduje jen vyplněné rozměry, viz ADR-028)
- krok 4: R-O2-01, R-O2-03, R-MAT-01, R-VAP-01, R-PSV-01, R-PSV-02, R-CTL-01, R-CTL-02, R-CTL-03, R-MON-01

## ADR-011 Politika `npm audit`
CI blokuje každou zranitelnost od úrovně moderate v runtime závislostech a od úrovně high ve všech závislostech. K 2026-11-11 jsou známé dvě moderate zranitelnosti, obě jen ve vývojových nástrojích (esbuild v `drizzle-kit`, minimatch v `typescript-eslint`); oprava vyžaduje downgrade. Nejsou součástí produkčního bundle, sledujeme je přes Dependabot.

## ADR-012 Databázový driver
`postgres` (postgres.js) přes `drizzle-orm/postgres-js`. Funguje lokálně i s Neonem (TCP, `prepare: false`).

## ADR-013 UI komponenty
Komponenty ve stylu shadcn/ui jsou psané ručně v `components/ui` (CLI shadcn potřebuje přístup k registru). Závislosti: `class-variance-authority`, `clsx`, `tailwind-merge`. Radix primitiva se přidají, až budou potřeba (dialog, select).

## ADR-014 Odepřený přístup
Stránky bez oprávnění přesměrují na `/forbidden` a pokus zalogují. Experimentální `forbidden()` z Next.js nepoužíváme. Server actions vrací chybu `forbidden` a pokus také logují.

## ADR-015 Deklarativní gate a funkce z pozdějších fází
Gate podmínky jsou data šablony (`documentLinks`, `manualCheck`, `allTasksDone`, `ownerAssigned`, `decisionRecorded`, `layoutVersion`, `pendingFeature`), vyhodnocuje je čistá funkce `evaluateGate`. Podmínky, jejichž funkce vznikne později (dotazník: fáze 2, pravidla a standardy: fáze 3, sizing: fáze 4), mají typ `pendingFeature` a jsou **vždy nesplněné**. Kroky 3, 5, 7, 8 a 9 proto do příslušné fáze nejde uzavřít. Je to záměrně nejbezpečnější varianta.

## ADR-016 Oprávnění na úrovni kroku
Na kroku pracují (zahájit, předat k revizi, blokovat, úkoly, odkazy, layout, rozhodnutí) jeho vlastnické role ze šablony a OAM. Gate přijímá, krok vrací a znovu otevírá jen OAM (SPEC §2). Ruční potvrzení v gate smí udělat jen role uvedená u podmínky (např. ROC u kroku 4, Process Safety u kroku 5). Admin spravuje uživatele, šablony a pravidla, ale procesní akce nedělá. Uzavřený krok je zmrazený. Znovuotevření vyžaduje důvod a nemaže auditní stopu; navazující uzavřené kroky se automaticky neotevírají (otevřená otázka 18).

## ADR-017 Logování zamítnutých přechodů
Přechod probíhá v transakci se zámkem řádku kroku. Zamítnutý pokus (neprošlá gate, otevřené závislosti, chybějící důvod) se zapisuje do audit logu **mimo** transakci, aby záznam přežil. Úspěšné uzavření ukládá snapshot výsledků gate.

## ADR-018 Kroky navíc a závislosti
Vypnuté kroky (a kroky neplatné pro médium, např. C1 u N₂) se v závislostech ignorují. Zapnuté kroky se do grafu řadí takto: H1 po 4 a 9, C1 po 4, P1 po 9; krok 10 čeká na zapnuté H1, C1 a P1; F1 následuje po 10 a O1 po 10 a F1. Kroky navíc lze přepnout jen ve stavu NEZAHÁJENO.

## ADR-019 Odkazy na dokumenty
Ukládají se jen odkazy s protokolem `https` (validace na serveru). Odkaz mimo `*.sharepoint.com` se uloží, ale v UI je označen „není SharePoint“. Gate počítá odkazy připojené ke konkrétnímu kroku.

## ADR-020 Ochrana přihlašovacího formuláře
Formulář má `method="post"`, aby se při nenačteném JavaScriptu přihlašovací údaje nikdy neodeslaly v URL.

## ADR-021 Jednotky
Ukládá se SI hodnota spolu se zadanou hodnotou a jednotkou (`Quantity`). Základ pro normální objemový průtok je Nm³/s. Přetlak a absolutní tlak jsou **oddělené veličiny** a knihovna mezi nimi nepřevádí, protože k tomu je potřeba atmosférický tlak lokality. Knihovna obsahuje jen definiční konstanty (psi, °F, h…), žádné inženýrské hodnoty. Definice „normálních podmínek“ zůstává otevřenou otázkou 11.

## ADR-022 Dotazník a DesignBasis
Šablona dotazníku je verzovaná JSON, odpovědi jsou vázané na verzi šablony. Ukládá se po sekcích a změní se jen odeslané otázky. Prázdná hodnota odpověď maže. Odpovědi na skryté (podmíněné) otázky zůstávají uložené, ale nezapočítávají se do úplnosti a nejdou do DesignBasis. DesignBasis se materializuje při každém uložení (tabulka `design_basis`) a u každé položky drží zdrojovou otázku. Audit log ukládá změněné hodnoty před a po (ve v1 jde o fiktivní data, viz otevřená otázka 22).

## ADR-023 Změna šablony procesu v1
Gate kroku 7 se změnila z `pendingFeature` na `questionnaireComplete` přímo ve verzi 1 šablony, protože zatím neexistují nasazená data. Každá další změna šablony po nasazení zvýší verzi; běžící projekty zůstanou na své verzi (otevřená otázka 23).

## ADR-024 Sémantika vyhodnocení pravidel
Logika je tříhodnotová (Kleene: T / F / U). Chybějící **parametr** dává vždy NEVYHODNOCENO, protože neověřená hodnota nesmí produkovat verdikt. Chybějící **vstup** dává NEVYHODNOCENO, pokud výsledek nerozhodnou ostatní vstupy (např. `OR(žádné chladicí věže, vzdálenost ≥ limit)`). `exists` u chybějícího vstupu vrací U. Výsledek je GO, jen když je podmínka prokazatelně splněna.

## ADR-025 Uložení a verzování pravidel
`data/rules/*.json` je startovní katalog. `npm run db:sync-rules` (součást `db:seed`) vkládá dvojice (id, verze), které v DB ještě nejsou, a existující verze nikdy nemění. Úpravy v UI (parametry, citace) vytvářejí novou verzi ve stavu DRAFT; ověření se nepřenáší. VERIFIED nastavuje jen Process Safety, a to jen u nejnovější verze, se všemi parametry vyplněnými pro všechna platná média a s citací bez TBD-VERIFY. Hodnoty parametrů jsou per médium (O₂ / N₂) jako `Quantity` (SI hodnota + zadaná jednotka).

## ADR-026 Vstupy pravidel
Jmenné prostory: `db.*` (DesignBasis z dotazníku), `layout.*` (geometrie nejnovější verze layoutu), `design.*` (návrhový checklist P&ID), `sizing.*` a `calc.*` (fáze 4). Geometrie se ukládá k verzi layoutu (`layout_versions.geometry`) a edituje se v kroku 3 (v0) nebo 9 (vN). Checklist vyplňují OAM, OPS, ROC, Process Safety a Sizing a po uzavření kroku 4 se zmrazí. Formuláře používají stejný formát šablon jako dotazník.

## ADR-027 Override a snapshoty
Override NO-GO smí jen Process Safety, s povinným zdůvodněním (min. 10 znaků). Je vázaný na verzi pravidla a na SHA-256 otisk vstupů a parametrů: když se cokoli, na čem výsledek závisí, změní, override přestane platit a NO-GO znovu blokuje. Override jde zrušit s důvodem. Vše je v audit logu. Snapshot uloží výsledky všech platných pravidel včetně vstupů, parametrů, verzí a informace o overridech (tabulka `rule_evaluations`).

## ADR-028 Gate napojené na pravidla
- Krok 3: všechny povinné rozměry layoutu v0 vyplněny (`layoutGeometryComplete`).
- Kroky 4, 8, 9: pravidla mapovaná na krok nemají blokující NO-GO **a ani NEVYHODNOCENO** (`rulesNoNoGo`). NEVYHODNOCENO blokuje, protože jinak by chybějící parametr gate propustil. WARNING neblokuje (otevřená otázka 25).
- Krok 5: všechny standardy a pravidla platné pro médium projektu jsou VERIFIED a seznam standardů není prázdný (`standardsVerified`).

## ADR-029 Standardy
Seznam standardů je společný pro všechny projekty a u každého je uvedeno, pro které médium platí. Kandidáti jsou ze SPEC §7.3. Ověření vyžaduje vyplněnou revizi; každá úprava vrací standard do stavu DRAFT.
