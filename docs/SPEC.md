# SPEC: Backup Station Project Hub (OAM vs OPS)

> Pracovní název aplikace. Zadání pro Claude Code. Jazyk UI: čeština, anglické technické termíny zůstávají (evaporator, P&ID, plot plan, PSV, MAWP, ...). Kód, názvy proměnných a commity anglicky.

---

## 0. Jak s tímto dokumentem pracovat (instrukce pro Claude Code)

1. Nejdřív si celý dokument přečti a **napiš plán po fázích (sekce 12)**. Do kódu nezačínej, dokud plán neodsouhlasím.
2. Pracuj po fázích. Každá fáze musí končit: zelené testy, funkční preview na Vercelu, krátký changelog.
3. **Bezpečnostní pravidla (sekce 7) jsou data, ne kód.** Žádné číselné limity, vzdálenosti, rychlosti ani součinitele si **nesmíš vymýšlet**. Kde v dokumentu stojí `TBD-VERIFY`, vytvoř konfigurovatelný parametr bez výchozí hodnoty a pravidlo se do doplnění tváří jako `NEVYHODNOCENO`.
4. Před přidáním nové závislosti (npm balíček) napiš proč. Preferuj málo závislostí.
5. Pokud je něco nejasné, zapiš to do `docs/OPEN_QUESTIONS.md` a pokračuj s nejbezpečnějším předpokladem. Neblokuj se.
6. Aplikace je **podpora rozhodování, ne náhrada inženýrského schválení**. Tuto větu musí UI zobrazovat u každého výstupu pravidlové kontroly.

---

## 1. Kontext a cíl

**Doména:** nové záložní stanice kyslíku (O₂) a dusíku (N₂) u zákazníků formou kapalného zásobníku (LOX/LIN) a atmosférického odpařovače (AAE, ambient air evaporator). Realizace probíhá ve spolupráci rolí **OAM** a **OPS** (význam zkratky OAM ponecháváme tak, jak je ve zdrojovém procesu, viz otevřené otázky).

**Problém:** proces má 10 kroků (SharePoint, sběr PID referencí, plot plan, překreslení P&ID, standardy process safety, equipment & cost list, zákaznický checklist, sizing zálohy, layout, technicko-ekonomické úvahy). Dnes je to rozházené v dokumentech a e-mailech, není vidět stav, chybí kontrolní body a bezpečnostní kontroly se dělají ručně a pozdě.

**Cíl v1:** jedna webová aplikace, která
- vede projekt zálohy O₂/N₂ krok za krokem (1 až 10) s **gate** před přechodem dál,
- sbírá vstupy od zákazníka strukturovaným dotazníkem (krok 7),
- spouští **pravidlovou kontrolu GO / WARNING / NO-GO** nad vstupy a návrhem (kroky 5, 8, 9),
- eviduje dokumenty jako **odkazy** na SharePoint (nikoli kopie),
- generuje souhrn „Design Basis & Safety Review" (PDF + Markdown + XLSX).

**Mimo rozsah v1:** vlastní výpočet odpařovače (přebíráme výsledek z existujícího AAE nástroje), kreslení P&ID/layoutu, nahrávání výkresů, parní/elektrické odpařovače, Minigan a PSA zálohy (ty slouží jen jako referenční projekty).

---

## 2. Uživatelé a role

| Role | Co dělá v aplikaci |
|---|---|
| **OAM** | Vlastník projektu. Zakládá projekt, vede zákaznický checklist, přijímá gate. |
| **OPS** | Provozní pohled. Připomínkuje layout, přístupnost armatur, provozní scénáře, přebírá stanici. |
| **Investment team** | Vede a udržuje equipment & cost list (krok 6). |
| **ROC / Třinec kolegové** | Převod papírových P&ID do DWG (krok 4). Potvrzují dodání výkresu. |
| **Process Safety reviewer** | Schvaluje seznam standardů (krok 5), vyhodnocuje WARNING/NO-GO, potvrzuje pravidla jako `VERIFIED`. |
| **Sizing responsible** | Zadává výsledek sizingu zálohy a odpařovače (krok 8). Ve zdrojovém procesu je uveden Jirka Koš. |
| **Admin** | Správa uživatelů, šablon, pravidel. |

