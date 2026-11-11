# Plán implementace (schváleno 2026-11-11)

Zdroj: `docs/SPEC.md`. Každá fáze končí zelenými testy, funkčním během a záznamem v `CHANGELOG.md`.
Vercel zatím není připojen (viz ADR-003): místo „preview na Vercelu“ platí zelené CI + lokální běh.

## Rozhodnutí
- Nasazení: zatím lokálně + GitHub Actions; Vercel + Neon později (stačí nastavit proměnné prostředí).
- Auth v1: účty spravuje admin (Auth.js Credentials, hash scrypt).
- Závislosti kroků: `1 → 2 → {4, 5, 7} → 8 → {3, 9} → 6 → 10`, uložené v konfiguraci šablony.
- Kroky navíc (HAZID/HAZOP, O₂ cleaning, povolení, FAT/SAT, OPS handover): v šabloně, výchozí stav vypnuto, označení mimo 1–10 (`H1`, `C1`, …).
- Rule engine: vlastní typovaný jazyk výrazů (AST + Zod) s tříhodnotovou logikou; chybějící vstup nebo parametr → `NEVYHODNOCENO`, nikdy GO.
- Vazba pravidlo → krok přes pole `stages` v datech pravidla.
- `expansion_ratio = ρ_liq / ρ_gas,normal`, hustoty a definice normálních podmínek jsou parametry `TBD-VERIFY` bez výchozí hodnoty.
- Verzování pravidel: úprava = nová verze ve stavu `DRAFT`; vyhodnocení ukládá verzi a snapshot vstupů.
- Rate limiting v paměti (omezení: na instanci).
- Seed: pouze fiktivní účty a data.

## Fáze
| Fáze | Obsah | Stav |
|---|---|---|
| 0. Základ | Next.js, Tailwind, shadcn-style UI, next-intl, Drizzle + migrace, Auth, RBAC, append-only audit log, správa uživatelů, bezpečnostní hlavičky, rate limit, CI, Dependabot, demo seed | hotovo |
| 1. Workflow | Project, Stage, Task, DocumentLink, Decision, šablona procesu, stavový automat, gate, závislosti, LayoutVersion v0..vN, dashboard, detail kroku, demo projekt | hotovo |
| 2. Dotazník + DesignBasis | Verzovaná JSON šablona, podmíněné otázky, dvě fáze, průběžné ukládání, úplnost %, `lib/units` (≥ 90 %), mapování na DesignBasis, gate 7 | |
| 3. Rule engine + Safety Review | `lib/rules` (čisté TS), 21 pravidel DRAFT v `data/rules`, Standard, VERIFIED workflow, override (jen Process Safety), Safety Review UI s bannerem, gate 5, testy GO/FAIL/NEVYHODNOCENO pro každé pravidlo (≥ 90 %) | |
| 4. Autonomie + sizing | `lib/calc/autonomy` s předpoklady a konzervativní variantou, SizingResult se zdrojem a revizí, gate 8, R-CAP-01, R-VAP-02 | |
| 5. Export | Design Basis & Safety Review: Markdown, PDF (`@react-pdf/renderer`), XLSX (`exceljs`), verze, overridy červeně | |
| 6. Rozšíření | Až po schválení (SPEC §12) | |
