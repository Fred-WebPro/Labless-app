import Link from "next/link";
import { HBars } from "@/components/Charts";
import { ageFrom } from "@/lib/analysis/indices";
import { countryFromCode, countryFromTimezone } from "@/lib/country";
import { fetchAll } from "@/lib/fetchAll";
import { fmtNum } from "@/lib/format";
import { SEGMENTS, SEVERITY_LABEL, SEVERITY_ORDER, isOutFlag, isOutIndex, loadHealth } from "@/lib/health";
import { adminDb } from "@/lib/supabase";

export const maxDuration = 300;

type Profile = { id: string; geo_country: string | null; timezone: string | null; device_region: string | null; locale: string | null; device_model: string | null };

const count = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
};
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

/** Health of all users together, with segments that open the matching users. Counted over each person's latest ready reading. */
export default async function HealthStats() {
  const db = adminDb();
  const [profiles, members, health] = await Promise.all([
    fetchAll<Profile>((a, b) => db.from("profiles").select("id, geo_country, timezone, device_region, locale, device_model").order("id").range(a, b)),
    fetchAll<{ id: string; sex: string | null; birth_date: string | null }>((a, b) => db.from("members").select("id, sex, birth_date").order("id").range(a, b)),
    loadHealth(),
  ]);
  const { people, byOwner } = health;
  const total = people.length;
  const withRedFlags = people.filter((p) => p.redFlags).length;
  const needsAttention = people.filter((p) => p.worst === "urgent" || p.worst === "attention").length;

  const markers = new Map<string, { name: string; tested: number; high: number; low: number }>();
  for (const p of people)
    for (const [key, t] of p.tested) {
      const m = markers.get(key) ?? { name: t.name, tested: 0, high: 0, low: 0 };
      m.tested++;
      if (t.flag === "high" || t.flag === "critical_high") m.high++;
      if (t.flag === "low" || t.flag === "critical_low") m.low++;
      markers.set(key, m);
    }
  const topMarkers = [...markers.entries()].filter(([, m]) => m.high + m.low).sort((a, b) => b[1].high + b[1].low - (a[1].high + a[1].low));

  const indices = new Map<string, { name: string; computed: number; out: number }>();
  for (const p of people)
    for (const i of p.indices) {
      const v = indices.get(i.key) ?? { name: i.name, computed: 0, out: 0 };
      v.computed++;
      if (isOutIndex(i.status)) v.out++;
      indices.set(i.key, v);
    }
  const topIndices = [...indices.entries()].filter(([, i]) => i.out).sort((a, b) => b[1].out - a[1].out);

  const tested = new Set(people.map((p) => p.memberId));
  const testedMembers = members.filter((m) => tested.has(m.id));
  const ageGroup = (birth: string | null) => {
    const age = ageFrom(birth);
    if (age == null) return "не указан";
    if (age < 18) return "до 18";
    if (age < 30) return "18–29";
    if (age < 45) return "30–44";
    if (age < 60) return "45–59";
    return "60+";
  };
  const countryOf = (p: Profile) => countryFromCode(p.geo_country) ?? countryFromTimezone(p.timezone) ?? countryFromCode(p.device_region);

  return (
    <>
      <div className="head">
        <div>
          <h1>Здоровье</h1>
          <p>Все пользователи вместе. Считается по последнему готовому анализу каждого человека; любая строка открывает список этих пользователей.</p>
        </div>
      </div>

      <div className="grid grid--stats">
        <Stat label="Людей с анализами" value={fmtNum(total)} hint={`в ${fmtNum(byOwner.size)} из ${fmtNum(profiles.length)} аккаунтов`} />
        <Stat label="Есть тревожные признаки" value={fmtNum(withRedFlags)} hint={`${pct(withRedFlags, total)} людей`} />
        <Stat label="Срочно или внимание" value={fmtNum(needsAttention)} hint={`${pct(needsAttention, total)} людей`} />
        <Stat label="Есть показатели вне нормы" value={fmtNum(people.filter((p) => [...p.tested.values()].some((t) => isOutFlag(t.flag))).length)} />
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Сегменты аккаунтов</h2>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {Object.entries(SEGMENTS).map(([key, s]) => {
            const n = profiles.filter((p) => s.test(byOwner.get(p.id))).length;
            return (
              <Link key={key} className="btn" href={`/users?seg=${key}`}>
                {s.label} · {fmtNum(n)}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Показатели вне нормы</h2>
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
                {topMarkers.map(([key, m]) => (
                  <tr key={key}>
                    <td>
                      <Link href={`/users?marker=${key}`}>{m.name}</Link>
                    </td>
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
          <HBars rows={SEVERITY_ORDER.map((s) => ({ label: SEVERITY_LABEL[s], value: people.filter((p) => p.worst === s).length }))} />
          <h2 style={{ marginTop: 18 }}>Индексы вне нормы</h2>
          {topIndices.map(([key, i]) => (
            <div className="row" key={key} style={{ justifyContent: "space-between", padding: "4px 0" }}>
              <Link href={`/users?index=${key}`}>{i.name}</Link>
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
          <h2>Страны</h2>
          <HBars rows={count(profiles, (p) => countryOf(p)?.name ?? "неизвестно").slice(0, 15)} />
          <h2 style={{ marginTop: 18 }}>Языки</h2>
          <HBars rows={count(profiles, (p) => p.locale ?? "неизвестно")} />
          <h2 style={{ marginTop: 18 }}>Телефоны</h2>
          <HBars rows={count(profiles, (p) => p.device_model ?? "неизвестно").slice(0, 12)} />
        </section>
        <section className="card">
          <h2>Возраст людей с анализами</h2>
          <HBars rows={["до 18", "18–29", "30–44", "45–59", "60+", "не указан"].map((g) => ({ label: g, value: testedMembers.filter((p) => ageGroup(p.birth_date) === g).length }))} />
          <h2 style={{ marginTop: 18 }}>Пол</h2>
          <HBars rows={count(testedMembers, (p) => (p.sex === "male" ? "Мужчины" : p.sex === "female" ? "Женщины" : "не указан"))} />
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
