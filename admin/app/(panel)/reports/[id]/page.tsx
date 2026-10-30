import Link from "next/link";
import { notFound } from "next/navigation";
import { logAdmin } from "@/lib/audit";
import { requireAdmin } from "@/lib/session";
import { adminDb } from "@/lib/supabase";
import { STATUS_LABEL, fmtDateTime, fmtNum, fmtUsd, statusPill } from "@/lib/format";
import { RerunButton } from "@/components/UserActions";

export const maxDuration = 300;

type Json = Record<string, unknown>;

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const { data: report } = await db.from("reports").select("*, members(name, relation, sex, birth_date)").eq("id", id).maybeSingle();
  if (!report) notFound();
  await logAdmin((await requireAdmin()).id, report.owner_id, "view_report", { report_id: id });
  const [{ data: analysis }, { data: results }, { data: owner }, { data: usage }] = await Promise.all([
    db.from("analyses").select("*").eq("report_id", id).maybeSingle(),
    db.from("results").select("*").eq("report_id", id).order("id"),
    db.from("profiles").select("email").eq("id", report.owner_id).maybeSingle(),
    db.from("ai_usage").select("*").eq("report_id", id).order("created_at"),
  ]);
  const cost = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
  const files = (report.files ?? []) as { path: string; type: string }[];
  const signed = files.length
    ? (await db.storage.from("reports").createSignedUrls(files.map((f) => f.path), 600)).data ?? []
    : [];
  const member = report.members as unknown as { name: string } | null;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : []);

  return (
    <>
      <div className="head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/reports">← Анализы</Link>
          </p>
          <h1>{member?.name ?? "Анализ"}</h1>
          <p>
            <Link href={`/users/${report.owner_id}`}>{owner?.email}</Link> · {fmtDateTime(report.created_at)} ·{" "}
            <span className={statusPill(report.status)}>{STATUS_LABEL[report.status]}</span>
          </p>
          {report.error && <p className="err">{report.error}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">ИИ: {fmtUsd(cost)}</span>
            <span className="pill">{(usage ?? []).length} вызовов</span>
            <RerunButton reportId={id} />
          </div>
        </div>
      </div>

      <div className="grid grid--2">
        <section className="card">
          <h2>Сводка</h2>
          {analysis ? (
            <>
              <p style={{ marginTop: 0 }}>{analysis.summary}</p>
              <p className="muted">Модель: {analysis.model} · язык: {analysis.locale}</p>
            </>
          ) : (
            <p className="empty">Разбора ещё нет</p>
          )}
          <h2 style={{ marginTop: 18 }}>Вызовы ИИ</h2>
          {(usage ?? []).map((u) => (
            <div key={u.id} className="muted" style={{ fontSize: 13 }}>
              {fmtDateTime(u.created_at)} · {u.kind === "extraction" ? "чтение" : "интерпретация"} · {u.model} · {u.speed === "fast" ? "быстро" : "обычно"} · {fmtNum(u.input_tokens)}/{fmtNum(u.output_tokens)} ток. · {fmtUsd(u.cost_usd)}
            </div>
          ))}
          {!usage?.length && <p className="muted">Нет записей</p>}
          <h2 style={{ marginTop: 18 }}>Файлы</h2>
          <div className="row">
            {signed.map((s, i) =>
              s.signedUrl ? (
                <a key={i} className="btn" href={s.signedUrl} target="_blank" rel="noreferrer">
                  Страница {i + 1}
                </a>
              ) : null,
            )}
          </div>
        </section>
        <section className="card">
          <h2>Индексы</h2>
          <table>
            <tbody>
              {list(analysis?.indices).map((i) => (
                <tr key={String(i.key)}>
                  <td>{String(i.name)}</td>
                  <td className="num">
                    {String(i.value)} {String(i.unit ?? "")}
                  </td>
                  <td>
                    <span className={i.status === "high" || i.status === "low" ? "pill pill--bad" : i.status === "borderline" ? "pill pill--warn" : "pill pill--good"}>
                      {String(i.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list(analysis?.indices).length && <p className="empty">Нет данных для индексов</p>}
        </section>
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Находки</h2>
          {list(analysis?.findings).map((f, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
              <b>{String(f.title)}</b> <span className="pill">{String(f.severity)}</span>
              <div className="muted">{String(f.detail)}</div>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Скрытые анализы</h2>
          {list(analysis?.hidden_tests).map((h, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
              <b>{String(h.name)}</b> <span className="pill">{String(h.confidence)}</span>
              <div>{String(h.estimate)}</div>
              <div className="muted">{String(h.explanation)}</div>
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Распознанные значения ({results?.length ?? 0})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Ключ</th>
                <th className="num">Значение</th>
                <th>Норма в бланке</th>
                <th>Флаг</th>
              </tr>
            </thead>
            <tbody>
              {(results ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono muted">{r.marker}</td>
                  <td className="num">
                    {r.value ?? r.value_text} <span className="muted">{r.unit}</span>
                  </td>
                  <td className="muted">{r.ref_text ?? "—"}</td>
                  <td>{r.flag && r.flag !== "normal" ? <span className="pill pill--bad">{r.flag}</span> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