RBAC: každá akce (zápis do kroku, změna stavu gate, schválení pravidla) je vázaná na roli. Všechny změny stavu jdou do **audit logu** (kdo, kdy, co, z čeho na co).

---

## 3. Proces a gate (kroky 1 až 10)

Číslování kroků **zachovej beze změny** (uživatelé ho znají). Závislosti mezi kroky jsou konfigurovatelné, výchozí návrh níže.

| # | Krok | Výstup (Definition of Done) | Gate (podmínka k uzavření) | Vlastník |
|---|---|---|---|---|
| 1 | Set up SharePoint | Hlavní site + struktura složek + oprávnění | Odkaz na site vyplněn, potvrzeno že oprávnění odpovídají rolím | OAM |
| 2 | Collect PID references | Složka vstupů; referenční P&ID LOX (Dubí), Minigan (Kladno), PSA (Liberec); standardní CES P&ID | Všechny 4 odkazy vyplněny, každý má verzi a datum | OAM |
| 3 | Plot Plan (fyzické rozmístění) | Plot plan: tank, vaporizery, čerpadla, armatury, potrubí, příjezdové cesty, bezpečné vzdálenosti | Odkaz na výkres + vyplněné rozměry pro kontrolu pravidel (sekce 7) | OPS + projektant |
| 4 | Redraw P&IDs | P&ID v DWG, zapracované všechny připomínky | Všechny připomínky uzavřeny, DWG odkaz, potvrzení ROC/Třinec | ROC / Třinec |
| 5 | Process Safety Standard | Seznam norem a standardů pro O₂ a N₂ zálohy | Reviewer schválil seznam, každá položka má stav `VERIFIED` | Process Safety |
| 6 | Equipment & Cost List | Zdrojový soubor (mechanika, elektro, MaR, project management) s cenami | Odkaz + datum poslední aktualizace, vlastník údržby jmenován | Investment team |
| 7 | Customer Checklist | Vyplněný zákaznický dotazník (počáteční i detailní požadavky) | Všechny povinné položky vyplněny, OAM potvrdil | OAM |
| 8 | Backup Sizing & Layout | Velikost odpařovače podle požadované kapacity zálohy | Vstupy sizingu uloženy, výsledek má zdroj (soubor + revize), kontroly sizingu bez NO-GO | Sizing responsible |
| 9 | Layout (optimalizace) | Layout bez kolizí (zdi, chladicí věže), přístup k armaturám | Kontroly přístupnosti a vzdáleností bez NO-GO | OPS |
| 10 | Further technical & economic considerations | Economizer, trendy spotřeby, parní odpařovače (Ferox, Linde Engineering) | Rozhodnutí zapsáno (ano / ne / odloženo) a zdůvodněno | OAM + Investment |

**Navrhované výchozí závislosti (potvrdit):** 1 → 2 → {4, 5, 7} → 8 → {3, 9} → 6 → 10. Důvod: sizing a plot plan nemá smysl dělat před zákaznickým checklistem a standardy. Krok 3 (plot plan) a krok 9 (optimalizovaný layout) jsou ve skutečnosti **dvě verze téhož objektu** (koncept vs. finální), aplikace je proto vede jako verze layoutu `v0` a `vN`.

**Doporučené kroky navíc (vypnutelné šablonou):** HAZID/HAZOP review před uzavřením návrhu, specifikace O₂ cleaningu, povolovací a legislativní kontrola, FAT/SAT a commissioning, předání do provozu (OPS handover). Nejsou ve zdrojovém procesu, ale chybí-li, bývá to to, co později bolí.

Stavy kroku: `NEZAHÁJENO` → `ROZPRACOVÁNO` → `K REVIZI` → `UZAVŘENO` (nebo `BLOKOVÁNO` s povinným důvodem). Krok nelze uzavřít, dokud neprojde jeho gate.

