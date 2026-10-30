import { markerByKey } from "@/lib/analysis/markers";
import { fetchAll } from "@/lib/fetchAll";
import { adminDb } from "@/lib/supabase";

export const SEVERITY_ORDER = ["urgent", "attention", "watch", "info", "good"] as const;
export const SEVERITY_LABEL: Record<string, string> = { urgent: "Срочно", attention: "Внимание", watch: "Наблюдать", info: "Информация", good: "В норме" };
export const SEVERITY_PILL: Record<string, string> = { urgent: "pill pill--bad", attention: "pill pill--bad", watch: "pill pill--warn", info: "pill", good: "pill pill--good" };

export const isOutIndex = (status: string | null | undefined) => !!status && status !== "normal" && status !== "optimal";
export const isOutFlag = (flag: string | null | undefined) => !!flag && flag !== "normal";

type Report = { id: string; owner_id: string; member_id: string; collected_at: string | null; created_at: string };
type Analysis = { report_id: string; findings: { severity: string }[] | null; red_flags: string[] | null; indices: { key: string; name: string; status: string }[] | null };
type Result = { report_id: string; marker: string; name: string; flag: string | null };

/** One person's latest ready reading, reduced to what segments need. */
export type PersonHealth = {
  memberId: string;
  ownerId: string;
  reportId: string;
  worst: string;
  redFlags: number;
  tested: Map<string, { name: string; flag: string | null }>;
  indices: { key: string; name: string; status: string }[];
};

/** All people of one account together. */
export type AccountHealth = { people: number; worst: string; redFlags: number; outMarkers: Set<string>; outIndices: Set<string> };

export const markerName = (key: string, fallback: string) => markerByKey.get(key)?.name ?? fallback;
const worse = (a: string, b: string) => (SEVERITY_ORDER.indexOf(a as never) <= SEVERITY_ORDER.indexOf(b as never) ? a : b);

/** Health picture of every person from their latest ready reading. */
export async function loadHealth(): Promise<{ people: PersonHealth[]; byOwner: Map<string, AccountHealth> }> {
  const db = adminDb();
  const reports = await fetchAll<Report>((a, b) => db.from("reports").select("id, owner_id, member_id, collected_at, created_at").eq("status", "ready").order("id").range(a, b));

  const dateOf = (r: Report) => r.collected_at ?? r.created_at;
  const latest = new Map<string, Report>();
  for (const r of reports) {
    const have = latest.get(r.member_id);
    if (!have || dateOf(r) > dateOf(have)) latest.set(r.member_id, r);
  }
  const ids = [...latest.values()].map((r) => r.id);

  const analyses: Analysis[] = [];
  const results: Result[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [a, r] = await Promise.all([
      fetchAll<Analysis>((x, y) => db.from("analyses").select("report_id, findings, red_flags, indices").in("report_id", chunk).order("report_id").range(x, y)),
      fetchAll<Result>((x, y) => db.from("results").select("report_id, marker, name, flag").in("report_id", chunk).order("id").range(x, y)),
    ]);
    analyses.push(...a);
    results.push(...r);
  }
  const analysisBy = new Map(analyses.map((a) => [a.report_id, a]));
  const resultsBy = new Map<string, Result[]>();
  for (const r of results) resultsBy.set(r.report_id, [...(resultsBy.get(r.report_id) ?? []), r]);

  const people: PersonHealth[] = [...latest.values()].map((rep) => {
    const a = analysisBy.get(rep.id);
    const severities = (a?.findings ?? []).map((f) => f.severity);
    return {
      memberId: rep.member_id,
      ownerId: rep.owner_id,
      reportId: rep.id,
      worst: SEVERITY_ORDER.find((s) => severities.includes(s)) ?? "good",
      redFlags: (a?.red_flags ?? []).length,
      tested: new Map((resultsBy.get(rep.id) ?? []).map((r) => [r.marker, { name: markerName(r.marker, r.name), flag: r.flag }])),
      indices: a?.indices ?? [],
    };
  });

  const byOwner = new Map<string, AccountHealth>();
  for (const p of people) {
    const acc = byOwner.get(p.ownerId) ?? { people: 0, worst: "good", redFlags: 0, outMarkers: new Set<string>(), outIndices: new Set<string>() };
    acc.people++;
    acc.worst = worse(acc.worst, p.worst);
    acc.redFlags += p.redFlags;
    for (const [key, t] of p.tested) if (isOutFlag(t.flag)) acc.outMarkers.add(key);
    for (const i of p.indices) if (isOutIndex(i.status)) acc.outIndices.add(i.key);
    byOwner.set(p.ownerId, acc);
  }
  return { people, byOwner };
}

/** Health segments of the users list; each is a filter over AccountHealth. */
export const SEGMENTS: Record<string, { label: string; test: (h: AccountHealth | undefined) => boolean }> = {
  red_flags: { label: "Есть тревожные признаки", test: (h) => !!h && h.redFlags > 0 },
  attention: { label: "Срочно или внимание", test: (h) => !!h && (h.worst === "urgent" || h.worst === "attention") },
  watch: { label: "Наблюдать", test: (h) => h?.worst === "watch" },
  healthy: { label: "Всё в норме", test: (h) => !!h && (h.worst === "good" || h.worst === "info") && !h.outMarkers.size },
  out_any: { label: "Есть показатели вне нормы", test: (h) => !!h && h.outMarkers.size > 0 },
  no_health: { label: "Нет готовых анализов", test: (h) => !h },
};
