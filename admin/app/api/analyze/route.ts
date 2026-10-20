import { after } from "next/server";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { adminDb, isBanned, json, userFromRequest } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * Starts the analysis of an uploaded report and returns at once.
 * The app follows progress through the report's status and stage columns.
 */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await isBanned(user.id)) return json({ error: "banned" }, 403);

  const { reportId } = (await req.json().catch(() => ({}))) as { reportId?: string };
  if (!reportId) return json({ error: "missing_report" }, 400);

  const db = adminDb();
  const { data: report } = await db.from("reports").select("id, owner_id, status, files").eq("id", reportId).maybeSingle();
  if (!report || report.owner_id !== user.id) return json({ error: "not_found" }, 404);
  if (report.status === "processing") return json({ ok: true, status: "processing" });

  const files = (report.files ?? []) as { path: string }[];
  if (!files.length || files.some((f) => !f.path.startsWith(`${user.id}/${reportId}/`))) {
    return json({ error: "invalid_files" }, 400);
  }

  await db.from("reports").update({ status: "processing", stage: "queued", error: null }).eq("id", reportId);
  after(() => runAnalysis(reportId));
  return json({ ok: true, status: "processing" }, 202);
}
