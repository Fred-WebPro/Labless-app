import Link from "next/link";
import { notFound } from "next/navigation";
import { PushComposer } from "@/components/PushComposer";
import { adminDb } from "@/lib/supabase";
import { EVENT_LABEL, RELATION_LABEL, STATUS_LABEL, ago, fmtDate, fmtDateTime, fmtNum, statusPill } from "@/lib/format";
import { ageFrom } from "@/lib/analysis/indices";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const { data: profile } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) notFound();

  const [{ data: members }, { data: reports }, { data: events }, { data: tokens }, { data: inbox }, { data: auth }] = await Promise.all([
    db.from("members").select("*").eq("owner_id", id).order("created_at"),
    db.from("reports").select("id, status, created_at, processing_ms, member_id, lab_name, error").eq("owner_id", id).order("created_at", { ascending: false }).limit(100),
    db.from("events").select("id, name, props, platform, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("push_tokens").select("*").eq("user_id", id),
    db.from("inbox").select("id, title, read_at, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
    db.auth.admin.getUserById(id),
  ]);
  const memberName = new Map((members ?? []).map((m) => [m.id, m.name]));
  const opens = (events ?? []).filter((e) => e.name === "app_open");
  const lastSignIn = auth?.user?.last_sign_in_at ?? null;

  return (
    <>
      <div className="head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/users">← Пользователи</Link>
          </p>
          <h1>{profile.full_name || profile.email}</h1>
          <p className="mono">{profile.email}</p>
        </div>
      </div>

      <div className="grid grid--stats">
        <Mini label="Члены семьи" value={members?.length ?? 0} />
        <Mini label="Анализы" value={reports?.length ?? 0} />
        <Mini label="Открытий (посл. 200 событий)" value={opens.length} />
        <Mini label="Устройств для пушей" value={(tokens ?? []).filter((t) => !t.disabled).length} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Профиль</h2>
          <dl className="kv">
            <dt>Роль</dt>
            <dd>{profile.role}</dd>
            <dt>Язык</dt>
            <dd>{profile.locale}</dd>
            <dt>Платформа</dt>
            <dd>
              {profile.platform ?? "—"} {profile.device_model ? `· ${profile.device_model}` : ""}
            </dd>
            <dt>Версия</dt>
            <dd>{profile.app_version ?? "—"}</dd>
            <dt>Уведомления</dt>
            <dd>{profile.notifications_enabled ? "включены" : "выключены"}</dd>
            <dt>Регистрация</dt>
            <dd>{fmtDateTime(profile.created_at)}</dd>
            <dt>Последний вход</dt>
            <dd>{fmtDateTime(lastSignIn)}</dd>
            <dt>Был в приложении</dt>
            <dd>{ago(profile.last_seen_at)}</dd>
            <dt>ID</dt>
            <dd className="mono">{profile.id}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Отправить пуш этому пользователю</h2>
          <PushComposer fixedUserId={id} />
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Семья</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Кто</th>
                <th>Пол</th>
                <th>Возраст</th>
                <th className="num">Анализы</th>
                <th>Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{RELATION_LABEL[m.relation] ?? m.relation}</td>
                  <td className="muted">{m.sex === "male" ? "М" : m.sex === "female" ? "Ж" : "—"}</td>
                  <td className="muted">{ageFrom(m.birth_date) ?? "—"}</td>
                  <td className="num">{(reports ?? []).filter((r) => r.member_id === m.id).length}</td>
                  <td className="muted">{fmtDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!members?.length && <p className="empty">Пока никого не добавил</p>}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Анализы</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Для кого</th>
                <th>Лаборатория</th>
                <th>Статус</th>
                <th className="num">Время</th>
                <th>Загружен</th>
              </tr>
            </thead>
            <tbody>
              {(reports ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reports/${r.id}`}>{memberName.get(r.member_id) ?? "—"}</Link>
                  </td>
                  <td className="muted">{r.lab_name ?? "—"}</td>
                  <td>
                    <span className={statusPill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.error && <div className="err" style={{ fontSize: 12 }}>{r.error}</div>}
                  </td>
                  <td className="num muted">{r.processing_ms ? `${Math.round(r.processing_ms / 1000)} с` : "—"}</td>
                  <td className="muted">{fmtDateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reports?.length && <p className="empty">Анализов пока нет</p>}
        </div>
      </section>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Действия в приложении</h2>
          <div className="timeline">
            {(events ?? []).map((e) => (
              <div key={e.id}>
                <span className="muted mono">{fmtDateTime(e.created_at)}</span>
                <span>
                  {EVENT_LABEL[e.name] ?? e.name}
                  {e.name === "screen_view" && typeof e.props?.path === "string" ? <span className="muted mono"> {e.props.path}</span> : null}
                  {e.platform ? <span className="muted"> · {e.platform}</span> : null}
                </span>
              </div>
            ))}
          </div>
          {!events?.length && <p className="empty">Событий пока нет</p>}
        </section>
        <section className="card">
          <h2>Устройства</h2>
          <div className="timeline">
            {(tokens ?? []).map((t) => (
              <div key={t.token}>
                <span className="muted">{t.platform ?? "—"}</span>
                <span className="mono" style={{ overflowWrap: "anywhere" }}>
                  {t.device_name ?? ""} {t.disabled ? "(отключено)" : ""}
                  <br />
                  {t.token}
                </span>
              </div>
            ))}
          </div>
          {!tokens?.length && <p className="empty">Пуши не включены</p>}
          <h2 style={{ marginTop: 18 }}>Входящие уведомления</h2>
          <div className="timeline">
            {(inbox ?? []).map((n) => (
              <div key={n.id}>
                <span className="muted mono">{fmtDateTime(n.created_at)}</span>
                <span>
                  {n.title} {n.read_at ? <span className="pill pill--good">прочитано</span> : <span className="pill">не прочитано</span>}
                </span>
              </div>
            ))}
          </div>
          {!inbox?.length && <p className="empty">Уведомлений не было</p>}
        </section>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <b>{fmtNum(value)}</b>
    </div>
  );
}
