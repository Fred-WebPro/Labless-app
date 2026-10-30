"use client";

import { useEffect, useState, type FormEvent } from "react";
import { browserClient } from "@/lib/browser";

const TEXT = {
  en: {
    title: "Set a new password",
    label: "New password",
    save: "Save password",
    saving: "Saving…",
    short: "Use at least 8 characters.",
    expired: "This link has expired or was already used. Request a new one in the app.",
    done: "Password updated",
    doneBody: "Go back to the Labless app and sign in with your new password.",
  },
  es: {
    title: "Nueva contraseña",
    label: "Nueva contraseña",
    save: "Guardar contraseña",
    saving: "Guardando…",
    short: "Usa al menos 8 caracteres.",
    expired: "Este enlace caducó o ya se usó. Pide uno nuevo en la app.",
    done: "Contraseña actualizada",
    doneBody: "Vuelve a la app Labless y entra con tu nueva contraseña.",
  },
  ru: {
    title: "Новый пароль",
    label: "Новый пароль",
    save: "Сохранить пароль",
    saving: "Сохраняем…",
    short: "Не меньше 8 символов.",
    expired: "Ссылка устарела или уже использована. Запросите новую в приложении.",
    done: "Пароль обновлён",
    doneBody: "Вернитесь в приложение Labless и войдите с новым паролем.",
  },
};

/** Landing page for the password reset email sent from the app. */
export default function ResetPassword() {
  const [t, setT] = useState(TEXT.en);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const lang = navigator.language.slice(0, 2);
    if (lang === "es" || lang === "ru") setT(TEXT[lang]);

    const supabase = browserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    const code = new URLSearchParams(window.location.search).get("code");
    // The app's client uses the implicit flow, so the email link lands here with the session in the hash.
    // The browser client is PKCE-only and ignores it, so the hash is read by hand.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const done = () => setChecked(true);
    if (accessToken && refreshToken) {
      window.history.replaceState(null, "", window.location.pathname);
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
        if (!error) setReady(true);
        done();
      });
    } else if (hash.get("error")) {
      done();
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) setReady(true);
        done();
      });
    } else {
      supabase.auth.getSession().then(({ data: s }) => {
        if (s.session) setReady(true);
        setTimeout(done, 600);
      });
    }
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setState("error");
      setMessage(t.short);
      return;
    }
    setState("busy");
    const { error } = await browserClient().auth.updateUser({ password });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    await browserClient().auth.signOut();
    setState("done");
  };

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>
          <s style={{ color: "var(--ink-3)", textDecorationColor: "var(--pen)" }}>Lab</s>less
        </h1>
        {state === "done" ? (
          <>
            <p className="hand" style={{ fontSize: 30, margin: 0 }}>
              {t.done}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {t.doneBody}
            </p>
          </>
        ) : !ready ? (
          <p className="muted">{checked ? t.expired : "…"}</p>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 600 }}>{t.title}</p>
            <label className="field">
              {t.label}
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {state === "error" && <p className="err">{message}</p>}
            <button className="btn btn--ink" disabled={state === "busy"}>
              {state === "busy" ? t.saving : t.save}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
