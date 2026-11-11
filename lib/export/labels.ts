import type { RuleResult } from "@/lib/rules/rule";
import type { StageState } from "@/lib/workflow/types";

export type ExportLocale = "cs" | "en";

interface Labels {
  title: string;
  disclaimer: string;
  fictitious: string;
  meta: { report: string; appVersion: string; commit: string; generatedAt: string; generatedBy: string };
  project: string;
  projectFields: { name: string; customer: string; location: string; medium: string; owner: string; status: string };
  steps: string;
  step: string;
  state: string;
  gate: string;
  questionnaire: string;
  phase: string;
  initial: string;
  detailed: string;
  designBasis: string;
  item: string;
  value: string;
  si: string;
  source: string;
  sizing: string;
  noSizing: string;
  autonomy: string;
  conservative: string;
  informative: string;
  required: string;
  verdict: string;
  params: string;
  config: string;
  missing: string;
  safety: string;
  summary: string;
  rule: string;
  ruleStatus: string;
  version: string;
  result: string;
  severity: string;
  stagesCol: string;
  condition: string;
  inputs: string;
  message: string;
  remediation: string;
  fingerprint: string;
  overrides: string;
  noOverrides: string;
  active: string;
  revoked: string;
  revokedCol: string;
  overrideState: Record<"applied" | "stale" | "revoked", string>;
  ackState: Record<"applied" | "stale" | "revoked", string>;
  kindOverride: string;
  kindAck: string;
  acknowledgedResult: string;
  kind: string;
  /** Excel limits sheet names to 31 characters. */
  overridesSheet: string;
  reason: string;
  by: string;
  standards: string;
  code: string;
  revision: string;
  status: string;
  notEvaluated: string;
  meets: string;
  notMeets: string;
  usable: string;
  ratio: string;
  gas: string;
  normalConditions: string;
  invalid: string;
  phaseInitial: string;
  phaseDetailed: string;
  draftNote: string;
  results: Record<RuleResult, string>;
  states: Record<StageState, string>;
  medium: Record<"O2" | "N2", string>;
}

