import { adminDb, json } from "@/lib/supabase";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Creates a confirmed account so people can start right away without an email round trip.
 * The app signs in with the same credentials right after this call.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; name?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = (body.name ?? "").trim().slice(0, 60);
  const locale = ["en", "es", "ru"].includes(body.locale ?? "") ? body.locale! : "en";

  if (!EMAIL.test(email)) return json({ error: "invalid_email" }, 400);
  if (password.length < 8) return json({ error: "weak_password" }, 400);

  const { error } = await adminDb().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, locale },
  });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return json({ error: exists ? "email_taken" : "signup_failed", message: error.message }, exists ? 409 : 400);
  }
  return json({ ok: true });
}
