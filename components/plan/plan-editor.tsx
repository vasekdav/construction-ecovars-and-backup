"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ActionMessage } from "@/components/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useSubmit } from "@/components/use-submit";
import type { ActionState } from "@/lib/actions";
import { formatPoints, OBJECT_TYPES, parsePoints, type ObjectType, type Plan } from "@/lib/geometry";

interface Row {
  id: string;
  type: ObjectType;
  label: string;
  points: string;
  closed: boolean;
}

let counter = 0;
const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

export function PlanEditor({
  projectId,
  version,
  plan,
  readOnly,
  action,
}: {
  projectId: string;
  version: number;
  plan: Plan | null;
  readOnly: boolean;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const t = useTranslations("plan");
  const tTypes = useTranslations("objectTypes");
  const [rows, setRows] = useState<Row[]>(
    (plan?.objects ?? []).map((o) => ({ id: o.id, type: o.type, label: o.label, points: formatPoints(o.points), closed: o.closed })),
  );
  const [state, formAction, pending] = useActionState(action, null);
  const onSubmit = useSubmit(formAction);

  const rowError = (r: Row): string | null => {
    const pts = parsePoints(r.points);
    if (!pts) return t("invalidPoints");
    if (r.closed && pts.length < 3) return t("closedNeeds3");
    return null;
  };
  const errors = rows.map(rowError);
  const json = JSON.stringify({
    objects: rows.map((r) => ({ id: r.id, type: r.type, label: r.label, points: parsePoints(r.points) ?? [], closed: r.closed })),
  });
  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-3" data-testid="plan-editor">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="plan" value={json} />
      <p className="text-xs text-muted-foreground">{t("pointsHint")}</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      {rows.map((r, i) => (
        <div key={r.id} className="grid gap-2 rounded border border-border p-2 md:grid-cols-[10rem_10rem_1fr_auto_auto]" data-testid={`plan-row-${i}`}>
          <Select aria-label={t("type")} value={r.type} disabled={readOnly} onChange={(e) => update(i, { type: e.target.value as ObjectType })}>
            {OBJECT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {tTypes(ty)}
              </option>
            ))}
          </Select>
          <Input aria-label={t("label")} value={r.label} disabled={readOnly} maxLength={80} onChange={(e) => update(i, { label: e.target.value })} />
          <div>
            <Input aria-label={t("points")} value={r.points} disabled={readOnly} placeholder="0, 0; 3, 0; 3, 3; 0, 3" onChange={(e) => update(i, { points: e.target.value })} />
            {errors[i] && r.points && <p className="text-xs text-nogo">{errors[i]}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={r.closed} disabled={readOnly} onChange={(e) => update(i, { closed: e.target.checked })} />
            {t("closed")}
          </label>
          {!readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
              {t("remove")}
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { id: newId(), type: "building", label: "", points: "", closed: true }])}
          >
            {t("add")}
          </Button>
          <Button type="submit" size="sm" disabled={pending || errors.some(Boolean) || rows.some((r) => !r.label.trim())}>
            {t("save")}
          </Button>
        </div>
      )}
      <ActionMessage state={state} />
    </form>
  );
}