---

## 4. Datový model (návrh)

- `Project` (id, název, zákazník, lokalita, medium `O2|N2`, status, vlastník)
- `Stage` (project_id, number 1..10, state, owner, gate_passed_at, gate_passed_by)
- `Task` (stage_id, název, assignee, termín, hotovo)
- `DocumentLink` (project_id, stage_id, typ, název, URL na SharePoint, verze, datum, autor). **Nikdy neukládat soubor.**
- `QuestionnaireTemplate` / `QuestionnaireResponse` (krok 7; šablona verzovaná, odpovědi vázané na verzi šablony)
- `DesignBasis` (strukturované vstupy, viz 6)
- `LayoutVersion` (project_id, verze `v0..vN`, geometrické vstupy pro kontroly, odkaz na výkres)
- `SizingResult` (project_id, vstupy, výsledek, **zdroj: název souboru + revize + autor + datum**)
- `Rule` (viz 7), `RuleEvaluation` (project_id, rule_id, verze pravidla, výsledek, snapshot vstupů, čas)
- `Standard` (kód, název, revize, stav `DRAFT|VERIFIED`, kdo a kdy ověřil)
- `Decision` (krok 10 a gate: rozhodnutí + zdůvodnění)
- `AuditLog`, `User`, `RoleAssignment`
- Fáze 2: `EquipmentCostItem`

Všechny veličiny ukládat v **SI jednotkách** s explicitním polem jednotky u vstupu. Převody jednotek centrálně v jedné knihovně s testy.

---

## 5. Zákaznický dotazník (krok 7)

Dotazník je **konfigurovatelná šablona** (JSON), ne zadrátované formuláře. Povinné i volitelné položky, podmíněné zobrazení (např. otázky na N₂ se neukazují u O₂ projektu). Stav „počáteční požadavky" vs. „detailní požadavky" (dvě fáze téhož dotazníku).

Výchozí sekce (doplň a uprav s OAM):

1. **Medium a čistota:** O₂ nebo N₂, požadovaná čistota, typ aplikace.
2. **Spotřeba:** Q_avg, Q_peak (Nm³/h), profil odběru, kritičnost dodávky (co se stane při výpadku).
3. **Doba autonomie:** požadovaná doba krytí zálohy (h), kdo doplňuje a jak často.
4. **Tlak a tie-in:** požadovaný tlak u zákazníka, tlak a typ stávajícího zdroje (ASU, PSA, Minigan), místo napojení, materiál stávajícího potrubí.
5. **Lokalita:** adresa, souřadnice, min/max návrhová teplota okolí, vlhkost, sníh a námraza, dominantní směr větru.
6. **Prostor:** dostupná plocha, překážky (zdi, chladicí věže, budovy, komunikace), povrch podloží, podzemní vedení.
7. **Příjezd cisterny:** šířka a poloměry otáčení, nosnost, místo vykládky, vzdálenost od silnice, provoz v okolí.
8. **Okolí a rizika:** sousední budovy, jímky/šachty/prohlubně, zdroje zapálení, hořlavé materiály, veřejný přístup.
9. **Energie a komunikace:** napájení, telemetrie, připojení na zákaznický systém.
10. **Legislativa a povolení:** stávající povolení, požadavky pojišťovny, interní předpisy zákazníka.

Z odpovědí se plní `DesignBasis`. Chybějící povinný údaj = gate kroku 7 nelze uzavřít.

---

## 6. Výpočty ve v1 (záměrně minimum)

Vlastní termodynamiku odpařovače **nepočítáme**. Kroky 8 a 9 přebírají výsledek existujícího AAE sizing nástroje (Excel s dvouzónovým NTU modelem a degradací námrazou). Aplikace ukládá: vstupy, výsledek (kapacita, počet a typ modulů), **zdroj a revizi** souboru, a spouští kontroly níže.

Jediný výpočet navíc:

