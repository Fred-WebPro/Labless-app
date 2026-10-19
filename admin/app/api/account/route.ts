import { adminDb, json, userFromRequest } from "@/lib/supabase";

/** Permanently deletes the signed-in account, its files and all its data. */
export async function DELETE(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = adminDb();

  // Remove every uploaded file under the user's folder.
  const { data: reports } = await db.from("reports").select("files").eq("owner_id", user.id);
  const paths = (reports ?? []).flatMap((r) => ((r.files ?? []) as { path: string }[]).map((f) => f.path));
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from("reports").remove(paths.slice(i, i + 100));
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json({ error: "delete_failed", message: error.message }, 500);
  return json({ ok: true });
}
