# Akceptační kritéria v1 (SPEC §11): stav

| # | Kritérium | Stav | Doklad |
|---|---|---|---|
| 1 | Lze založit projekt a vidět 10 kroků se stavy, vlastníky a gate. | splněno | e2e `workflow.spec.ts`; dashboard a detail kroku |
| 2 | Krok nelze uzavřít, dokud neprojde gate; pokus je zalogován. | splněno | `tests/unit/workflow/state-machine.test.ts`, `tests/integration/workflow.test.ts` (`stage.close_rejected`), e2e `workflow.spec.ts` |
| 3 | Dotazník se vyplní, uloží rozpracovaný a plní `DesignBasis`. | splněno | `tests/integration/questionnaire.test.ts`, e2e `questionnaire.spec.ts` |
| 4 | Rule engine vyhodnotí všech 21 startovních pravidel; pravidla s chybějícími parametry vrátí NEVYHODNOCENO, nikdy GO. | splněno | `tests/unit/rules/starter-rules.test.ts`, `tests/integration/safety.test.ts` |
| 5 | NO-GO blokuje uzavření odpovídajícího kroku; override umí jen Process Safety se zdůvodněním. | splněno | `tests/integration/safety.test.ts` (gate kroku 4, override, otisk), e2e `safety.spec.ts` |
| 6 | Autonomie se spočítá a zobrazí s předpoklady; při nedostatku vyhodí NO-GO R-CAP-01. | splněno | `tests/unit/calc/autonomy.test.ts`, `tests/integration/sizing.test.ts`, e2e `sizing.spec.ts` |
| 7 | Export PDF/MD/XLSX obsahuje výsledky, zdroje pravidel, verze a overridy. | splněno | `tests/unit/export/renderers.test.ts`, `tests/integration/export.test.ts`, e2e `export.spec.ts` |
| 8 | Pro každé pravidlo test GO, NO-GO/WARNING a NEVYHODNOCENO; pokrytí `lib/rules` a `lib/units` ≥ 90 %. | splněno | `starter-rules.test.ts`; prahy pokrytí ve `vitest.config.ts` (rules 97–100 %, units 100 %) |
| 9 | CI zelené, preview na Vercelu funguje, `.env.example` a README s postupem spuštění. | částečně | CI zelené, `.env.example` a README jsou. **Vercel**: projekt je připojený, ale pro běh je potřeba nastavit `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` a spustit migrace (ADR-003); z této session neověřitelné. |
| 10 | Banner „podpora rozhodování, nenahrazuje inženýrské schválení“ je u každé obrazovky s výsledkem pravidel. | splněno | Safety Review, dashboard, detail kroků s pravidlovou gate, sizing; export; e2e `safety.spec.ts`, `sizing.spec.ts`, `export.spec.ts` |

Bezpečnostní pravidla jsou data bez vymyšlených hodnot: všech 21 pravidel je ve stavu DRAFT, parametry a kapitoly zdrojů jsou `TBD-VERIFY` a parametry výpočtu autonomie nemají výchozí hodnoty. Hodnoty doplní a ověří Process Safety (otevřené otázky 4, 24, 31).