**Autonomie zálohy** (informativní, vždy zobrazit předpoklady):

```
usable_liquid_volume = V_tank * fill_max * (1 - heel_fraction)
gas_volume_normal    = usable_liquid_volume * expansion_ratio(medium)
autonomy_h           = gas_volume_normal / Q_peak
```

- `expansion_ratio` se **nehardcoduje**: počítej z hustoty kapaliny a plynu (např. CoolProp, pokud je dostupný, jinak tabulka v konfiguraci označená `TBD-VERIFY`).
- `fill_max`, `heel_fraction` jsou konfigurovatelné parametry bez výchozí hodnoty (`TBD-VERIFY`).
- Pro konzervativní odhad nabídni i variantu s Q_peak po celou dobu.
- Pokud `autonomy_h < požadovaná autonomie` z dotazníku, výsledek je `NO-GO` (viz R-CAP-01).

Fáze 3 (volitelně): vložit AAE engine jako modul, aby šlo přepočítat přímo v aplikaci. Do té doby jen import výsledku.

---

## 7. Pravidlová kontrola GO / WARNING / NO-GO

### 7.1 Zásady

- Každé pravidlo je **záznam v databázi / JSON**, ne `if` v kódu. Kód jen vyhodnocuje výraz nad vstupy (čistá funkce, plně unit-testovaná).
- Každé pravidlo má: `id`, `kategorie`, `platí_pro` (O₂ / N₂ / obojí), `vstupy`, `podmínka`, `severity_při_selhání` (`NO-GO` nebo `WARNING`), `zpráva_cs`, `doporučená_náprava`, `zdroj` (norma + kapitola nebo interní MS), `stav` (`DRAFT` | `VERIFIED`), `ověřil`, `datum`.
- Výsledky: **GO** (splněno), **WARNING** (vyžaduje posouzení člověkem), **NO-GO** (blokuje uzavření gate), **NEVYHODNOCENO** (chybí vstup nebo parametr).
- Pravidlo ve stavu `DRAFT` se zobrazuje s viditelným štítkem „DRAFT, není podkladem pro schválení návrhu". Gate krok 5 vyžaduje, aby všechna pravidla použitá v projektu byla `VERIFIED`.
- U každého výsledku zobrazit: použité vstupy, citaci zdroje, verzi pravidla. Výsledek musí být reprodukovatelný (snapshot vstupů).
- Ruční **override** NO-GO je možný jen rolí Process Safety, s povinným zdůvodněním, uloží se do audit logu a objeví se v exportu červeně.

### 7.2 Startovní sada pravidel (struktura, bez čísel)

Čísla, vzdálenosti, rychlosti a součinitele **nejsou součástí tohoto dokumentu**. Doplní je Process Safety z platných interních standardů a norem. Všude, kde je `TBD-VERIFY`, jde o parametr, který musí někdo ověřit.

