import { LABELS } from "./labels";
import type { ReportModel } from "./report";

const RED = "#b91c1c";

/** Escape for Markdown table cells. */
function cell(v: string | number): string {
  return String(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function table(head: string[], rows: (string | number)[][]): string {
  return [`| ${head.map(cell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

const red = (s: string) => `<span style="color:${RED}">**${s}**</span>`;

export function renderMarkdown(m: ReportModel): string {
  const L = LABELS[m.meta.locale];
  const out: string[] = [];
  out.push(`# ${m.meta.title}: ${m.project.name}`);
  out.push(`> ⚠ **${m.meta.disclaimer}**\n>\n> ${m.meta.fictitious}`);
  out.push(
    table(
      [L.meta.report, L.meta.appVersion, L.meta.commit, L.meta.generatedAt, L.meta.generatedBy],
      [[m.meta.reportId, m.meta.appVersion, m.meta.commit ?? "—", m.meta.generatedAt, m.meta.generatedBy]],
    ),
  );

  out.push(`## ${L.project}`);
  const pf = L.projectFields;
  out.push(
    table(
      [pf.name, pf.customer, pf.location, pf.medium, pf.owner, pf.status],
      [[m.project.name, m.project.customer, m.project.location, m.project.medium, m.project.owner, m.project.status]],
    ),
  );

  out.push(`## ${L.steps}`);
  out.push(table([L.step, L.state, L.gate], m.steps.map((s) => [`${s.key}. ${s.title}`, s.stateLabel, s.gate])));

  out.push(`## ${L.questionnaire}`);
  out.push(
    `${L.phase}: ${m.questionnaire.phase} · ${L.initial}: ${m.questionnaire.initialPercent} % · ${L.detailed}: ${m.questionnaire.detailedPercent} % · ${m.questionnaire.template}`,
  );

  out.push(`## ${L.designBasis}`);
  out.push(m.designBasis.length ? table([L.item, L.value, L.si, L.source], m.designBasis.map((d) => [`${d.label} (${d.key})`, d.value, d.si, d.source])) : "—");

  out.push(`## ${L.sizing}`);
  if (m.sizing) {
    out.push(`v${m.sizing.version} · ${L.source}: ${m.sizing.source}`);
    out.push(table([L.item, L.value], m.sizing.rows.map((r) => [r.label, r.value])));
  } else out.push(L.noSizing);

  out.push(`## ${L.autonomy}`);
  out.push(
    table(
      [L.conservative, L.informative, L.required, L.verdict],
      [[m.autonomy.conservative, m.autonomy.informative, m.autonomy.required, m.autonomy.verdict]],
    ),
  );
  out.push(table([L.item, L.value], m.autonomy.steps.map((s) => [s.label, s.value])));
  out.push(`**${L.params}** (${L.config}: ${m.autonomy.config} · ${m.autonomy.configStatus})`);
  out.push(table([L.item, L.value], m.autonomy.params.map((p) => [`${p.label} [${p.key}]`, p.value])));
  if (m.autonomy.missing.length) out.push(`${L.missing}: ${m.autonomy.missing.join(", ")}`);

  out.push(`## ${L.safety}`);
  out.push(`> ⚠ **${m.meta.disclaimer}** ${L.draftNote}`);
  out.push(`### ${L.summary}`);
  out.push(table(m.safety.counts.map((c) => c.label), [m.safety.counts.map((c) => c.value)]));
  out.push(
    table(
      [L.rule, L.result, L.ruleStatus, L.version, L.severity, L.stagesCol, L.source, L.fingerprint],
      m.safety.rules.map((r) => [
        `${r.id} ${r.title}`,
        r.overridden ? red(r.resultLabel) : r.resultLabel,
        r.status,
        r.version,
        r.severity,
        r.stages,
        r.source,
        r.fingerprint,
      ]),
    ),
  );
  for (const r of m.safety.rules) {
    out.push(`### ${r.id} · ${r.title} · ${r.overridden ? red(r.resultLabel) : r.resultLabel} · ${r.status} v${r.version}`);
    if (r.result !== "GO") out.push(`${L.message}: ${r.message}\n\n${L.remediation}: ${r.remediation}`);
    out.push(`${L.condition}: \`${r.condition}\``);
    out.push(table([L.inputs, L.value], r.inputs.map((i) => [`${i.label} (${i.key})`, i.value])));
    if (r.params.length) out.push(table([L.params, L.value], r.params.map((p) => [`${p.label} [${p.key}]`, p.value])));
    if (r.missing.length) out.push(`${L.missing}: ${r.missing.join(", ")}`);
  }

  out.push(`## ${red(L.overrides)}`);
  out.push(
    m.overrides.length
      ? table(
          [L.rule, L.kind, L.status, L.reason, L.by, L.revokedCol],
          m.overrides.map((o) => [
            `${o.ruleId} v${o.ruleVersion}`,
            o.kind === "override" ? red(o.kindLabel) : o.kindLabel,
            o.kind === "override" ? red(o.stateLabel) : o.stateLabel,
            o.reason,
            `${o.by}, ${o.at}`,
            o.revoked ?? "—",
          ]),
        )
      : L.noOverrides,
  );

  out.push(`## ${L.standards}`);
  out.push(table([L.code, L.item, L.revision, L.status], m.standards.map((s) => [s.code, s.title, s.revision, s.status])));
  out.push(`---\n_${m.meta.disclaimer}_`);
  return out.join("\n\n") + "\n";
}
