import Link from "next/link";
import { adminDb } from "@/lib/supabase";
import { STATUS_LABEL, fmtDateTime, statusPill } from "@/lib/format";

type Props = { searchParams: Promise<{ status?: string }> };

export default async function Reports({ searchParams }: Props) {
  const { status = "" } = await searchParams;
  const db = adminDb();
  let query = db
    .from("reports")
    .select("id, status, stage, created_at, processing_ms, lab_name, error, owner_id, members(name), files")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status) query = query.eq("status", status);
  const { data: reports } = await query;
  const ownerIds = [...new Set((reports ?? []).map((r) => r.owner_id))];
  const { data: owners } = ownerIds.length ? await db.from("profiles").select("id, email").in("id", ownerIds) : { data: [] };
  const emailOf = new Map((owners ?? []).map((o) => [o.id, o.email]));

  return (
    <>
      <div className="head">
        <div>
          <h1>Анализы</h1>
          <p>Все загруженные бланки и их разбор</p>
        </div>
      </div>
      <div className="filters">
        {["", "ready", "processing", "failed"].map((s) => (
          <Link key={s || "all"} href={s ? `/reports?status=${s}` : "/reports"} className={`btn ${status === s ? "btn--ink" : ""}`}>
            {s ? STATUS_LABEL[s] : "Все"}
          </Link>
        ))}
      </div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Для кого</th>
                <th>Владелец</th>
                <th>Лаборатория</th>
                <th>Страниц</th>
                <th>Статус</th>
                <th className="num">Время</th>
                <th>Загружен</th>
              </tr>
            </thead>
            <tbody>
              {(reports ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reports/${r.id}`}>{(r.members as unknown as { name: string } | null)?.name ?? "—"}</Link>
                  </td>
                  <td>
                    <Link href={`/users/${r.owner_id}`} className="mono" style={{ fontWeight: 400 }}>
                      {emailOf.get(r.owner_id) ?? r.owner_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="muted">{r.lab_name ?? "—"}</td>
                  <td className="muted">{((r.files ?? []) as unknown[]).length}</td>
                  <td>
                    <span className={statusPill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.status === "processing" && r.stage ? <span className="muted"> {r.stage}</span> : null}
                    {r.error && <div className="err" style={{ fontSize: 12 }}>{r.error}</div>}
                  </td>
                  <td className="num muted">{r.processing_ms ? `${Math.round(r.processing_ms / 1000)} с` : "—"}</td>
                  <td className="muted">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reports?.length && <p className="empty">Анализов нет</p>}
        </div>
      </section>
    </>
  );
}
