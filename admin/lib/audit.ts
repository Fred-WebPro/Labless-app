import { adminDb } from "@/lib/supabase";

/** Records what an admin did or looked at. Shown in the user's timeline; the privacy policy promises staff access is logged. */
export async function logAdmin(adminId: string, target: string | null, action: string, details: Record<string, unknown> = {}) {
  await adminDb().from("admin_actions").insert({ admin_id: adminId, target_user: target, action, details });
}
