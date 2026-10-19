"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AudienceType = "all" | "locale" | "platform" | "inactive" | "no_reports";

const ROUTES = [
  { value: "", label: "Главный экран" },
  { value: "/upload", label: "Загрузка анализа" },
  { value: "/family", label: "Семья" },
  { value: "/inbox", label: "Уведомления" },
];

export function PushComposer({ fixedUserId }: { fixedUserId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AudienceType>("all");
  const [locale, setLocale] = useState("en");
  const [platform, setPlatform] = useState("ios");
  const [days, setDays] = useState(7);
  const [route, setRoute] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const audience = fixedUserId
    ? { type: "users", ids: [fixedUserId] }
    : type === "locale"
      ? { type, locale }
      : type === "platform"
        ? { type, platform }
        : type === "inactive"
          ? { type, days }
          : { type };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setResult({ ok: false, text: "Заполните заголовок и текст." });
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, audience, route }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setResult({ ok: false, text: data.error ?? "Не удалось отправить." });
      return;
    }
    setResult({
      ok: true,
      text: `Отправлено: ${data.recipients} получателей, ${data.devices} устройств, доставлено пушей ${data.sent}, ошибок ${data.failed}. Сообщение также появилось во «Входящих» в приложении.`,
    });
    setTitle("");
    setBody("");
    router.refresh();
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        Заголовок <span className="muted">({title.length}/80)</span>
        <input className="input" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setConfirming(false); }} placeholder="Новый скрытый анализ: апноэ сна" />
      </label>
      <label className="field">
        Текст <span className="muted">({body.length}/300)</span>
        <textarea className="input" value={body} maxLength={300} onChange={(e) => { setBody(e.target.value); setConfirming(false); }} placeholder="Загрузите последние анализы, и мы проверим риск апноэ без ночи в лаборатории." />
      </label>
      {!fixedUserId && (
        <div className="row">
          <label className="field" style={{ flex: "1 1 200px" }}>
            Кому
            <select className="input" value={type} onChange={(e) => { setType(e.target.value as AudienceType); setConfirming(false); }}>
              <option value="all">Всем</option>
              <option value="locale">По языку</option>
              <option value="platform">По платформе</option>
              <option value="inactive">Неактивным</option>
              <option value="no_reports">Не загрузили ни одного анализа</option>
            </select>
          </label>
          {type === "locale" && (
            <label className="field" style={{ flex: "1 1 140px" }}>
              Язык
              <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="ru">Русский</option>
              </select>
            </label>
          )}
          {type === "platform" && (
            <label className="field" style={{ flex: "1 1 140px" }}>
              Платформа
              <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
                <option value="web">Web</option>
              </select>
            </label>
          )}
          {type === "inactive" && (
            <label className="field" style={{ flex: "1 1 140px" }}>
              Не заходили, дней
              <input className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          )}
        </div>
      )}
      <label className="field">
        Что открыть по нажатию
        <select className="input" value={route} onChange={(e) => setRoute(e.target.value)}>
          {ROUTES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {result && <p className={result.ok ? "ok" : "err"}>{result.text}</p>}
      <div className="row">
        <button className={`btn ${confirming ? "btn--pen" : "btn--ink"}`} disabled={busy}>
          {busy ? "Отправляем…" : confirming ? "Точно отправить" : "Отправить"}
        </button>
        {confirming && !busy && (
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
