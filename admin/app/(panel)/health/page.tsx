import { HBars } from "@/components/Charts";
import { ageFrom } from "@/lib/analysis/indices";
import { markerByKey } from "@/lib/analysis/markers";
import { countryFromTimezone } from "@/lib/country";
import { fetchAll } from "@/lib/fetchAll";
import { fmtNum } from "@/lib/format";
import { adminDb } from "@/lib/supabase";

export const maxDuration = 300;

type Report = { id: string; member_id: string; collected_at: string | null; created_at: string };
type Analysis = { report_id: string; findings: { severity: string }[]; red_flags: string[]; indices: { key: string; name: string; status: string }[] };
type Result = { report_id: string; marker: string; name: string; flag: string | null };

const SEVERITY_LABEL: Record<string, string> = { urgent: "Срочно", attention: "Внимание", watch: "Наблюдать", info: "Только информация", good: "Всё в норме" };
const SEVERITY_ORDER = ["urgent", "attention", "watch", "info", "good"];

const count = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
};
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

/** Health of all users in aggregate: no names, only counts over each person's latest ready reading. */
export default async function HealthStats() {
  const db = adminDb();
  const [profiles, members, reports, analyses] = await Promise.all([
    fetchAll<{ id: string; timezone: string | null; locale: string | null }>((a, b) => db.from("profiles").select("id, timezone, locale").order("id").range(a, b)),
    fetchAll<{ id: string; sex: string | null; birth_date: string | null }>((a, b) => db.from("members").select("id, sex, birth_date").order("id").range(a, b)),
    fetchAll<Report>((a, b) => db.from("reports").select("id, member_id, collected_at, created_at").eq("status", "ready").order("id").range(a, b)),
    fetchAll<Analysis>((a, b) => db.from("analyses").select("report_id, findings, red_flags, indices").order("report_id").range(a, b)),
  ]);

  // Latest ready reading per person.
  const latest = new Map<string, Report>();
  const dateOf = (r: Report) => r.collected_at ?? r.created_at;
  for (const r of reports) {
    const have = latest.get(r.member_id);
    if (!have || dateOf(r) > dateOf(have)) latest.set(r.member_id, r);
  }
  const latestIds = [...latest.values()].map((r) => r.id);
  const results: Result[] = [];
  for (let i = 0; i < latestIds.length; i += 100) {
    const chunk = latestIds.slice(i, i + 100);
    results.push(...(await fetchAll<Result>((a, b) => db.from("results").select("report_id, marker, name, flag").in("report_id", chunk).order("id").range(a, b))));
  }

  const people = members.filter((m) => latest.has(m.id));
  const total = people.length;
  const analysisBy = new Map(analyses.map((a) => [a.report_id, a]));
  const latestAnalyses = latestIds.map((id) => analysisBy.get(id)).filter((a): a is Analysis => !!a);

  const worst = latestAnalyses.map((a) => SEVERITY_ORDER.find((s) => (a.findings ?? []).some((f) => f.severity === s)) ?? "good");
  const withRedFlags = latestAnalyses.filter((a) => (a.red_flags ?? []).length).length;
  const needsAttention = worst.filter((s) => s === "urgent" || s === "attention").length;

  // Out-of-range markers: share of people tested for the marker whose latest value is outside the range.
  const markers = new Map<string, { name: string; tested: number; high: number; low: number }>();
  for (const r of results) {
    const m = markers.get(r.marker) ?? { name: markerByKey.get(r.marker)?.name ?? r.name, tested: 0, high: 0, low: 0 };
    m.tested++;
    if (r.flag === "high" || r.flag === "critical_high") m.high++;
    if (r.flag === "low" || r.flag === "critical_low") m.low++;
    markers.set(r.marker, m);
  }
  const topMarkers = [...markers.values()].filter((m) => m.high + m.low).sort((a, b) => b.high + b.low - (a.high + a.low)).slice(0, 25);

  const indices = new Map<string, { name: string; computed: number; out: number }>();
  for (const a of latestAnalyses)
    for (const i of a.indices ?? []) {
      const v = indices.get(i.key) ?? { name: i.name, computed: 0, out: 0 };
      v.computed++;
      if (i.status && i.status !== "normal") v.out++;
      indices.set(i.key, v);
    }
  const topIndices = [...indices.values()].filter((i) => i.out).sort((a, b) => b.out - a.out);

  const ageGroup = (birth: string | null) => {
    const age = ageFrom(birth);
    if (age == null) return "не указан";
    if (age < 18) return "до 18";
    if (age < 30) return "18–29";
    if (age < 45) return "30–44";
    if (age < 60) return "45–59";
    return "60+";
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Здоровье</h1>
          <p>Сводно по всем пользователям, без имён. Считается по последнему готовому анализу каждого человека.</p>
        </div>
      </div>

      <div className="grid grid--stats">
        <Stat label="Людей с анализами" value={fmtNum(total)} hint={`в ${fmtNum(profiles.length)} аккаунтах`} />
        <Stat label="Есть тревожные признаки" value={fmtNum(withRedFlags)} hint={`${pct(withRedFlags, total)} людей`} />
        <Stat label="Нужно внимание врача" value={fmtNum(needsAttention)} hint={`${pct(needsAttention, total)} людей · находки «срочно» или «внимание»`} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Показатели вне нормы чаще всего</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Показатель</th>
                  <th className="num">Выше</th>
                  <th className="num">Ниже</th>
                  <th className="num">Вне нормы</th>
                </tr>
              </thead>
              <tbody>
                {topMarkers.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td className="num">{fmtNum(m.high)}</td>
                    <td className="num">{fmtNum(m.low)}</td>
                    <td className="num">
                      {pct(m.high + m.low, m.tested)} <span className="muted">из {fmtNum(m.tested)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!topMarkers.length && <p className="empty">Пока нет данных</p>}
          </div>
        </section>
        <section className="card">
          <h2>Самая серьёзная находка у человека</h2>
          <HBars rows={SEVERITY_ORDER.map((s) => ({ label: SEVERITY_LABEL[s], value: worst.filter((w) => w === s).length }))} />
          <h2 style={{ marginTop: 18 }}>Индексы вне нормы</h2>
          {topIndices.map((i) => (
            <div className="row" key={i.name} style={{ justifyContent: "space-between", padding: "4px 0" }}>
              <span>{i.name}</span>
              <span>
                {fmtNum(i.out)} <span className="muted">· {pct(i.out, i.computed)} из {fmtNum(i.computed)}</span>
              </span>
            </div>
          ))}
          {!topIndices.length && <p className="empty">Пока нет данных</p>}
        </section>
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Страны (по часовому поясу телефона)</h2>
          <HBars rows={count(profiles, (p) => countryFromTimezone(p.timezone)?.name ?? "неизвестно").slice(0, 15)} />
          <h2 style={{ marginTop: 18 }}>Языки</h2>
          <HBars rows={count(profiles, (p) => p.locale ?? "неизвестно")} />
        </section>
        <section className="card">
          <h2>Возраст людей с анализами</h2>
          <HBars rows={["до 18", "18–29", "30–44", "45–59", "60+", "не указан"].map((g) => ({ label: g, value: people.filter((p) => ageGroup(p.birth_date) === g).length }))} />
          <h2 style={{ marginTop: 18 }}>Пол</h2>
          <HBars rows={count(people, (p) => (p.sex === "male" ? "Мужчины" : p.sex === "female" ? "Женщины" : "не указан"))} />
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <b>{value}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}
