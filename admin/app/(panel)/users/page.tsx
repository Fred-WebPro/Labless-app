import Link from "next/link";
import { adminDb } from "@/lib/supabase";
import { countryFromCode, countryFromTimezone } from "@/lib/country";
import { ago, fmtDate, fmtNum, fmtUsd } from "@/lib/format";
import { SEGMENTS, SEVERITY_LABEL, SEVERITY_PILL, isOutFlag, isOutIndex, loadHealth, markerName, type AccountHealth } from "@/lib/health";

type Props = { searchParams: Promise<{ q?: string; sort?: string; filter?: string; country?: string; seg?: string; marker?: string; index?: string }> };

type Stats = { user_id: string; members: number; reports: number; sessions_30d: number; events_30d: number; ai_cost: number; active_days: number };

const FILTERS: Record<string, string> = {
  all: "Все",
  active7: "Активны за 7 дней",
  inactive7: "Не заходили 7+ дней",
  with_reports: "С анализами",
  no_reports: "Без анализов",
  banned: "Заблокированные",
  admins: "Админы",
};

export default async function Users({ searchParams }: Props) {
  const { q = "", sort = "recent", filter = "all", country = "", seg = "", marker = "", index = "" } = await searchParams;
  const db = adminDb();

  let query = db.from("profiles").select("*");
  if (q.trim()) {
    const s = q.trim().replace(/[%,()]/g, "");
    query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  if (filter === "banned") query = query.not("banned_at", "is", null);
  if (filter === "admins") query = query.eq("role", "admin");
  const week = new Date(Date.now() - 7 * 86400_000).toISOString();
  if (filter === "active7") query = query.gte("last_seen_at", week);
  if (filter === "inactive7") query = query.or(`last_seen_at.lt.${week},last_seen_at.is.null`);
  query = sort === "active" ? query.order("last_seen_at", { ascending: false, nullsFirst: false }) : query.order("created_at", { ascending: false });

  const [{ data: rows }, { data: stats }, { data: tokens }, health] = await Promise.all([
    query.limit(1000),
    db.rpc("admin_user_stats"),
    db.from("push_tokens").select("user_id").eq("disabled", false),
    loadHealth(),
  ]);
  const healthOf = (id: string) => health.byOwner.get(id);
  // Choices for the marker and index filters: only what is out of range for someone.
  const markerChoices = new Map<string, string>();
  const indexChoices = new Map<string, string>();
  for (const p of health.people) {
    for (const [key, t] of p.tested) if (isOutFlag(t.flag)) markerChoices.set(key, t.name);
    for (const i of p.indices) if (isOutIndex(i.status)) indexChoices.set(i.key, i.name);
  }
  const byId = new Map(((stats ?? []) as Stats[]).map((s) => [s.user_id, s]));
  const pushIds = new Set((tokens ?? []).map((t) => t.user_id));

  const countryOf = (u: { geo_country: string | null; timezone: string | null; device_region: string | null }) =>
    countryFromCode(u.geo_country) ?? countryFromTimezone(u.timezone) ?? countryFromCode(u.device_region);
  const countries = [...new Map((rows ?? []).map((u) => countryOf(u)).filter((c) => !!c).map((c) => [c!.code, c!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));

  let users = rows ?? [];
  if (country) users = users.filter((u) => countryOf(u)?.code === country);
  if (SEGMENTS[seg]) users = users.filter((u) => SEGMENTS[seg].test(healthOf(u.id)));
  if (marker) users = users.filter((u) => healthOf(u.id)?.outMarkers.has(marker));
  if (index) users = users.filter((u) => healthOf(u.id)?.outIndices.has(index));
  if (filter === "with_reports") users = users.filter((u) => (byId.get(u.id)?.reports ?? 0) > 0);
  if (filter === "no_reports") users = users.filter((u) => (byId.get(u.id)?.reports ?? 0) === 0);
  if (sort === "cost") users = [...users].sort((a, b) => Number(byId.get(b.id)?.ai_cost ?? 0) - Number(byId.get(a.id)?.ai_cost ?? 0));
  if (sort === "reports") users = [...users].sort((a, b) => (byId.get(b.id)?.reports ?? 0) - (byId.get(a.id)?.reports ?? 0));
  const totalCost = users.reduce((s, u) => s + Number(byId.get(u.id)?.ai_cost ?? 0), 0);

  return (
    <>
      <div className="head">
        <div>
          <h1>Пользователи</h1>
          <p>
            {fmtNum(users.length)} найдено · расходы на ИИ по ним {fmtUsd(totalCost)}
          </p>
        </div>
      </div>
      <form className="filters">
        <input className="input" name="q" defaultValue={q} placeholder="Почта или имя" />
        <select className="input" name="filter" defaultValue={filter}>
          {Object.entries(FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" name="country" defaultValue={country}>
          <option value="">Все страны</option>
          {countries.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select className="input" name="seg" defaultValue={seg}>
          <option value="">Любое здоровье</option>
          {Object.entries(SEGMENTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="input" name="marker" defaultValue={marker}>
          <option value="">Любой показатель</option>
          {[...markerChoices.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v} вне нормы
              </option>
            ))}
        </select>
        <select className="input" name="index" defaultValue={index}>
          <option value="">Любой индекс</option>
          {[...indexChoices.entries()].map(([k, v]) => (
            <option key={k} value={k}>
              {v} вне нормы
            </option>
          ))}
        </select>
        <select className="input" name="sort" defaultValue={sort}>
          <option value="recent">Сначала новые</option>
          <option value="active">Недавно активные</option>
          <option value="cost">Больше расходов на ИИ</option>
          <option value="reports">Больше анализов</option>
        </select>
        <button className="btn btn--ink">Показать</button>
      </form>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Статус</th>
                <th>Здоровье</th>
                <th>Телефон</th>
                <th>Страна</th>
                <th>Язык</th>
                <th className="num">Семья</th>
                <th className="num">Анализы</th>
                <th className="num">ИИ</th>
                <th className="num">Дней актив.</th>
                <th>Пуши</th>
                <th>Был</th>
                <th>Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const s = byId.get(u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}`} prefetch>
                        {u.full_name || "Без имени"}
                      </Link>
                      {u.role === "admin" && <span className="pill pill--ink" style={{ marginLeft: 6 }}>admin</span>}
                      <div className="muted mono">{u.email}</div>
                    </td>
                    <td>{u.banned_at ? <span className="pill pill--bad">заблокирован</span> : <span className="pill pill--good">активен</span>}</td>
                    <td>
                      <HealthCell id={u.id} h={healthOf(u.id)} />
                    </td>
                    <td className="muted">
                      {u.device_model ?? u.platform ?? "—"}
                      <div style={{ fontSize: 12 }}>
                        {u.os_version ?? u.platform ?? ""}
                        {u.app_version ? ` · v${u.app_version}` : ""}
                      </div>
                    </td>
                    <td className="muted">{countryOf(u)?.name ?? "—"}</td>
                    <td className="muted">{u.locale}</td>
                    <td className="num">{fmtNum(s?.members ?? 0)}</td>
                    <td className="num">{fmtNum(s?.reports ?? 0)}</td>
                    <td className="num">{fmtUsd(s?.ai_cost)}</td>
                    <td className="num">{fmtNum(s?.active_days ?? 0)}</td>
                    <td>{pushIds.has(u.id) ? <span className="pill pill--good">вкл</span> : <span className="pill">нет</span>}</td>
                    <td className="muted">{ago(u.last_seen_at)}</td>
                    <td className="muted">{fmtDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users.length && <p className="empty">Никого не нашли</p>}
        </div>
      </section>
    </>
  );
}

function HealthCell({ id, h }: { id: string; h: AccountHealth | undefined }) {
  if (!h) return <span className="muted">—</span>;
  return (
    <Link href={`/users/${id}#health`} style={{ textDecoration: "none" }}>
      <span className={SEVERITY_PILL[h.worst] ?? "pill"}>{SEVERITY_LABEL[h.worst] ?? h.worst}</span>
      {h.redFlags ? <span className="pill pill--bad" style={{ marginLeft: 4 }}>⚠ {h.redFlags}</span> : null}
      <div className="muted" style={{ fontSize: 12 }}>
        {h.outMarkers.size ? `вне нормы: ${[...h.outMarkers].slice(0, 3).map((k) => markerName(k, k)).join(", ")}${h.outMarkers.size > 3 ? ` +${h.outMarkers.size - 3}` : ""}` : "показатели в норме"}
      </div>
    </Link>
  );
}
