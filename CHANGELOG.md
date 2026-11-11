# Changelog

## Nasazení na Vercel (2026-11-11)
- Build na Vercelu (`scripts/vercel-build.mjs`) sám připraví databázi: migrace (se zámkem proti souběžným buildům, přes přímé připojení Neonu), import pravidel, standardů a parametrů výpočtu a volitelně demo účty (`SEED_DEMO_PASSWORD`). Vše je opakovatelné.
- Na Vercelu stačí připojit Neon a nastavit `NEXTAUTH_SECRET` (a volitelně `SEED_DEMO_PASSWORD`); `NEXTAUTH_URL` není potřeba.
- Oprava: smyčka přesměrování po přihlášení, když uživatel nejdřív otevřel hlavní adresu (klientský router použil uložené přesměrování na `/login`). Po přihlášení se teď stránka načte celá znovu. Přidán e2e test.
- Middleware určuje název cookie session podle protokolu požadavku, aby odpovídal tomu, jak ji nastavil NextAuth.

## Fáze 6 (část): Geometrie ze souřadnic + posouzení WARNING (2026-11-11)
- **Plán v souřadnicích** u každé verze layoutu: objekty plot planu (tank, vaporizer, budovy, veřejné komunikace, hranice pozemku, zdroje zapálení, jímky, chladicí věže) jako body, lomené čáry nebo uzavřené tvary v místních souřadnicích [m].
- Vzdálenosti pro R-SD-01, R-SD-02 a R-VAP-03 se počítají **od hrany k hraně** (nejkratší vzdálenost obrysů, překryv = 0). Spočtená hodnota má přednost před ruční a ve formuláři je zamčená („z plánu“). Typ objektu, který v plánu chybí, se nedopočítá. Stanice mimo hranici pozemku dává vzdálenost k hranici 0.
- Editor plánu a náhled v SVG se zakreslenými nejkratšími vzdálenostmi v kroku 3 (v0) a 9 (vN); uložení plánu je v audit logu.
- **Posouzení WARNING** (otevřená otázka 25): WARNING blokuje uzavření kroku, dokud ho Process Safety nebo OAM neposoudí s komentářem. Posouzení je vázané na verzi pravidla a otisk vstupů (při změně přestane platit) a lze ho zrušit. Zobrazuje se v Safety Review i v exportu, neplatná posouzení jsou uvedena spolu s neplatnými overridy.
- Oprava: název listu XLSX nesmí mít víc než 31 znaků (Excel).
- Testy: 321 unit a integračních, 16 e2e.

## Fáze 5: Export (2026-11-11)
- Export „Design Basis & Safety Review“ ve formátech **PDF**, **Markdown** a **XLSX** (tabulka pravidel na samostatném listu). Všechny tři formáty vycházejí z jednoho společného modelu reportu, takže mají stejný obsah.
- Obsah: verze aplikace (a commit, je-li k dispozici), ID exportu, datum, jméno exportujícího, banner „Podpora rozhodování…“, upozornění na fiktivní data, projekt, stav kroků a kdo přijal gate, stav dotazníku, Design Basis (zadaná hodnota, SI, zdroj), výsledek sizingu se zdrojem, autonomie s předpoklady a stavem konfigurace, výsledky všech pravidel s verzí, stavem DRAFT/VERIFIED, zdrojem, podmínkou, vstupy, parametry (TBD-VERIFY) a otiskem vstupů, standardy.
- **Overridy jsou červeně** a rozlišené na „platí“, „neplatí (změnila se verze pravidla nebo vstupy)“ a „zrušen“. Neplatné overridy nově zobrazuje i Safety Review.
- Stahování: `/projects/{id}/export/{pdf|md|xlsx}` s autorizací na serveru, rate limitem, `Cache-Control: no-store` a záznamem `export.generate` do audit logu (formát, verze pravidel a výsledky). Odkazy jsou na dashboardu a v Safety Review.
- PDF používá přibalený font DejaVu Sans (čeština, O₂/N₂) a nedělí slova, aby se do identifikátorů a otisků nevkládaly pomlčky.
- Nové závislosti `@react-pdf/renderer` a `exceljs` (předepsané v SPEC §9). Zranitelná tranzitivní závislost `uuid` v exceljs je přes `overrides` povýšena na opravenou verzi, runtime závislosti mají 0 zranitelností.
- Oprava buildu: načítání konfigurace ze souboru (jen pro seed) bylo v importním grafu aplikace a způsobovalo varování a zbytečné trasování souborů.
- Testy: 306 unit a integračních, 15 e2e.

