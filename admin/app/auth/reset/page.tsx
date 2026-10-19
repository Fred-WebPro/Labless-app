"use client";

import { useEffect, useState, type FormEvent } from "react";
import { browserClient } from "@/lib/browser";

/** Landing page for the password reset email sent from the app. */
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = browserClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) setReady(true);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => data.session && setReady(true));
    }
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setState("error");
      setMessage("Use at least 8 characters.");
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
              Password updated
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Go back to the Labless app and sign in with your new password.
            </p>
          </>
        ) : !ready ? (
          <p className="muted">This link has expired or was already used. Request a new one in the app.</p>
        ) : (
          <>
            <label className="field">
              New password
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {state === "error" && <p className="err">{message}</p>}
            <button className="btn btn--ink" disabled={state === "busy"}>
              {state === "busy" ? "Saving…" : "Save password"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
