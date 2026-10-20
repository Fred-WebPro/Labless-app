import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { fill, formatDate, formatNumber, type Dict, type Locale } from "@/i18n";
import type { Delta } from "@/lib/compare";
import { outOfRange } from "@/lib/compare";
import { ageOf } from "@/lib/format";
import type { Analysis, Member, Report, Result } from "@/lib/types";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Input = { t: Dict; locale: Locale; member: Member | undefined; report: Report; analysis: Analysis; results: Result[]; deltas: Delta[] };

function html({ t, locale, member, report, analysis, results, deltas }: Input) {
  const d = t.doctorPdf;
  const age = ageOf(member?.birth_date ?? null);
  const who = [
    member?.name,
    age != null ? fill(t.member.age, { n: age }) : null,
    member?.sex ? (member.sex === "male" ? t.onboarding.male : t.onboarding.female) : null,
  ].filter(Boolean).join(" · ");
  const meta = [fill(t.report.collected, { date: formatDate(report.collected_at ?? report.created_at, locale) }), report.lab_name].filter(Boolean).join(" · ");
  const num = (v: number | null | undefined) => esc(formatNumber(v, locale));
  const dir = (x: Delta) => (x.direction === "better" ? d.better : x.direction === "worse" ? d.worse : x.direction === "stable" ? d.stable : d.moved);

  const section = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : "");
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "");

  const values = results.length
    ? `<table><tr><th>${esc(d.marker)}</th><th>${esc(d.result)}</th><th>${esc(d.range)}</th></tr>${results
        .map((r) => {
          const flagged = outOfRange(r);
          const value = r.value != null ? num(Number(r.value)) : esc(r.value_text ?? "—");
          return `<tr class="${flagged ? "flag" : ""}"><td>${esc(r.name)}</td><td>${value} ${esc(r.unit)}${flagged && r.flag ? ` · ${esc(t.report.flags[r.flag])}` : ""}</td><td>${esc(r.ref_text)}</td></tr>`;
        })
        .join("")}</table>`
    : "";

  const changes = deltas.length
    ? `<table><tr><th>${esc(d.marker)}</th><th>${esc(fill(d.before, { date: formatDate(deltas[0].prevDate, locale) }))}</th><th>${esc(d.now)}</th><th></th></tr>${deltas
        .map((x) => `<tr class="${x.direction === "worse" ? "flag" : ""}"><td>${esc(x.name)}</td><td>${num(x.prev)}</td><td>${num(x.now)} ${esc(x.unit)}</td><td>${esc(dir(x))} (${x.pct > 0 ? "+" : ""}${Math.round(x.pct)}%)</td></tr>`)
        .join("")}</table>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 36px; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #121212; font-size: 11.5px; line-height: 1.45; }
    .brand { color: #D2261C; font-weight: 700; font-size: 13px; letter-spacing: .02em; }
    h1 { font-size: 20px; margin: 4px 0 2px; }
    h2 { font-size: 13px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1.5px solid #121212; }
    .meta { color: #4F4F49; }
    .summary { font-size: 13px; margin-top: 12px; }
    .red { border: 1.5px solid #D2261C; color: #A51D15; padding: 8px 10px; border-radius: 6px; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 600; color: #4F4F49; border-bottom: 1px solid #CFCFC8; padding: 4px 6px; }
    td { border-bottom: 1px solid #E6E6E1; padding: 4px 6px; vertical-align: top; }
    tr.flag td { color: #D2261C; font-weight: 600; }
    ul { margin: 0; padding-left: 18px; } li { margin: 3px 0; }
    .muted { color: #8A8A82; font-size: 10px; margin-top: 22px; }
  </style></head><body>
    <div class="brand">LABLESS</div>
    <h1>${esc(d.title)}</h1>
    <div class="meta">${esc(who)}</div>
    <div class="meta">${esc(meta)}</div>
    <div class="summary">${esc(analysis.summary)}</div>
    ${analysis.red_flags?.length ? `<div class="red"><b>${esc(t.report.redFlags)}:</b> ${analysis.red_flags.map(esc).join(" ")}</div>` : ""}
    ${section(t.report.tabs.findings, list(analysis.findings.map((f) => `<b>${esc(f.title)}.</b> ${esc(f.detail)}`)))}
    ${section(d.changes, changes)}
    ${section(t.report.values, values)}
    ${section(t.report.indices, list((analysis.indices ?? []).map((ix) => `${esc((t.indices as Record<string, { name: string } | undefined>)[ix.key]?.name ?? ix.name)}: <b>${num(ix.value)}${ix.unit ? ` ${esc(ix.unit)}` : ""}</b> · ${esc(t.report.indexStatus[ix.status])}`)))}
    ${section(t.report.tabs.hidden, list(analysis.hidden_tests.map((h) => `<b>${esc(h.name)}:</b> ${esc(h.estimate)} (${esc(t.report.confidence[h.confidence])})`)))}
    ${section(t.report.doctor, list((analysis.doctor_questions ?? []).map(esc)))}
    <div class="muted">${esc(d.footer)} ${esc(t.common.notDiagnosis)}</div>
  </body></html>`;
}

/** Builds a one-page summary a doctor can read in a minute and opens the share sheet. */
export async function shareDoctorPdf(input: Input) {
  const markup = html(input);
  if (Platform.OS === "web") {
    await Print.printAsync({ html: markup });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html: markup });
  // A readable file name, so it arrives in Telegram or Mail as "Labless – Anna – 14 Oct 2026.pdf".
  let shareUri = uri;
  try {
    const date = formatDate(input.report.collected_at ?? input.report.created_at, input.locale).replace(/[\\/:*?"<>|]/g, "-");
    const name = `Labless – ${(input.member?.name ?? "").replace(/[\\/:*?"<>|]/g, "")} – ${date}.pdf`;
    const dest = new File(Paths.cache, name);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    shareUri = dest.uri;
  } catch {
    // keep the generated name
  }
  await Sharing.shareAsync(shareUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: input.t.doctorPdf.title });
}
