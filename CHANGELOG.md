# Changelog

## Fáze 2: Dotazník + DesignBasis (2026-11-11)
- `lib/units`: centrální převody jednotek (průtok v Nm³, přetlak a absolutní tlak jako oddělené veličiny, teplota, délka, plocha, objem, čas, hmotnost, podíl). Ukládá se SI hodnota spolu se zadanou hodnotou a jednotkou. Pokrytí testy 100 %.
- Zákaznický dotazník jako verzovaná JSON šablona (`data/questionnaire/default.json`): 10 sekcí podle SPEC §5, povinné i volitelné položky, dvě fáze (počáteční / detailní požadavky), podmíněné zobrazení podle média (N₂: uzavřené prostory, O₂: hořlaviny) i podle jiné odpovědi.
- Odpovědi jsou vázané na verzi šablony. Ukládá se průběžně po sekcích (rozpracovaný stav), validuje se na serveru (čísla s desetinnou čárkou, jednotky, nezápornost, rozsahy) a chyby se zobrazují u pole.
- Úplnost v % zvlášť pro počáteční požadavky a pro celý dotazník, včetně přehledu po sekcích. Na detailní fázi lze přejít až po úplných počátečních požadavcích.
- DesignBasis se z odpovědí znovu sestaví při každém uložení: SI hodnoty, zadaná jednotka a zdrojová otázka. Má vlastní stránku.
- Gate kroku 7 je napojená na dotazník: vyžaduje detailní fázi a všechny povinné položky. Po uzavření kroku 7 je dotazník zmrazený. Dotazník vyplňuje jen OAM, ostatní role ho vidí jen pro čtení.
- Demo projekt má částečně vyplněné počáteční požadavky.
- Testy: 162 unit a integračních, 10 e2e.

## Fáze 1: Workflow (2026-11-11)
- Šablona procesu jako data (`data/process/default.json`): kroky 1–10 s nezměněným číslováním, Definition of Done, vlastníci, gate podmínky, typy dokumentů a schválený graf závislostí `1 → 2 → {4, 5, 7} → 8 → {3, 9} → 6 → 10`. Validace šablony (unikátnost, reference, cykly).
- Doporučené kroky navíc H1 (HAZID/HAZOP), C1 (O₂ cleaning, jen O₂), P1 (povolení), F1 (FAT/SAT), O1 (OPS handover): v šabloně, výchozí stav vypnuto, zapíná OAM.
- Stavový automat kroku (NEZAHÁJENO → ROZPRACOVÁNO → K REVIZI → UZAVŘENO, BLOKOVÁNO s povinným důvodem, odblokování do předchozího stavu, znovuotevření s důvodem).
- Deklarativní gate: odkazy na dokumenty (s verzí / datem), ruční potvrzení rolí, úkoly uzavřeny, odpovědná osoba, rozhodnutí se zdůvodněním, verze layoutu. Podmínky z pozdějších fází (dotazník, pravidla, sizing) se do té doby tváří jako nesplněné.
- Krok nelze uzavřít bez splněné gate a uzavřených předchozích kroků. Každý zamítnutý pokus se loguje (`stage.close_rejected`), úspěšné uzavření ukládá snapshot vyhodnocení gate.
- RBAC na úrovni kroků: vlastník kroku a OAM pracují na kroku, gate přijímá, vrací a znovu otevírá jen OAM, uzavřený krok je zmrazený.
- Projekty (zakládá OAM), kroky, úkoly a připomínky, odkazy na SharePoint (jen https, nikdy soubory; jiný host je označen), komentáře, rozhodnutí (krok 10), verze layoutu v0 (krok 3) a v1…vN (krok 9), nastavení kroku (termín, odpovědná osoba).
- Dashboard projektu: stavová osa (semafor), nejbližší termíny, kdo na koho čeká, přehled kroků, kroky navíc. Detail kroku: gate s odškrtnutím, akce, úkoly, dokumenty, layout, rozhodnutí, nastavení, komentáře, historie z audit logu.
- Demo projekt „Demo Zákazník, LOX 20 m³“ v seedu (krok 1 uzavřen, krok 2 rozpracován), vytvořený přes běžné služby, takže je auditovaný.
- Opravy: přihlašovací formulář při nenačteném JS už neodešle heslo v URL (`method="post"`); `vercel.json` s presetem Next.js.
- Testy: 94 unit a integračních (pokrytí čisté logiky workflow ≥ 90 %), 8 e2e.

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
