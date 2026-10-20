"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { requireAdmin } from "@/lib/session";
import { adminDb, adminEmails } from "@/lib/supabase";

export type ActionResult = { ok: boolean; message: string };

async function log(adminId: string, target: string | null, action: string, details: Record<string, unknown> = {}) {
  await adminDb().from("admin_actions").insert({ admin_id: adminId, target_user: target, action, details });
}

async function guardTarget(adminId: string, userId: string): Promise<string | null> {
  if (userId === adminId) return "Нельзя применить это к своему аккаунту.";
  const { data } = await adminDb().auth.admin.getUserById(userId);
  const email = data?.user?.email?.toLowerCase();
  if (email && adminEmails().includes(email)) return "Это главный администратор, его нельзя блокировать или удалять.";
  return null;
}

export async function banUser(userId: string, reason: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const blocked = await guardTarget(admin.id, userId);
  if (blocked) return { ok: false, message: blocked };
  const db = adminDb();
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) return { ok: false, message: error.message };
  await db.from("profiles").update({ banned_at: new Date().toISOString(), ban_reason: reason.trim().slice(0, 300) || null }).eq("id", userId);
  await db.from("push_tokens").update({ disabled: true }).eq("user_id", userId);
  await log(admin.id, userId, "ban", { reason });
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  return { ok: true, message: "Пользователь заблокирован. Войти и загружать анализы он больше не сможет." };
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const db = adminDb();
  const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) return { ok: false, message: error.message };
  await db.from("profiles").update({ banned_at: null, ban_reason: null }).eq("id", userId);
  await log(admin.id, userId, "unban");
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users");
  return { ok: true, message: "Блокировка снята." };
}

export async function setRole(userId: string, role: "user" | "admin"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false, message: "Нельзя менять роль своему аккаунту." };
  const { error } = await adminDb().from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  await log(admin.id, userId, role === "admin" ? "grant_admin" : "revoke_admin");
  revalidatePath(`/users/${userId}`);
  return { ok: true, message: role === "admin" ? "Теперь у пользователя есть доступ к админке." : "Доступ к админке убран." };
}

export async function saveNote(userId: string, note: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { error } = await adminDb().from("profiles").update({ admin_note: note.trim().slice(0, 4000) || null }).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  await log(admin.id, userId, "note");
  revalidatePath(`/users/${userId}`);
  return { ok: true, message: "Заметка сохранена." };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const blocked = await guardTarget(admin.id, userId);
  if (blocked) return { ok: false, message: blocked };
  const db = adminDb();
  const { data: reports } = await db.from("reports").select("files").eq("owner_id", userId);
  const paths = (reports ?? []).flatMap((r) => ((r.files ?? []) as { path: string }[]).map((f) => f.path));
  for (let i = 0; i < paths.length; i += 100) await db.storage.from("reports").remove(paths.slice(i, i + 100));
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: error.message };
  await log(admin.id, userId, "delete_user");
  revalidatePath("/users");
  return { ok: true, message: "Аккаунт и все его данные удалены." };
}

export async function rerunReport(reportId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const db = adminDb();
  const { data: report } = await db.from("reports").select("owner_id, status").eq("id", reportId).maybeSingle();
  if (!report) return { ok: false, message: "Анализ не найден." };
  if (report.status === "processing") return { ok: false, message: "Разбор уже идёт." };
  await db.from("reports").update({ status: "processing", stage: "queued", error: null }).eq("id", reportId);
  await log(admin.id, report.owner_id, "rerun_report", { report_id: reportId });
  after(() => runAnalysis(reportId));
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/users/${report.owner_id}`);
  return { ok: true, message: "Разбор запущен заново. Обновите страницу через минуту." };
}
