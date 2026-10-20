import Link from "next/link";
import { notFound } from "next/navigation";
import { PushComposer } from "@/components/PushComposer";
import { NoteEditor, RerunButton, UserActions } from "@/components/UserActions";
import { adminDb, adminEmails } from "@/lib/supabase";
import { ADMIN_ACTION_LABEL, EVENT_LABEL, RELATION_LABEL, STATUS_LABEL, ago, fmtDate, fmtDateTime, fmtNum, fmtUsd, statusPill } from "@/lib/format";
import { ageFrom } from "@/lib/analysis/indices";

export const maxDuration = 300;

type Item = { at: string; kind: "event" | "admin" | "inbox" | "report"; text: string; detail?: string };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const { data: profile } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) notFound();

  const [
    { data: members },
    { data: reports },
    { data: events },
    { data: tokens },
    { data: inbox },
    { data: auth },
    { data: usage },
    { data: actions },
    { count: eventsTotal },
  ] = await Promise.all([
    db.from("members").select("*").eq("owner_id", id).order("created_at"),
    db.from("reports").select("id, status, stage, created_at, processing_ms, member_id, lab_name, error, files").eq("owner_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("events").select("id, name, props, platform, app_version, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(300),
    db.from("push_tokens").select("*").eq("user_id", id),
    db.from("inbox").select("id, title, body, read_at, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    db.auth.admin.getUserById(id),
    db.from("ai_usage").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(300),
    db.from("admin_actions").select("*").eq("target_user", id).order("created_at", { ascending: false }).limit(50),
    db.from("events").select("id", { count: "exact", head: true }).eq("user_id", id),
  ]);

  const memberName = new Map((members ?? []).map((m) => [m.id, m.name]));
  const costByReport = new Map<string, number>();
  for (const u of usage ?? []) if (u.report_id) costByReport.set(u.report_id, (costByReport.get(u.report_id) ?? 0) + Number(u.cost_usd));
  const totalCost = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
  const cost30 = (usage ?? []).filter((u) => Date.now() - new Date(u.created_at).getTime() < 30 * 86400_000).reduce((s, u) => s + Number(u.cost_usd), 0);
  const tokensIn = (usage ?? []).reduce((s, u) => s + u.input_tokens + u.cache_read_tokens + u.cache_write_tokens, 0);
  const tokensOut = (usage ?? []).reduce((s, u) => s + u.output_tokens, 0);
  const activeDays = new Set((events ?? []).map((e) => e.created_at.slice(0, 10))).size;
  const opens30 = (events ?? []).filter((e) => e.name === "app_open" && Date.now() - new Date(e.created_at).getTime() < 30 * 86400_000).length;
  const ready = (reports ?? []).filter((r) => r.status === "ready").length;
  const failed = (reports ?? []).filter((r) => r.status === "failed").length;
  const banned = !!profile.banned_at;
  const isOwner = adminEmails().includes((profile.email ?? "").toLowerCase());
  const lastPlatform = (events ?? []).find((e) => e.platform && e.platform !== "server");

  const timeline: Item[] = [
    ...(events ?? [])
      .filter((e) => e.name !== "screen_view")
      .map((e) => ({
        at: e.created_at,
        kind: "event" as const,
        text: EVENT_LABEL[e.name] ?? e.name,
        detail: [e.platform, e.props?.status, e.props?.code].filter(Boolean).join(" · "),
      })),
    ...(actions ?? []).map((a) => ({ at: a.created_at, kind: "admin" as const, text: ADMIN_ACTION_LABEL[a.action] ?? a.action, detail: a.details?.reason ?? "" })),
    ...(inbox ?? []).map((n) => ({ at: n.created_at, kind: "inbox" as const, text: `Уведомление: ${n.title}`, detail: n.read_at ? "прочитано" : "не прочитано" })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 150);

  const screens = new Map<string, number>();
  for (const e of events ?? []) {
    if (e.name !== "screen_view" || typeof e.props?.path !== "string") continue;
    const key = String(e.props.path).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id");
    screens.set(key, (screens.get(key) ?? 0) + 1);
  }

  return (
    <>
      <div className="head">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/users">← Пользователи</Link>
          </p>
          <h1>
            {profile.full_name || profile.email}{" "}
            {profile.role === "admin" ? <span className="pill pill--ink">admin</span> : null}{" "}
            {banned ? <span className="pill pill--bad">заблокирован</span> : <span className="pill pill--good">активен</span>}
          </h1>
          <p className="mono">{profile.email}</p>
          {banned ? (
            <p className="err" style={{ margin: "6px 0 0" }}>
              Заблокирован {fmtDateTime(profile.banned_at)}
              {profile.ban_reason ? `: ${profile.ban_reason}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {!isOwner ? (
        <section className="card" style={{ marginBottom: 14 }}>
          <UserActions userId={id} banned={banned} role={profile.role} email={profile.email ?? ""} />
        </section>
      ) : null}

      <div className="grid grid--stats">
        <Mini label="Потрачено на ИИ" value={fmtUsd(totalCost)} hint={`${fmtUsd(cost30)} за 30 дней`} />
        <Mini label="Токенов" value={fmtNum(tokensIn + tokensOut)} hint={`вход ${fmtNum(tokensIn)} · выход ${fmtNum(tokensOut)}`} />
        <Mini label="Анализы" value={fmtNum(reports?.length ?? 0)} hint={`${ready} готово · ${failed} с ошибкой`} />
        <Mini label="Члены семьи" value={fmtNum(members?.length ?? 0)} />
        <Mini label="Дней с активностью" value={fmtNum(activeDays)} hint={`${opens30} открытий за 30 дней`} />
        <Mini label="Был в приложении" value={ago(profile.last_seen_at)} hint={`всего событий ${fmtNum(eventsTotal ?? 0)}`} />
      </div>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Профиль</h2>
          <dl className="kv">
            <dt>Язык</dt>
            <dd>{profile.locale}</dd>
            <dt>Устройство</dt>
            <dd>
              {profile.platform ?? "—"} {profile.device_model ? `· ${profile.device_model}` : ""} {profile.app_version ? `· v${profile.app_version}` : ""}
            </dd>
            <dt>Последняя платформа</dt>
            <dd>{lastPlatform?.platform ?? "—"}</dd>
            <dt>Уведомления</dt>
            <dd>{profile.notifications_enabled ? "включены" : "выключены"} · пуш-устройств {(tokens ?? []).filter((t) => !t.disabled).length}</dd>
            <dt>Регистрация</dt>
            <dd>{fmtDateTime(profile.created_at)}</dd>
            <dt>Последний вход</dt>
            <dd>{fmtDateTime(auth?.user?.last_sign_in_at)}</dd>
            <dt>Почта подтверждена</dt>
            <dd>{auth?.user?.email_confirmed_at ? "да" : "нет"}</dd>
            <dt>ID</dt>
            <dd className="mono">{profile.id}</dd>
          </dl>
          <h2 style={{ marginTop: 18 }}>Заметка</h2>
          <NoteEditor userId={id} initial={profile.admin_note ?? ""} />
        </section>
        <section className="card" id="push">
          <h2>Личное уведомление</h2>
          <PushComposer fixedUserId={id} />
          <h2 style={{ marginTop: 18 }}>Что смотрит чаще всего</h2>
          {[...screens.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([path, n]) => (
              <div className="hbar" key={path}>
                <span className="mono">{path}</span>
                <span className="hbar__track">
                  <span className="hbar__fill" style={{ display: "block", width: `${(n / Math.max(1, ...screens.values())) * 100}%` }} />
                </span>
                <span className="num">{n}</span>
              </div>
            ))}
          {!screens.size && <p className="empty">Нет данных</p>}
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
                <th>Страниц</th>
                <th>Статус</th>
                <th className="num">Время</th>
                <th className="num">Стоимость ИИ</th>
                <th>Загружен</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(reports ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reports/${r.id}`}>{memberName.get(r.member_id) ?? "—"}</Link>
                  </td>
                  <td className="muted">{r.lab_name ?? "—"}</td>
                  <td className="muted">{((r.files ?? []) as unknown[]).length}</td>
                  <td>
                    <span className={statusPill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    {r.error && <div className="err" style={{ fontSize: 12 }}>{r.error}</div>}
                  </td>
                  <td className="num muted">{r.processing_ms ? `${Math.round(r.processing_ms / 1000)} с` : "—"}</td>
                  <td className="num">{fmtUsd(costByReport.get(r.id))}</td>
                  <td className="muted">{fmtDateTime(r.created_at)}</td>
                  <td>
                    <RerunButton reportId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reports?.length && <p className="empty">Анализов пока нет</p>}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>Вызовы ИИ</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Этап</th>
                <th>Модель</th>
                <th>Скорость</th>
                <th className="num">Вход</th>
                <th className="num">Выход</th>
                <th className="num">Длительность</th>
                <th className="num">Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {(usage ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="mono muted">{fmtDateTime(u.created_at)}</td>
                  <td>{u.kind === "extraction" ? "Чтение бланка" : "Интерпретация"}</td>
                  <td className="mono">{u.model}</td>
                  <td className="muted">{u.speed === "fast" ? "быстрая" : "обычная"}</td>
                  <td className="num">{fmtNum(u.input_tokens + u.cache_read_tokens + u.cache_write_tokens)}</td>
                  <td className="num">{fmtNum(u.output_tokens)}</td>
                  <td className="num muted">{u.duration_ms ? `${Math.round(u.duration_ms / 1000)} с` : "—"}</td>
                  <td className="num">{fmtUsd(u.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!usage?.length && <p className="empty">Вызовов ИИ не было</p>}
        </div>
      </section>

      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Лента событий</h2>
          <div className="timeline">
            {timeline.map((e, i) => (
              <div key={i}>
                <span className="muted mono">{fmtDateTime(e.at)}</span>
                <span>
                  {e.kind === "admin" ? <span className="pill pill--ink">админ</span> : e.kind === "inbox" ? <span className="pill">уведомление</span> : null} {e.text}
                  {e.detail ? <span className="muted"> · {e.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
          {!timeline.length && <p className="empty">Событий пока нет</p>}
        </section>
        <section className="card">
          <h2>Устройства для пушей</h2>
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
          <h2 style={{ marginTop: 18 }}>Входящие</h2>
          <div className="timeline">
            {(inbox ?? []).map((n) => (
              <div key={n.id}>
                <span className="muted mono">{fmtDateTime(n.created_at)}</span>
                <span>
                  <b>{n.title}</b> {n.read_at ? <span className="pill pill--good">прочитано</span> : <span className="pill">не прочитано</span>}
                  <br />
                  <span className="muted">{n.body}</span>
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

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card stat">
      <span>{label}</span>
      <b>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
