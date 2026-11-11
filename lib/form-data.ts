/**
 * Form fields of template-based forms: `q:<id>` holds the value (repeated for
 * multiselect), `u:<id>` the unit of a quantity, `m:<id>` marks a multiselect.
 * Only questions present in the form are returned (partial save).
 */
export function rawAnswersFromFormData(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const multi = new Set([...fd.keys()].filter((k) => k.startsWith("m:")).map((k) => k.slice(2)));
  for (const key of new Set(fd.keys())) {
    if (!key.startsWith("q:")) continue;
    const id = key.slice(2);
    if (multi.has(id)) continue;
    const unit = fd.get(`u:${id}`);
    out[id] = unit !== null ? { input: fd.get(key), unit } : fd.get(key);
  }
  for (const id of multi) out[id] = fd.getAll(`q:${id}`).map(String);
  return out;
}

export function fieldErrorsOf(errors: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]]));
}
