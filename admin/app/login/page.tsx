"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/browser";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError("Неверная почта или пароль.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <div>
          <h1>
            <s style={{ color: "var(--ink-3)", textDecorationColor: "var(--pen)" }}>Lab</s>less
          </h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Панель управления
          </p>
        </div>
        <label className="field">
          Почта
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Пароль
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="err">{error}</p>}
        <button className="btn btn--ink" disabled={busy}>
          {busy ? "Входим…" : "Войти"}
        </button>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Доступ есть только у администраторов. Аккаунт создаётся в приложении Labless.
        </p>
      </form>
    </main>
  );
}
