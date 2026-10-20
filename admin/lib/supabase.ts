import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let admin: SupabaseClient | null = null;

/** Service-role client. Server only: bypasses row level security. */
export function adminDb(): SupabaseClient {
  if (!admin) {
    admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

/** Resolve the user behind an `Authorization: Bearer <access token>` header. */
export async function userFromRequest(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await adminDb().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** True when the account has been blocked by an admin. */
export async function isBanned(userId: string): Promise<boolean> {
  const { data } = await adminDb().from("profiles").select("banned_at").eq("id", userId).maybeSingle();
  return !!data?.banned_at;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
