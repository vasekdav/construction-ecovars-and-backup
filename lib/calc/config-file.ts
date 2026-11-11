import { readFileSync } from "node:fs";
import path from "node:path";
import { calcConfigSchema, type CalcConfig } from "./config";

/** Shipped calculation config (Node only: used by the DB seed / rule sync and tests, never by the app). */
export function loadCalcConfigFile(file = path.join(process.cwd(), "data", "calc", "autonomy.json")): CalcConfig {
  return calcConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
