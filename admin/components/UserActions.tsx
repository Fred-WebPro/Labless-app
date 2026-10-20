"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { banUser, deleteUser, saveNote, setRole, unbanUser, rerunReport, type ActionResult } from "@/lib/actions";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      after?.(r);
    });
  return { pending, result, run };
}

export function UserActions({ userId, banned, role, email }: { userId: string; banned: boolean; role: string; email: string }) {
  const router = useRouter();
  const { pending, result, run } = useAction();
  const [mode, setMode] = useState<"none" | "ban" | "delete">("none");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="stack">
      <div className="row">
        {banned ? (
          <button className="btn" disabled={pending} onClick={() => run(() => unbanUser(userId))}>
            Разблокировать
          </button>
        ) : (
          <button className="btn" disabled={pending} onClick={() => setMode(mode === "ban" ? "none" : "ban")}>
            Заблокировать
          </button>
        )}
        <button className="btn" disabled={pending} onClick={() => run(() => setRole(userId, role === "admin" ? "user" : "admin"))}>
          {role === "admin" ? "Убрать доступ к админке" : "Сделать админом"}
        </button>
        <a className="btn" href="#push">
          Написать
        </a>
        <button className="btn" style={{ color: "var(--pen)" }} disabled={pending} onClick={() => setMode(mode === "delete" ? "none" : "delete")}>
          Удалить аккаунт
        </button>
      </div>

      {mode === "ban" && !banned ? (
        <div className="card stack" style={{ background: "var(--paper-2)" }}>
          <label className="field">
            Причина (видна только админам)
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Спам, злоупотребление, просьба пользователя…" />
          </label>
          <div className="row">
            <button className="btn btn--pen" disabled={pending} onClick={() => run(() => banUser(userId, reason), () => setMode("none"))}>
              {pending ? "Блокируем…" : "Заблокировать"}
            </button>
            <button className="btn" onClick={() => setMode("none")}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {mode === "delete" ? (
        <div className="card stack" style={{ background: "var(--pen-soft)" }}>
          <p style={{ margin: 0 }}>
            Будут удалены аккаунт <b>{email}</b>, вся семья, бланки и разборы. Это нельзя отменить. Введите <b>УДАЛИТЬ</b>, чтобы подтвердить.
          </p>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <div className="row">
            <button
              className="btn btn--pen"
              disabled={pending || confirmText.trim().toUpperCase() !== "УДАЛИТЬ"}
              onClick={() => run(() => deleteUser(userId), (r) => r.ok && router.push("/users"))}
            >
              {pending ? "Удаляем…" : "Удалить навсегда"}
            </button>
            <button className="btn" onClick={() => setMode("none")}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {result ? <p className={result.ok ? "ok" : "err"}>{result.message}</p> : null}
    </div>
  );
}

export function NoteEditor({ userId, initial }: { userId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const { pending, result, run } = useAction();
  return (
    <div className="stack">
      <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Внутренняя заметка: обращения, договорённости, особенности. Пользователь её не видит." />
      <div className="row">
        <button className="btn btn--ink" disabled={pending || note === initial} onClick={() => run(() => saveNote(userId, note))}>
          {pending ? "Сохраняем…" : "Сохранить заметку"}
        </button>
        {result ? <span className={result.ok ? "ok" : "err"}>{result.message}</span> : null}
      </div>
    </div>
  );
}

export function RerunButton({ reportId }: { reportId: string }) {
  const { pending, result, run } = useAction();
  return (
    <span>
      <button className="btn" style={{ minHeight: 32, padding: "0 12px" }} disabled={pending} onClick={() => run(() => rerunReport(reportId))}>
        {pending ? "…" : "Перезапустить"}
      </button>
      {result && !result.ok ? <span className="err"> {result.message}</span> : null}
      {result?.ok ? <span className="ok"> запущено</span> : null}
    </span>
  );
}
