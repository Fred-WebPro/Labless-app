import { after } from "next/server";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { adminDb, hasAiConsent, isBanned, json, userFromRequest } from "@/lib/supabase";

export const maxDuration = 300;

/** Re-runs the interpretation of a ready report, for example after the person added height and weight. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await isBanned(user.id)) return json({ error: "banned" }, 403);
  if (!(await hasAiConsent(user.id))) return json({ error: "consent_required" }, 403);

  const { reportId } = (await req.json().catch(() => ({}))) as { reportId?: string };
  if (!reportId) return json({ error: "invalid_body" }, 400);

  const db = adminDb();
  const { data: report } = await db.from("reports").select("owner_id, status").eq("id", reportId).maybeSingle();
  if (!report || report.owner_id !== user.id) return json({ error: "not_found" }, 404);
  if (report.status === "processing") return json({ ok: true, status: "processing" }, 202);
  if (report.status !== "ready") return json({ error: "not_ready" }, 409);

  await db.from("reports").update({ status: "processing", stage: "interpreting" }).eq("id", reportId);
  after(() => runAnalysis(reportId, { reinterpretOnly: true }));
  return json({ ok: true, status: "processing" }, 202);
}
