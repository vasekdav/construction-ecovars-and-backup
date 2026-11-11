import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LABELS } from "./labels";
import type { ReportModel } from "./report";

/** DejaVu Sans covers Czech diacritics and subscripts (O₂, N₂). License: assets/fonts/DejaVu-LICENSE.txt */
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "DejaVu",
    fonts: [
      { src: path.join(dir, "DejaVuSans.ttf") },
      { src: path.join(dir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // No hyphenation: a hyphen inserted into an identifier or fingerprint would change its meaning.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const RED = "#b91c1c";
const s = StyleSheet.create({
  page: { fontFamily: "DejaVu", fontSize: 8, padding: 32, paddingBottom: 48, color: "#0f172a" },
  h1: { fontSize: 15, fontWeight: "bold", marginBottom: 6 },
  h2: { fontSize: 11, fontWeight: "bold", marginTop: 12, marginBottom: 4, color: "#0c4a6e" },
  h3: { fontSize: 9, fontWeight: "bold", marginTop: 6, marginBottom: 2 },
  banner: { borderWidth: 1.5, borderColor: "#b45309", backgroundColor: "#fef3c7", padding: 6, marginBottom: 8, fontWeight: "bold", fontSize: 10 },
  small: { fontSize: 7, color: "#475569" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 2 },
  head: { flexDirection: "row", backgroundColor: "#0c4a6e", color: "#ffffff", fontWeight: "bold", paddingVertical: 2 },
  cell: { paddingHorizontal: 3 },
  red: { color: RED, fontWeight: "bold" },
  redRow: { flexDirection: "row", backgroundColor: "#fde2e2", borderBottomWidth: 0.5, borderBottomColor: "#fca5a5", paddingVertical: 2 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7, color: "#475569", flexDirection: "row", justifyContent: "space-between" },
});

function Table({ head, rows, widths, redRows = [] }: { head: string[]; rows: string[][]; widths: number[]; redRows?: number[] }) {
  return (
    <View>
      <View style={s.head} fixed minPresenceAhead={30}>
        {head.map((h, i) => (
          <Text key={i} style={[s.cell, { width: `${widths[i]}%` }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={redRows.includes(ri) ? s.redRow : s.row} wrap={false}>
          {r.map((c, ci) => (
            <Text key={ci} style={[s.cell, { width: `${widths[ci]}%` }, redRows.includes(ri) ? s.red : {}]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function ReportDocument({ m }: { m: ReportModel }) {
  const L = LABELS[m.meta.locale];
  return (
    <Document title={`${m.meta.title} – ${m.project.name}`} author={m.meta.generatedBy} creator="Backup Station Project Hub" language={m.meta.locale}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>
          {m.meta.title}: {m.project.name}
        </Text>
        <Text style={s.banner}>⚠ {m.meta.disclaimer}</Text>
        <Text style={s.small}>{m.meta.fictitious}</Text>
        <Table
          head={[L.meta.report, L.meta.appVersion, L.meta.commit, L.meta.generatedAt, L.meta.generatedBy]}
          rows={[[m.meta.reportId, m.meta.appVersion, m.meta.commit ?? "—", m.meta.generatedAt, m.meta.generatedBy]]}
          widths={[34, 12, 18, 16, 20]}
        />

        <Text style={s.h2}>{L.project}</Text>
        <Table
          head={[L.projectFields.name, L.projectFields.customer, L.projectFields.location, L.projectFields.medium, L.projectFields.owner]}
          rows={[[m.project.name, m.project.customer, m.project.location, m.project.medium, m.project.owner]]}
          widths={[26, 22, 20, 14, 18]}
        />

        <Text style={s.h2}>{L.steps}</Text>
        <Table head={[L.step, L.state, L.gate]} rows={m.steps.map((x) => [`${x.key}. ${x.title}`, x.stateLabel, x.gate])} widths={[55, 18, 27]} />

        <Text style={s.h2}>{L.questionnaire}</Text>
        <Text>
          {L.phase}: {m.questionnaire.phase} · {L.initial}: {m.questionnaire.initialPercent} % · {L.detailed}: {m.questionnaire.detailedPercent} % ·{" "}
          {m.questionnaire.template}
        </Text>

        <Text style={s.h2}>{L.designBasis}</Text>
        {m.designBasis.length ? (
          <Table head={[L.item, L.value, L.si, L.source]} rows={m.designBasis.map((d) => [d.label, d.value, d.si, d.source])} widths={[38, 26, 16, 20]} />
        ) : (
          <Text>—</Text>
        )}

        <Text style={s.h2}>{L.sizing}</Text>
        {m.sizing ? (
          <View>
            <Text>
              v{m.sizing.version} · {L.source}: {m.sizing.source}
            </Text>
            <Table head={[L.item, L.value]} rows={m.sizing.rows.map((r) => [r.label, r.value])} widths={[60, 40]} />
          </View>
        ) : (
          <Text>{L.noSizing}</Text>
        )}

        <Text style={s.h2}>{L.autonomy}</Text>
        <Table
          head={[L.conservative, L.informative, L.required, L.verdict]}
          rows={[[m.autonomy.conservative, m.autonomy.informative, m.autonomy.required, m.autonomy.verdict]]}
          widths={[28, 22, 22, 28]}
        />
        <Table head={[L.item, L.value]} rows={m.autonomy.steps.map((x) => [x.label, x.value])} widths={[60, 40]} />
        <Text style={s.h3}>
          {L.params} ({L.config}: {m.autonomy.config} · {m.autonomy.configStatus})
        </Text>
        <Table head={[L.item, L.value]} rows={m.autonomy.params.map((p) => [`${p.label} [${p.key}]`, p.value])} widths={[60, 40]} />
        {m.autonomy.missing.length > 0 && (
          <Text>
            {L.missing}: {m.autonomy.missing.join(", ")}
          </Text>
        )}

        <Text style={s.h2} break>
          {L.safety}
        </Text>
        <Text style={s.banner}>
          ⚠ {m.meta.disclaimer} {L.draftNote}
        </Text>
        <Table head={m.safety.counts.map((c) => c.label)} rows={[m.safety.counts.map((c) => String(c.value))]} widths={m.safety.counts.map(() => 100 / Math.max(1, m.safety.counts.length))} />
        <View style={{ marginTop: 6 }}>
          <Table
            head={[L.rule, L.result, L.ruleStatus, L.version, L.stagesCol, L.source, L.fingerprint]}
            rows={m.safety.rules.map((r) => [`${r.id} ${r.title}`, r.resultLabel, r.status, String(r.version), r.stages, r.source, r.fingerprint])}
            widths={[25, 18, 11, 6, 7, 19, 14]}
            redRows={m.safety.rules.flatMap((r, i) => (r.overridden ? [i] : []))}
          />
        </View>
        {m.safety.rules.map((r) => (
          <View key={r.id} wrap={false} style={{ marginTop: 6 }}>
            <Text style={[s.h3, r.overridden ? s.red : {}]}>
              {r.id} · {r.title} · {r.resultLabel} · {r.status} v{r.version}
            </Text>
            {r.result !== "GO" && (
              <Text>
                {L.message}: {r.message} {L.remediation}: {r.remediation}
              </Text>
            )}
            <Text style={s.small}>
              {L.condition}: {r.condition}
            </Text>
            <Text style={s.small}>
              {L.inputs}: {r.inputs.map((i) => `${i.key} = ${i.value}`).join("; ")}
            </Text>
            {r.params.length > 0 && (
              <Text style={s.small}>
                {L.params}: {r.params.map((p) => `${p.key} = ${p.value}`).join("; ")}
              </Text>
            )}
          </View>
        ))}

        <Text style={[s.h2, s.red]} minPresenceAhead={60}>
          {L.overrides}
        </Text>
        {m.overrides.length ? (
          <Table
            head={[L.rule, L.status, L.reason, L.by, L.revokedCol]}
            rows={m.overrides.map((o) => [`${o.ruleId} v${o.ruleVersion}`, o.stateLabel, o.reason, `${o.by}, ${o.at}`, o.revoked ?? "—"])}
            widths={[14, 14, 36, 18, 18]}
            redRows={m.overrides.map((_, i) => i)}
          />
        ) : (
          <Text>{L.noOverrides}</Text>
        )}

        <Text style={s.h2}>{L.standards}</Text>
        <Table head={[L.code, L.item, L.revision, L.status]} rows={m.standards.map((x) => [x.code, x.title, x.revision, x.status])} widths={[26, 46, 14, 14]} />

        <View style={s.footer} fixed>
          <Text>{m.meta.disclaimer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${m.meta.title} · v${m.meta.appVersion} · ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(m: ReportModel): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument m={m} />);
}