| ID | Kategorie | Pravidlo (srozumitelně) | Médium | Fail |
|---|---|---|---|---|
| R-SD-01 | Safety distances | Vzdálenost tanku a vaporizeru od budov, veřejných komunikací, hranice pozemku a zdrojů zapálení ≥ hodnota z tabulky bezpečných vzdáleností (`TBD-VERIFY`, vychází z vyhodnocení podle EIGA Doc 75 a interního standardu) | O₂, N₂ | NO-GO |
| R-SD-02 | Safety distances | Vzdálenost od jímek, šachet, sklepů a prohlubní (hromadění těžšího plynu, u N₂ asfyxie) | N₂ (i O₂) | NO-GO |
| R-O2-01 | O₂ service | Všechny smáčené díly mají doložený O₂ cleaning a materiálovou kompatibilitu pro O₂ servis | O₂ | NO-GO |
| R-O2-02 | O₂ service | Plocha pod napouštěním a vaporizerem je nehořlavá (beton), žádný asfalt, olej, mazivo ani hořlavý materiál v zóně úniku | O₂ | NO-GO |
| R-O2-03 | O₂ service | Rychlosti v O₂ potrubí a materiál potrubí v souladu s tabulkou limitů pro dané médium, tlak a materiál (`TBD-VERIFY`, EIGA Doc 13 a interní standard) | O₂ | NO-GO |
| R-MAT-01 | Materiály | Všechny části, které mohou přijít do styku s kryogenní kapalinou nebo studeným plynem, jsou z materiálu vhodného pro minimální teplotu (žádná uhlíková ocel pod minimální návrhovou teplotou) | O₂, N₂ | NO-GO |
| R-VAP-01 | Vaporizer | Na výstupu odpařovače je ochrana proti nízké teplotě (detekce teploty a uzavření), pokud je navazující potrubí z materiálu, který studený plyn nesnese | O₂, N₂ | NO-GO |
| R-VAP-02 | Vaporizer | Kapacita odpařovače po zohlednění degradace námrazou a návrhové minimální teploty ≥ Q_peak × součinitel rezervy (`TBD-VERIFY`) | O₂, N₂ | NO-GO |
| R-VAP-03 | Vaporizer | V okolí odpařovače nejsou chladicí věže, výdechy vlhkého vzduchu ani překážky proudění, které zhoršují výkon nebo způsobují námrazu (vzdálenost `TBD-VERIFY`) | O₂, N₂ | WARNING |
| R-PSV-01 | Relief | Každý uzavíratelný úsek, kde může uvíznout kapalina, má pojistné zařízení; set pressure ≤ MAWP | O₂, N₂ | NO-GO |
| R-PSV-02 | Relief | Výstup pojistek a odfuků vyveden na bezpečné místo (u O₂ mimo zdroje zapálení a nasávání vzduchu, u N₂ mimo prostory s pobytem osob) | O₂, N₂ | NO-GO |
| R-CTL-01 | Řízení | Napojení na zákazníka je vybaveno zpětnou armaturou, aby zákaznický plyn netekl zpět do zálohy | O₂, N₂ | NO-GO |
| R-CTL-02 | Řízení | Přepínací tlak zálohy je nastaven pod provozním tlakem primárního zdroje (primární zdroj má přednost), s hysterezí (`TBD-VERIFY`) | O₂, N₂ | WARNING |
| R-CTL-03 | Řízení | Je definována nouzová izolace (ESD / ruční uzávěr) a její umístění je přístupné bez vstupu do rizikové zóny | O₂, N₂ | NO-GO |
| R-FIL-01 | Napouštění | Místo vykládky cisterny: příjezd a otáčení ověřeny, uzemnění, hadice dosáhne, cisterna je mimo zónu pod potrubím a nad podzemním vedením | O₂, N₂ | NO-GO |
| R-ACC-01 | Přístupnost | Armatury a instrumenty, které vyžadují údržbu, mají volný přístup o minimální šířce (`TBD-VERIFY`), neblokuje je zeď ani zařízení | O₂, N₂ | WARNING |
| R-ACC-02 | Přístupnost | Úniková cesta z prostoru stanice není blokována a vede mimo zónu možného úniku | O₂, N₂ | NO-GO |
| R-CAP-01 | Kapacita | `autonomy_h` ≥ požadovaná autonomie z dotazníku (sekce 6) | O₂, N₂ | NO-GO |
| R-ENV-01 | Prostředí | Návrhová teplota okolí a podmínky námrazy odpovídají lokalitě z dotazníku | O₂, N₂ | WARNING |
| R-MON-01 | Monitoring | Alarmy hladiny a tlaku jsou přenášeny na telemetrii a existuje kontakt odpovědné osoby | O₂, N₂ | WARNING |
| R-SIG-01 | Označení | Značení, oplocení a ochrana proti nárazu vozidel odpovídají požadavkům lokality | O₂, N₂ | WARNING |

Ke každému řádku vytvoř plnou datovou definici podle 7.1 se stavem `DRAFT` a prázdnými parametry `TBD-VERIFY`. Seznam pravidel půjde rozšiřovat bez změny kódu.

