import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ruleSchema, type Rule } from "./rule";

/** Starter rules shipped as JSON in data/rules (Node only: used by the DB sync and tests). */
export function loadRuleFiles(dir = path.join(process.cwd(), "data", "rules")): Rule[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = ruleSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`Invalid rule file ${f}: ${parsed.error.message}`);
      return parsed.data;
    });
}
