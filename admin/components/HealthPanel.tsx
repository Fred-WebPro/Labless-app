import Link from "next/link";
import { ageFrom } from "@/lib/analysis/indices";
import { fetchAll } from "@/lib/fetchAll";
import { RELATION_LABEL, fmtDate } from "@/lib/format";
import { adminDb } from "@/lib/supabase";

type Member = { id: string; name: string; relation: string; sex: string | null; birth_date: string | null; height_cm?: number | null; weight_kg?: number | null; waist_cm?: number | null };
type Hidden = { name: string; estimate: string; confidence: string; explanation: string };
type Step = { title: string; detail: string; kind: string; priority: string };
type Question = { id: string; question: string };
type Finding = { title: string; detail: string; severity: string };
type Index = { key: string; name: string; value: unknown; unit?: string; status: string };
type Result = { report_id: string; marker: string; name: string; value: number | null; value_text: string | null; unit: string | null; flag: string | null; ref_text: string | null };

const SEVERITY: Record<string, { label: string; pill: string; rank: number }> = {
  urgent: { label: "срочно", pill: "pill pill--bad", rank: 0 },
  attention: { label: "внимание", pill: "pill pill--bad", rank: 1 },
  watch: { label: "наблюдать", pill: "pill pill--warn", rank: 2 },
  info: { label: "инфо", pill: "pill", rank: 3 },
  good: { label: "в норме", pill: "pill pill--good", rank: 4 },
};

const FLAG: Record<string, string> = {
  low: "ниже нормы",
  high: "выше нормы",
  critical_low: "критически низко",
  critical_high: "критически высоко",
};

const abnormal = (flag: string | null) => !!flag && flag !== "normal";
const shown = (r: Result) => `${r.value ?? r.value_text ?? "—"}${r.unit ? ` ${r.unit}` : ""}`;

