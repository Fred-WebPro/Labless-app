import Link from "next/link";
import { DailyBars, HBars } from "@/components/Charts";
import { adminDb } from "@/lib/supabase";
import { EVENT_LABEL, RELATION_LABEL, STATUS_LABEL, ago, fmtNum, statusPill } from "@/lib/format";

export default async function Dashboard() {
  const db = adminDb();
  const [{ data: totalsRows }, { data: daily }, { data: breakdown }, { data: recentReports }, { data: recentUsers }] = await Promise.all([
    db.rpc("admin_totals"),
    db.rpc("admin_daily", { p_days: 30 }),
    db.rpc("admin_breakdown"),
    db.from("reports").select("id, status, created_at, owner_id, processing_ms, members(name)").order("created_at", { ascending: false }).limit(8),
    db.from("profiles").select("id, email, full_name, created_at, platform").order("created_at", { ascending: false }).limit(8),
  ]);
  const t = (totalsRows?.[0] ?? {}) as Record<string, number | null>;
  const days = (daily ?? []) as { day: string; new_users: number; active_users: number; reports: number; ready: number; failed: number }[];
  const br = (breakdown ?? []) as { kind: string; label: string; value: number }[];
  const pick = (kind: string, labels: Record<string, string> = {}) =>
    br.filter((b) => b.kind === kind).sort((a, b) => b.value - a.value).slice(0, 10).map((b) => ({ label: labels[b.label] ?? b.label, value: Number(b.value) }));

  const successRate = t.reports ? Math.round(((t.reports_ready ?? 0) / Math.max(1, (t.reports_ready ?? 0) + (t.reports_failed ?? 0))) * 100) : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>Обзор</h1>
          <p>Всё, что происходит в Labless, за последние 30 дней</p>
        </div>
        <Link className="btn btn--pen" href="/push">
          Новая рассылка
        </Link>
      </div>

      <div className="grid grid--stats">
        <Stat label="Пользователи" value={t.users} hint={`+${fmtNum(t.users_7d)} за 7 дней`} />
        <Stat label="Активны сегодня" value={t.dau} hint={`WAU ${fmtNum(t.wau)} · MAU ${fmtNum(t.mau)}`} />
        <Stat label="Члены семей" value={t.members} />
        <Stat label="Анализы загружено" value={t.reports} hint={`${fmtNum(t.reports_processing)} в работе`} />
        <Stat label="Успешных разборов" value={successRate == null ? null : `${successRate}%`} hint={`${fmtNum(t.reports_failed)} с ошибкой`} />
        <Stat label="Среднее время разбора" value={t.avg_processing_ms ? `${Math.round(Number(t.avg_processing_ms) / 1000)} с` : null} />
        <Stat label="Устройства с пушами" value={t.push_tokens} hint={`${fmtNum(t.broadcasts)} рассылок`} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Пользователи по дням</h2>
          <DailyBars
            days={days.map((d) => d.day)}
            series={[
              { label: "Новые", color: "#d2261c", values: days.map((d) => Number(d.new_users)) },
              { label: "Активные", color: "#121212", values: days.map((d) => Number(d.active_users)) },
            ]}
          />
        </section>
        <section className="card">
          <h2>Анализы по дням</h2>
          <DailyBars
            days={days.map((d) => d.day)}
            series={[
              { label: "Готово", color: "#121212", values: days.map((d) => Number(d.ready)) },
              { label: "Ошибки", color: "#d2261c", values: days.map((d) => Number(d.failed)) },
            ]}
          />
        </section>
        <section className="card">
          <h2>Что делают пользователи (30 дней)</h2>
          <HBars rows={pick("event", EVENT_LABEL)} />
        </section>
        <section className="card">
          <h2>Платформы и языки</h2>
          <HBars rows={[...pick("platform"), ...pick("locale").map((r) => ({ ...r, label: `язык: ${r.label}` }))]} />
          <h2 style={{ marginTop: 18 }}>Кого добавляют в семью</h2>
          <HBars rows={pick("relation", RELATION_LABEL)} />
        </section>
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Новые пользователи</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {(recentUsers ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}`}>{u.full_name || u.email}</Link>
                      <div className="muted mono">{u.email}</div>
                    </td>
                    <td className="muted">{u.platform ?? "—"}</td>
                    <td className="muted num">{ago(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentUsers?.length && <p className="empty">Пока никто не зарегистрировался</p>}
          </div>
        </section>
        <section className="card">
          <h2>Последние анализы</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {(recentReports ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/reports/${r.id}`}>{(r.members as unknown as { name: string } | null)?.name ?? "—"}</Link>
                    </td>
                    <td>
                      <span className={statusPill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </td>
                    <td className="muted num">{ago(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentReports?.length && <p className="empty">Пока нет загруженных анализов</p>}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string | null | undefined; hint?: string }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <b>{typeof value === "string" ? value : fmtNum(value)}</b>
      {hint && <small>{hint}</small>}
    </div>
  );
}
