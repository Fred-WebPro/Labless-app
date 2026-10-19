import Link from "next/link";
import { adminDb } from "@/lib/supabase";
import { ago, fmtDate, fmtNum } from "@/lib/format";

type Props = { searchParams: Promise<{ q?: string; sort?: string }> };

export default async function Users({ searchParams }: Props) {
  const { q = "", sort = "recent" } = await searchParams;
  const db = adminDb();

  let query = db.from("profiles").select("id, email, full_name, locale, platform, app_version, created_at, last_seen_at, role, notifications_enabled");
  if (q.trim()) {
    const s = q.trim().replace(/[%,()]/g, "");
    query = query.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  query = sort === "active" ? query.order("last_seen_at", { ascending: false, nullsFirst: false }) : query.order("created_at", { ascending: false });
  const [{ data: users }, { data: stats }, { data: tokens }] = await Promise.all([
    query.limit(500),
    db.rpc("admin_user_stats"),
    db.from("push_tokens").select("user_id").eq("disabled", false),
  ]);
  const byId = new Map(((stats ?? []) as { user_id: string; members: number; reports: number; sessions_30d: number; events_30d: number }[]).map((s) => [s.user_id, s]));
  const pushIds = new Set((tokens ?? []).map((t) => t.user_id));

  return (
    <>
      <div className="head">
        <div>
          <h1>Пользователи</h1>
          <p>{fmtNum(users?.length ?? 0)} найдено</p>
        </div>
      </div>
      <form className="filters">
        <input className="input" name="q" defaultValue={q} placeholder="Почта или имя" />
        <select className="input" name="sort" defaultValue={sort}>
          <option value="recent">Сначала новые</option>
          <option value="active">Недавно активные</option>
        </select>
        <button className="btn btn--ink">Найти</button>
      </form>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Платформа</th>
                <th>Язык</th>
                <th className="num">Семья</th>
                <th className="num">Анализы</th>
                <th className="num">Сессии 30д</th>
                <th>Пуши</th>
                <th>Был</th>
                <th>Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const s = byId.get(u.id);
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}`}>{u.full_name || "Без имени"}</Link>
                      {u.role === "admin" && <span className="pill pill--ink" style={{ marginLeft: 6 }}>admin</span>}
                      <div className="muted mono">{u.email}</div>
                    </td>
                    <td className="muted">
                      {u.platform ?? "—"}
                      {u.app_version ? ` · ${u.app_version}` : ""}
                    </td>
                    <td className="muted">{u.locale}</td>
                    <td className="num">{fmtNum(s?.members ?? 0)}</td>
                    <td className="num">{fmtNum(s?.reports ?? 0)}</td>
                    <td className="num">{fmtNum(s?.sessions_30d ?? 0)}</td>
                    <td>{pushIds.has(u.id) ? <span className="pill pill--good">вкл</span> : <span className="pill">нет</span>}</td>
                    <td className="muted">{ago(u.last_seen_at)}</td>
                    <td className="muted">{fmtDate(u.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!users?.length && <p className="empty">Никого не нашли</p>}
        </div>
      </section>
    </>
  );
}
