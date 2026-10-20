import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, adminDb, adminEmails } from "@/lib/supabase";

/** Cookie-based Supabase client for the admin panel (server components and actions). */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: cookies are read-only there. The proxy refreshes them.
        }
      },
    },
  });
}

export type Admin = { id: string; email: string };

/**
 * Returns the signed-in admin, or null when signed out or not an admin.
 * Verifies the session JWT (locally when the project uses signing keys) and is
 * memoized per request, so layouts and pages share one check.
 */
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const supabase = await sessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub || !claims.email) return null;
  const email = claims.email.toLowerCase();
  if (adminEmails().includes(email)) return { id: claims.sub, email };
  const { data: profile } = await adminDb().from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  return profile?.role === "admin" ? { id: claims.sub, email } : null;
});

export async function requireAdmin(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}