## Fáze 4: Autonomie + import sizingu (2026-11-11)
- `lib/calc/autonomy`: výpočet podle SPEC §6 (využitelný objem → expansion_ratio = ρ_liq / ρ_gas,normal → objem plynu → autonomie). Konzervativní varianta s Q_peak (pro R-CAP-01) a informativní s Q_avg. Hodnoty mimo fyzikální rozsah se odmítnou a chybějící hodnota dává NEVYHODNOCENO. Pokrytí 100 %.
- Parametry výpočtu (`fill_max`, `heel_fraction`, `rho_liquid`, `rho_gas_normal`, definice normálních podmínek, zdroj) jsou konfigurace bez výchozích hodnot (`data/calc/autonomy.json`). Verzují se jako pravidla (úprava = nová verze DRAFT) a VERIFIED nastavuje jen Process Safety. Krok 5 vyžaduje, aby byly VERIFIED.
- SizingResult: neměnné verze s povinnými vstupy (V_tank, návrhový průtok, min. teplota, námraza), výsledkem (kapacita po námraze, typ a počet modulů) a zdrojem (soubor, revize, autor, datum, volitelně https odkaz). Zadává Sizing responsible; po uzavření kroku 8 je zmrazený.
- Pravidla R-VAP-02, R-CAP-01 a R-ENV-01 dostávají vstupy ze sizingu a z výpočtu autonomie. Gate kroku 8 vyžaduje uložený výsledek sizingu. V šabloně procesu už nezbývá žádná podmínka „funkce z pozdější fáze“.
- Stránka „Sizing a autonomie“ (banner, výsledek, výpočet krok po kroku, předpoklady, štítek DRAFT, aktuální výsledek a historie verzí) a správa parametrů výpočtu.
- Oprava: formuláře si po validační chybě ponechají zadané hodnoty. React 19 je při odeslání přes `action` resetoval a uživatel by přišel o vyplněná data; týkalo se to dotazníku, checklistu, sizingu, pravidel i správy uživatelů.
- Oprava (bezpečnost): gate „pravidla bez NO-GO“ prošla, když v DB nebyla žádná pravidla (prázdný katalog, např. bez `db:sync-rules`). Teď v takovém případě neprojde (`no_rules`). Chybu odhalilo CI na čisté databázi.
- Testovací setup importuje referenční data (pravidla, standardy, konfiguraci výpočtu) v každém souboru, takže výsledek nezávisí na pořadí testů.
- Nový typ otázky `url` (jen https) a jednotka hustoty.
- Testy: 294 unit a integračních, 13 e2e.

## Fáze 3: Rule engine + Safety Review (2026-11-11)
- `lib/rules`: čistý TS rule engine. Podmínky jsou data (AST validovaný přes Zod), vyhodnocení probíhá v tříhodnotové logice. Chybějící parametr dává vždy NEVYHODNOCENO, chybějící vstup NEVYHODNOCENO, pokud výsledek nerozhodnou jiné vstupy. Výsledek nikdy není GO, když něco chybí.
- 21 startovních pravidel (`data/rules/*.json`) s plnou definicí podle SPEC §7.1: stav DRAFT, parametry bez hodnot (TBD-VERIFY), zdroj podle SPEC (kde SPEC normu výslovně neuvádí, je označena jako „kandidát“), kapitola TBD-VERIFY. Seznam lze rozšiřovat bez změny kódu (`npm run db:sync-rules`).
- Pro každé pravidlo testy GO, NO-GO/WARNING a NEVYHODNOCENO. Pokrytí `lib/rules` 97–100 %.
- Vstupy pravidel: DesignBasis (dotazník), geometrie layoutu (k verzi layoutu, pravidla používají nejnovější verzi), návrhový checklist P&ID. Sizing a autonomie přijdou ve fázi 4.
- Pravidla v DB s verzemi: každá úprava parametrů nebo citace vytvoří novou verzi DRAFT. VERIFIED nastavuje jen Process Safety, a to po doplnění všech parametrů a citace. Parametry mají hodnotu zvlášť pro O₂ a N₂ a jednotku.
- Standardy (krok 5): kandidáti ze SPEC §7.3, ověření vyžaduje revizi, úprava vrací do stavu DRAFT.
- Safety Review: banner „Podpora rozhodování…“, souhrn a filtr podle výsledku, detail s použitými vstupy, parametry (TBD-VERIFY), podmínkou, zdrojem a verzí, štítek DRAFT, doporučená náprava.
- Override NO-GO jen pro Process Safety, s povinným zdůvodněním. Je vázaný na verzi pravidla a otisk vstupů a parametrů, takže při změně vstupů přestane platit. Lze ho zrušit. Vše jde do audit logu.
- Snapshoty vyhodnocení (RuleEvaluation) pro reprodukovatelnost.
- Gate: krok 3 vyžaduje kompletní rozměry layoutu v0; kroky 4, 8 a 9 vyžadují vyhodnocená pravidla bez NO-GO (NEVYHODNOCENO také blokuje); krok 5 vyžaduje, aby všechny standardy a pravidla použitá v projektu byly VERIFIED.
- Dashboard: počty NO-GO / WARNING / NEVYHODNOCENO a banner. Detail kroku s pravidlovou gate má banner a formulář geometrie layoutu. Nové stránky Pravidla a Standardy.
- Testy: 282 unit a integračních, 12 e2e.

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
