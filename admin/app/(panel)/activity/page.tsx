import Link from "next/link";
import { adminDb } from "@/lib/supabase";
import { EVENT_LABEL, fmtDateTime } from "@/lib/format";

type Props = { searchParams: Promise<{ name?: string }> };

export default async function Activity({ searchParams }: Props) {
  const { name = "" } = await searchParams;
  const db = adminDb();
  let query = db.from("events").select("id, name, props, platform, app_version, created_at, user_id").order("created_at", { ascending: false }).limit(400);
  if (name) query = query.eq("name", name);
  const { data: events } = await query;
  const ids = [...new Set((events ?? []).map((e) => e.user_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <>
      <div className="head">
        <div>
          <h1>Активность</h1>
          <p>Последние 400 событий из приложения в реальном времени</p>
        </div>
      </div>
      <form className="filters">
        <select className="input" name="name" defaultValue={name}>
          <option value="">Все события</option>
          {Object.entries(EVENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn--ink">Показать</button>
      </form>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Событие</th>
                <th>Детали</th>
                <th>Платформа</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="mono muted">{fmtDateTime(e.created_at)}</td>
                  <td>{e.user_id ? <Link href={`/users/${e.user_id}`}>{who.get(e.user_id) ?? e.user_id.slice(0, 8)}</Link> : "—"}</td>
                  <td>{EVENT_LABEL[e.name] ?? e.name}</td>
                  <td className="mono muted" style={{ maxWidth: 360, overflowWrap: "anywhere" }}>
                    {e.props && Object.keys(e.props).length ? JSON.stringify(e.props) : ""}
                  </td>
                  <td className="muted">
                    {e.platform ?? ""} {e.app_version ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events?.length && <p className="empty">Событий пока нет</p>}
        </div>
      </section>
    </>
  );
}