export const LABELS: Record<ExportLocale, Labels> = {
  cs: {
    title: "Design Basis & Safety Review",
    disclaimer: "Podpora rozhodování, nenahrazuje inženýrské schválení.",
    fictitious: "Pouze fiktivní data (v1). Neobsahuje důvěrná data Linde ani zákazníků.",
    meta: { report: "ID exportu", appVersion: "Verze aplikace", commit: "Commit", generatedAt: "Datum exportu", generatedBy: "Exportoval" },
    project: "Projekt",
    projectFields: { name: "Název", customer: "Zákazník", location: "Lokalita", medium: "Médium", owner: "Vlastník (OAM)", status: "Stav" },
    steps: "Stav kroků",
    step: "Krok",
    state: "Stav",
    gate: "Gate přijal",
    questionnaire: "Zákaznický dotazník",
    phase: "Fáze",
    initial: "Počáteční požadavky",
    detailed: "Celý dotazník",
    designBasis: "Design Basis",
    item: "Položka",
    value: "Hodnota",
    si: "SI",
    source: "Zdroj",
    sizing: "Výsledek sizingu",
    noSizing: "Výsledek sizingu není uložen.",
    autonomy: "Autonomie zálohy (informativní)",
    conservative: "Konzervativní (Q_peak, R-CAP-01)",
    informative: "Informativní (Q_avg)",
    required: "Požadovaná autonomie",
    verdict: "Vyhodnocení",
    params: "Parametry",
    config: "Konfigurace výpočtu",
    missing: "Chybí",
    safety: "Safety Review",
    summary: "Souhrn",
    rule: "Pravidlo",
    ruleStatus: "Stav pravidla",
    version: "Verze",
    result: "Výsledek",
    severity: "Při selhání",
    stagesCol: "Blokuje krok",
    condition: "Podmínka",
    inputs: "Použité vstupy",
    message: "Zpráva",
    remediation: "Doporučená náprava",
    fingerprint: "Otisk vstupů",
    overrides: "Overridy NO-GO a posouzení WARNING",
    noOverrides: "Žádné overridy.",
    active: "aktivní",
    revoked: "zrušen",
    revokedCol: "Zrušení",
    overrideState: {
      applied: "OVERRIDE platí",
      stale: "OVERRIDE neplatí (změnila se verze pravidla nebo vstupy)",
      revoked: "OVERRIDE zrušen",
    },
    ackState: {
      applied: "posouzení platí",
      stale: "posouzení neplatí (změnila se verze pravidla nebo vstupy)",
      revoked: "posouzení zrušeno",
    },
    kindOverride: "Override NO-GO",
    kindAck: "Posouzení WARNING",
    acknowledgedResult: "WARNING (posouzeno)",
    kind: "Typ",
    overridesSheet: "Overridy a posouzení",
    reason: "Zdůvodnění",
    by: "Kdo, kdy",
    standards: "Standardy",
    code: "Kód",
    revision: "Revize",
    status: "Stav",
    notEvaluated: "NEVYHODNOCENO",
    meets: "splňuje požadavek",
    notMeets: "NESPLŇUJE požadavek",
    usable: "Využitelný objem kapaliny",
    ratio: "expansion_ratio",
    gas: "Objem plynu (normální podmínky)",
    normalConditions: "normální podmínky",
    invalid: "neplatné",
    phaseInitial: "Počáteční požadavky",
    phaseDetailed: "Detailní požadavky",
    draftNote: "Pravidla ve stavu DRAFT nejsou podkladem pro schválení návrhu.",
    results: { GO: "GO", WARNING: "WARNING", "NO-GO": "NO-GO", NOT_EVALUATED: "NEVYHODNOCENO" },
    states: { NOT_STARTED: "NEZAHÁJENO", IN_PROGRESS: "ROZPRACOVÁNO", IN_REVIEW: "K REVIZI", CLOSED: "UZAVŘENO", BLOCKED: "BLOKOVÁNO" },
    medium: { O2: "O₂ (kyslík)", N2: "N₂ (dusík)" },
  },
  en: {
    title: "Design Basis & Safety Review",
    disclaimer: "Decision support only, does not replace engineering approval.",
    fictitious: "Fictitious data only (v1). Contains no confidential Linde or customer data.",
    meta: { report: "Export ID", appVersion: "App version", commit: "Commit", generatedAt: "Exported at", generatedBy: "Exported by" },
    project: "Project",
    projectFields: { name: "Name", customer: "Customer", location: "Location", medium: "Medium", owner: "Owner (OAM)", status: "Status" },
    steps: "Steps",
    step: "Step",
    state: "Status",
    gate: "Gate accepted by",
    questionnaire: "Customer questionnaire",
    phase: "Phase",
    initial: "Initial requirements",
    detailed: "Whole questionnaire",
    designBasis: "Design Basis",
    item: "Item",
    value: "Value",
    si: "SI",
    source: "Source",
    sizing: "Sizing result",
    noSizing: "No sizing result recorded.",
    autonomy: "Backup autonomy (informative)",
    conservative: "Conservative (Q_peak, R-CAP-01)",
    informative: "Informative (Q_avg)",
    required: "Required autonomy",
    verdict: "Assessment",
    params: "Parameters",
    config: "Calculation config",
    missing: "Missing",
    safety: "Safety Review",
    summary: "Summary",
    rule: "Rule",
    ruleStatus: "Rule status",
    version: "Version",
    result: "Result",
    severity: "On failure",
    stagesCol: "Blocks step",
    condition: "Condition",
    inputs: "Inputs used",
    message: "Message",
    remediation: "Recommended remediation",
    fingerprint: "Input fingerprint",
    overrides: "NO-GO overrides and WARNING reviews",
    noOverrides: "No overrides.",
    active: "active",
    revoked: "revoked",
    revokedCol: "Revocation",
    overrideState: {
      applied: "OVERRIDE applies",
      stale: "OVERRIDE no longer applies (rule version or inputs changed)",
      revoked: "OVERRIDE revoked",
    },
    ackState: {
      applied: "review applies",
      stale: "review no longer applies (rule version or inputs changed)",
      revoked: "review revoked",
    },
    kindOverride: "NO-GO override",
    kindAck: "WARNING review",
    acknowledgedResult: "WARNING (reviewed)",
    kind: "Type",
    overridesSheet: "Overrides and reviews",
    reason: "Justification",
    by: "Who, when",
    standards: "Standards",
    code: "Code",
    revision: "Revision",
    status: "Status",
    notEvaluated: "NOT EVALUATED",
    meets: "meets the requirement",
    notMeets: "DOES NOT meet the requirement",
    usable: "Usable liquid volume",
    ratio: "expansion_ratio",
    gas: "Gas volume (normal conditions)",
    normalConditions: "normal conditions",
    invalid: "invalid",
    phaseInitial: "Initial requirements",
    phaseDetailed: "Detailed requirements",
    draftNote: "DRAFT rules are not a basis for design approval.",
    results: { GO: "GO", WARNING: "WARNING", "NO-GO": "NO-GO", NOT_EVALUATED: "NOT EVALUATED" },
    states: { NOT_STARTED: "NOT STARTED", IN_PROGRESS: "IN PROGRESS", IN_REVIEW: "IN REVIEW", CLOSED: "CLOSED", BLOCKED: "BLOCKED" },
    medium: { O2: "O₂ (oxygen)", N2: "N₂ (nitrogen)" },
  },
};
