import { PushComposer } from "@/components/PushComposer";
import { adminDb } from "@/lib/supabase";
import { fmtDateTime, fmtNum } from "@/lib/format";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Все",
  locale: "Язык",
  platform: "Платформа",
  inactive: "Неактивные",
  no_reports: "Без анализов",
  users: "Конкретный пользователь",
};

export default async function Push() {
  const db = adminDb();
  const [{ data: broadcasts }, { count: devices }] = await Promise.all([
    db.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("push_tokens").select("token", { count: "exact", head: true }).eq("disabled", false),
  ]);

  return (
    <>
      <div className="head">
        <div>
          <h1>Рассылки</h1>
          <p>Пуш-уведомления и сообщения во «Входящие» приложения · {fmtNum(devices ?? 0)} устройств подписано</p>
        </div>
      </div>
      <div className="grid grid--2">
        <section className="card">
          <h2>Новая рассылка</h2>
          <PushComposer />
        </section>
        <section className="card">
          <h2>Как это работает</h2>
          <p style={{ marginTop: 0 }}>
            Каждое сообщение попадает во «Входящие» внутри приложения у всех выбранных пользователей. Тем, кто разрешил уведомления, оно
            приходит пушем на телефон.
          </p>
          <p className="muted">
            Пуши доставляет сервис Expo. В Expo Go на Android пуши не работают по ограничению Expo, на iOS работают после привязки проекта
            к EAS. В собранном приложении работают везде.
          </p>
        </section>
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <h2>История</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Сообщение</th>
                <th>Аудитория</th>
                <th className="num">Получателей</th>
                <th className="num">Пушей доставлено</th>
                <th className="num">Ошибок</th>
              </tr>
            </thead>
            <tbody>
              {(broadcasts ?? []).map((b) => (
                <tr key={b.id}>
                  <td className="mono muted">{fmtDateTime(b.created_at)}</td>
                  <td>
                    <b>{b.title}</b>
                    <div className="muted">{b.body}</div>
                  </td>
                  <td className="muted">{AUDIENCE_LABEL[b.audience?.type] ?? b.audience?.type}</td>
                  <td className="num">{fmtNum(b.recipients)}</td>
                  <td className="num">{fmtNum(b.push_sent)}</td>
                  <td className="num">{fmtNum(b.push_failed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!broadcasts?.length && <p className="empty">Рассылок ещё не было</p>}
        </div>
      </section>
    </>
  );
}
