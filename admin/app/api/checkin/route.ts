import { after } from "next/server";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { adminDb, isBanned, json, userFromRequest } from "@/lib/supabase";

export const maxDuration = 300;

/** Saves check-in answers and refines the interpretation with them. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await isBanned(user.id)) return json({ error: "banned" }, 403);

  const { reportId, answers } = (await req.json().catch(() => ({}))) as {
    reportId?: string;
    answers?: Record<string, string>;
  };
  if (!reportId || !answers || typeof answers !== "object") return json({ error: "invalid_body" }, 400);

  const db = adminDb();
  const { data: analysis } = await db
    .from("analyses")
    .select("owner_id, checkin_answers, checkin_questions")
    .eq("report_id", reportId)
    .maybeSingle();
  if (!analysis || analysis.owner_id !== user.id) return json({ error: "not_found" }, 404);

  const known = new Set(((analysis.checkin_questions ?? []) as { id: string }[]).map((q) => q.id));
  const clean: Record<string, string> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (known.has(id) && typeof value === "string" && value.trim()) clean[id] = value.trim().slice(0, 200);
  }
  if (!Object.keys(clean).length) return json({ error: "no_answers" }, 400);

  await db
    .from("analyses")
    .update({ checkin_answers: { ...(analysis.checkin_answers ?? {}), ...clean } })
    .eq("report_id", reportId);
  await db.from("reports").update({ status: "processing", stage: "interpreting" }).eq("id", reportId);

  after(() => runAnalysis(reportId, { reinterpretOnly: true }));
  return json({ ok: true, status: "processing" }, 202);
}