/** Health picture of every family member in one account: latest findings, red flags, out-of-range markers and their history. */
export async function HealthPanel({ ownerId, members }: { ownerId: string; members: Member[] }) {
  const db = adminDb();
  const [{ data: reports }, { data: analyses }, results] = await Promise.all([
    db.from("reports").select("id, member_id, collected_at, created_at").eq("owner_id", ownerId).eq("status", "ready"),
    db.from("analyses").select("report_id, summary, findings, red_flags, indices, hidden_tests, next_steps, doctor_questions, checkin_questions, checkin_answers").eq("owner_id", ownerId),
    fetchAll<Result>((from, to) => db.from("results").select("report_id, marker, name, value, value_text, unit, flag, ref_text").eq("owner_id", ownerId).order("id").range(from, to)),
  ]);

  const analysisBy = new Map((analyses ?? []).map((a) => [a.report_id, a]));
  const resultsBy = new Map<string, Result[]>();
  for (const r of results) resultsBy.set(r.report_id, [...(resultsBy.get(r.report_id) ?? []), r]);
  const dateOf = (r: { collected_at: string | null; created_at: string }) => r.collected_at ?? r.created_at;

  const people = members
    .map((m) => ({
      member: m,
      reports: (reports ?? []).filter((r) => r.member_id === m.id).sort((a, b) => dateOf(b).localeCompare(dateOf(a))),
    }))
    .filter((p) => p.reports.length);

  if (!people.length) return <p className="empty">Готовых анализов пока нет</p>;

  return (
    <>
      {people.map(({ member, reports: list }) => {
        const latest = list[0];
        const analysis = analysisBy.get(latest.id);
        const findings = ((analysis?.findings ?? []) as Finding[]).slice().sort((a, b) => (SEVERITY[a.severity]?.rank ?? 9) - (SEVERITY[b.severity]?.rank ?? 9));
        const redFlags = (analysis?.red_flags ?? []) as string[];
        const indices = ((analysis?.indices ?? []) as Index[]).filter((i) => i.status && i.status !== "normal" && i.status !== "optimal");
        const out = (resultsBy.get(latest.id) ?? []).filter((r) => abnormal(r.flag));
        const history = (marker: string) => list.slice(1).map((rep) => (resultsBy.get(rep.id) ?? []).find((r) => r.marker === marker)).filter((r): r is Result => !!r);
        const age = ageFrom(member.birth_date);
        const all = resultsBy.get(latest.id) ?? [];
        const hidden = (analysis?.hidden_tests ?? []) as Hidden[];
        const steps = (analysis?.next_steps ?? []) as Step[];
        const doctorQuestions = (analysis?.doctor_questions ?? []) as string[];
        const answers = Object.entries((analysis?.checkin_answers ?? {}) as Record<string, string>);
        const questionText = new Map(((analysis?.checkin_questions ?? []) as Question[]).map((q) => [q.id, q.question]));
        const body = [
          member.height_cm ? `рост ${member.height_cm} см` : null,
          member.weight_kg ? `вес ${member.weight_kg} кг` : null,
          member.waist_cm ? `талия ${member.waist_cm} см` : null,
          member.height_cm && member.weight_kg ? `ИМТ ${(Number(member.weight_kg) / (Number(member.height_cm) / 100) ** 2).toFixed(1)}` : null,
        ].filter(Boolean);

        return (
          <div key={member.id} style={{ padding: "14px 0", borderTop: "1px solid var(--rule)" }}>
            <h3 style={{ margin: "0 0 4px" }}>
              {member.name}{" "}
              <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
                {RELATION_LABEL[member.relation] ?? member.relation}
                {member.sex === "male" ? " · М" : member.sex === "female" ? " · Ж" : ""}
                {age != null ? ` · ${age} лет` : ""} · анализов {list.length} · последний{" "}
                <Link href={`/reports/${latest.id}`}>{fmtDate(dateOf(latest))}</Link>
              </span>
            </h3>
            {body.length ? <p className="muted" style={{ margin: "2px 0 0" }}>{body.join(" · ")}</p> : null}
            {analysis?.summary ? <p style={{ margin: "6px 0 10px" }}>{analysis.summary}</p> : null}

            {redFlags.length ? (
              <div style={{ marginBottom: 10 }}>
                {redFlags.map((f) => (
                  <div key={f} className="err">
                    ⚠ {f}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid--2">
              <div>
                <h2>Находки</h2>
                {findings.map((f, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                    <span className={SEVERITY[f.severity]?.pill ?? "pill"}>{SEVERITY[f.severity]?.label ?? f.severity}</span> <b>{f.title}</b>
                    <div className="muted">{f.detail}</div>
                  </div>
                ))}
                {!findings.length && <p className="empty">Нет находок</p>}
                {indices.length ? (
                  <>
                    <h2 style={{ marginTop: 14 }}>Индексы вне нормы</h2>
                    {indices.map((i) => (
                      <div key={i.key} className="row" style={{ justifyContent: "space-between", padding: "4px 0" }}>
                        <span>{i.name}</span>
                        <span>
                          {String(i.value)} {i.unit ?? ""} <span className={i.status === "borderline" ? "pill pill--warn" : "pill pill--bad"}>{i.status}</span>
                        </span>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
              <div>
                <h2>Показатели вне нормы ({out.length})</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Показатель</th>
                        <th className="num">Сейчас</th>
                        <th className="num">Было</th>
                        <th>Норма</th>
                        <th>Вне нормы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {out.map((r) => {
                        const past = history(r.marker);
                        const times = 1 + past.filter((p) => abnormal(p.flag)).length;
                        return (
                          <tr key={r.marker}>
                            <td>
                              {r.name} <span className={r.flag?.startsWith("critical") ? "pill pill--bad" : "pill pill--warn"}>{FLAG[r.flag ?? ""] ?? r.flag}</span>
                            </td>
                            <td className="num">{shown(r)}</td>
                            <td className="num muted">{past[0] ? shown(past[0]) : "—"}</td>
                            <td className="muted">{r.ref_text ?? "—"}</td>
                            <td className="muted">{times > 1 ? `${times} из ${1 + past.length} анализов` : "впервые"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!out.length && <p className="empty">Все показатели в норме</p>}
                </div>
              </div>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary>Все показатели последнего анализа ({all.length})</summary>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {all.map((r) => (
                      <tr key={r.marker}>
                        <td>{r.name}</td>
                        <td className="num">{shown(r)}</td>
                        <td className="muted">{r.ref_text ?? "—"}</td>
                        <td>{abnormal(r.flag) ? <span className="pill pill--bad">{FLAG[r.flag ?? ""] ?? r.flag}</span> : <span className="muted">норма</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {hidden.length ? (
              <details style={{ marginTop: 6 }}>
                <summary>Скрытые анализы — оценки по крови ({hidden.length})</summary>
                {hidden.map((h, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                    <b>{h.name}</b> <span className="pill">{h.confidence}</span> {h.estimate}
                    <div className="muted">{h.explanation}</div>
                  </div>
                ))}
              </details>
            ) : null}
            {steps.length || doctorQuestions.length ? (
              <details style={{ marginTop: 6 }}>
                <summary>Что посоветовали и вопросы врачу</summary>
                {steps.map((st, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                    <span className={st.priority === "high" ? "pill pill--bad" : "pill"}>{st.priority}</span> <b>{st.title}</b>
                    <div className="muted">{st.detail}</div>
                  </div>
                ))}
                {doctorQuestions.map((q, i) => (
                  <div key={i} className="muted" style={{ padding: "4px 0" }}>
                    ? {q}
                  </div>
                ))}
              </details>
            ) : null}
            {answers.length ? (
              <details style={{ marginTop: 6 }}>
                <summary>Ответы человека на уточняющие вопросы ({answers.length})</summary>
                {answers.map(([qid, a]) => (
                  <div key={qid} style={{ padding: "4px 0" }}>
                    {questionText.get(qid) ?? qid}: <b>{a}</b>
                  </div>
                ))}
              </details>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