### 7.3 Standardy (krok 5)

Seznam v aplikaci vede jako `Standard` se stavem `DRAFT` do ověření Process Safety. Níže jsou **kandidáti**, u nichž je třeba ověřit aktuální revizi a platnost pro daný projekt. Nepřebírat jako hotový výčet.

- EIGA: Doc 04 (požární rizika kyslíku), Doc 13 (O₂ potrubní systémy), Doc 33 (čištění zařízení pro kyslík), Doc 44 (rizika inertních plynů), Doc 75 (určování bezpečných vzdáleností)
- ASME B31.3, CGA P-56 (odkazováno u AAE nástroje)
- Interní: MS-47393, MS-79511 (už se používají v AAE nástroji, ověřit relevanci pro zálohy)
- PED 2014/68/EU a příslušné ČSN EN pro kryogenní nádoby a materiály (konkrétní čísla doplní Process Safety)
- Lokální předpisy: stavební a požární legislativa ČR (doplní Process Safety / legal)

---

## 8. UI/UX

- Jazyk: čeština (i18n připraveno pro EN, texty v souborech `messages/cs.json`, `messages/en.json`).
- **Dashboard projektu:** 10 kroků jako stavová osa (semafor), počet otevřených NO-GO a WARNING, nejbližší termíny, kdo na koho čeká.
- **Detail kroku:** checklist úkolů, odkazy na dokumenty, gate podmínky s odškrtnutím, komentáře, historie.
- **Dotazník:** čitelný formulář po sekcích s uložením rozpracovaného stavu, indikace úplnosti v %.
- **Safety Review:** tabulka pravidel s filtrem podle výsledku; rozbalovací detail s použitými vstupy a zdrojem; výrazný banner „Podpora rozhodování, nenahrazuje inženýrské schválení".
- **Export:** „Design Basis & Safety Review" jako PDF a Markdown + XLSX s tabulkou pravidel. Export obsahuje verzi aplikace, verze pravidel, datum, jméno exportujícího a všechny overridy.
- Desktop first, použitelné i na tabletu (terénní použití).

---

## 9. Technický stack (GitHub + Vercel)

| Oblast | Volba |
|---|---|
| Framework | Next.js (App Router), TypeScript `strict` |
| UI | Tailwind CSS + shadcn/ui |
| Validace | Zod (sdílené schémata pro formuláře, API i rule engine) |
| Databáze | Postgres přes Vercel Marketplace (např. Neon) |
| ORM / migrace | Drizzle ORM + SQL migrace v repu |
| Auth | v1: Auth.js s e-mailovým přihlášením nebo jednoduchý admin-managed účet. Fáze 3: Microsoft Entra ID SSO |
| Testy | Vitest (unit, hlavně rule engine a převody jednotek), Playwright (základní e2e) |
| CI | GitHub Actions: lint, typecheck, test na každém PR; Vercel preview na každém PR |
| Export | server-side PDF (např. `@react-pdf/renderer`), `exceljs` pro XLSX |
| i18n | `next-intl` |

Repo: monorepo není potřeba. Struktura:

```
/app                 Next.js routes
/components
/lib/rules           rule engine (čistý TS, bez závislosti na UI/DB)
/lib/units           převody jednotek
/lib/calc            autonomie (sekce 6)
/db                  Drizzle schéma, migrace, seed
/data/rules          startovní pravidla (JSON, DRAFT)
/data/questionnaire  šablona dotazníku (JSON)
/messages            cs.json, en.json
/docs                SPEC.md, OPEN_QUESTIONS.md, DECISIONS.md (ADR)
/tests
```

Proměnné prostředí a tajemství **nikdy do gitu**. Dodej `.env.example`.

---

## 10. Data a bezpečnost aplikace (důležité)

