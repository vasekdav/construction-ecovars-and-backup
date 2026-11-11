import { getTranslations } from "next-intl/server";
import type { DerivedDistance, ObjectType, Plan } from "@/lib/geometry";

const COLORS: Record<ObjectType, string> = {
  tank: "#0c4a6e",
  vaporizer: "#0369a1",
  building: "#64748b",
  public_road: "#a16207",
  site_boundary: "#15803d",
  ignition_source: "#b91c1c",
  low_point: "#7c3aed",
  cooling_tower: "#0891b2",
  other: "#94a3b8",
};

/** SVG preview of the plan with the derived minimum distances (y axis points up). */
export async function PlanPreview({ plan, distances }: { plan: Plan; distances: DerivedDistance[] }) {
  const t = await getTranslations("objectTypes");
  const pts = plan.objects.flatMap((o) => o.points);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.06;
  const vb = `${minX - pad} ${-(maxY + pad)} ${w + 2 * pad} ${h + 2 * pad}`;
  const stroke = Math.max(w, h) / 300;
  const font = Math.max(w, h) / 45;
  const P = (p: readonly [number, number]) => `${p[0]},${-p[1]}`;
  return (
    <svg viewBox={vb} className="h-auto w-full rounded border border-border bg-white" role="img" aria-label="plan" data-testid="plan-preview">
      {plan.objects.map((o) => {
        const c = COLORS[o.type];
        const title = `${t(o.type)}: ${o.label}`;
        if (o.points.length === 1) {
          return (
            <g key={o.id}>
              <title>{title}</title>
              <circle cx={o.points[0]![0]} cy={-o.points[0]![1]} r={stroke * 4} fill={c} />
              <text x={o.points[0]![0] + stroke * 6} y={-o.points[0]![1]} fontSize={font} fill={c}>
                {o.label}
              </text>
            </g>
          );
        }
        const d = o.points.map(P).join(" ");
        const [lx, ly] = o.points[0]!;
        return (
          <g key={o.id}>
            <title>{title}</title>
            {o.closed ? (
              <polygon points={d} fill={o.type === "site_boundary" ? "none" : `${c}22`} stroke={c} strokeWidth={stroke * (o.type === "site_boundary" ? 2 : 1)} />
            ) : (
              <polyline points={d} fill="none" stroke={c} strokeWidth={stroke * 3} />
            )}
            <text x={lx} y={-ly - stroke * 3} fontSize={font} fill={c}>
              {o.label}
            </text>
          </g>
        );
      })}
      {distances.map((d) => (
        <g key={d.key}>
          <line x1={d.from[0]} y1={-d.from[1]} x2={d.to[0]} y2={-d.to[1]} stroke="#b45309" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />
          <text x={(d.from[0] + d.to[0]) / 2 + stroke * 3} y={-(d.from[1] + d.to[1]) / 2} fontSize={font * 0.9} fill="#b45309">
            {`${Math.round(d.distance * 100) / 100} m`}
          </text>
        </g>
      ))}
    </svg>
  );
}