- **V1 nesmí obsahovat důvěrná data Lindeho ani zákazníků.** Seed data a demo projekt jsou fiktivní (např. „Demo Zákazník, LOX 20 m³"). Reálné P&ID, výkresy a ceny na Vercelu neukládat. Dokumenty jsou jen odkazy na SharePoint, ceny se ve v1 vůbec neukládají.
- Před nasazením s reálnými daty je nutný souhlas IT / informační bezpečnosti (umístění dat, přístupy, logování). Zapsat do `docs/OPEN_QUESTIONS.md`.
- Osobní údaje minimalizovat (jméno, e-mail, role). Žádná citlivá data.
- RBAC vynucovat **na serveru** (ne jen skrytím tlačítek). Audit log append-only.
- Rate limiting na API, bezpečné HTTP hlavičky, `zod` validace všech vstupů na serveru.
- Závislosti: `npm audit` v CI, Dependabot zapnout.

---

## 11. Akceptační kritéria v1

1. Lze založit projekt a vidět 10 kroků se stavy, vlastníky a gate.
2. Krok nelze uzavřít, dokud neprojde gate; pokus je zalogován.
3. Dotazník se vyplní, uloží rozpracovaný a plní `DesignBasis`.
4. Rule engine vyhodnotí všech 21 startovních pravidel; pravidla s chybějícími parametry vrátí `NEVYHODNOCENO`, nikdy GO.
5. `NO-GO` blokuje uzavření odpovídajícího kroku; override umí jen Process Safety se zdůvodněním.
6. Autonomie se spočítá a zobrazí s předpoklady; při nedostatku vyhodí `NO-GO` R-CAP-01.
7. Export PDF/MD/XLSX obsahuje výsledky, zdroje pravidel, verze a overridy.
8. Unit testy: pro **každé** pravidlo existuje test GO, NO-GO/WARNING a NEVYHODNOCENO. Pokrytí `lib/rules` a `lib/units` ≥ 90 %.
9. CI zelené, preview na Vercelu funguje, `.env.example` a README s postupem spuštění.
10. Banner „podpora rozhodování, nenahrazuje inženýrské schválení" je u každé obrazovky s výsledkem pravidel.

---

## 12. Fáze

| Fáze | Obsah |
|---|---|
| **0. Základ** | Repo, CI, Vercel, DB, auth, RBAC, audit log, demo seed |
| **1. Workflow** | Projekty, kroky 1 až 10, gate, úkoly, odkazy na dokumenty, dashboard |
| **2. Dotazník + DesignBasis** | Šablona, formulář, úplnost, podmíněné otázky |
| **3. Rule engine + Safety Review** | Schéma pravidel, 21 startovních pravidel (DRAFT), UI, override, testy |
| **4. Autonomie + import sizingu** | Výpočet autonomie, SizingResult se zdrojem a revizí |
| **5. Export** | PDF/MD/XLSX „Design Basis & Safety Review" |
| **6. Rozšíření (po schválení)** | Equipment & cost list (import z Excelu), Entra ID SSO, SharePoint přes Graph, jednoduchá geometrická kontrola vzdáleností ze souřadnic, AAE engine jako modul |

---

## 13. Předpoklady a otevřené otázky (zapsat do `docs/OPEN_QUESTIONS.md`)

1. Rozvedení zkratky **OAM** a přesná dělba OAM vs OPS u jednotlivých kroků.
2. Co je **CES P&ID** (standardní P&ID kterého typu stanice).
3. Potvrzení navržených závislostí mezi kroky (sekce 3) a zda přidat HAZID/HAZOP, O₂ cleaning, FAT/SAT a handover jako povinné kroky.
4. Kdo je u Linde **vlastníkem tabulek bezpečných vzdáleností a limitů rychlostí** a kdo schvaluje stav `VERIFIED`.
5. Souhlas IT / InfoSec s hostováním na Vercelu pro reálná data.
6. Přístup k aktuální revizi AAE sizing nástroje (soubor, revize) a formát, ve kterém sizing responsible předává výsledek.
7. Má aplikace v budoucnu pokrývat i Minigan a PSA zálohy, nebo zůstanou jen jako reference?
