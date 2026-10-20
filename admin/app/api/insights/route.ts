import { refreshFamilyInsights, refreshMemberInsights } from "@/lib/analysis/insights";
import { adminDb, isBanned, json, userFromRequest } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * Makes sure the recommendations are up to date and returns them.
 * Regenerates only when a newer reading exists (or after new sleep data, at most once a day),
 * so opening the screen doesn't spend AI money every time.
 */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (await isBanned(user.id)) return json({ error: "banned" }, 403);

  const body = (await req.json().catch(() => ({}))) as { memberId?: string; scope?: "member" | "family"; reason?: "sleep" };
  const scope = body.scope === "family" ? "family" : "member";
  const db = adminDb();

  let memberIds: string[];
  if (scope === "member") {
    if (!body.memberId) return json({ error: "invalid_body" }, 400);
    const { data: member } = await db.from("members").select("id, owner_id").eq("id", body.memberId).maybeSingle();
    if (!member || member.owner_id !== user.id) return json({ error: "not_found" }, 404);
    memberIds = [member.id];
  } else {
    const { data: members } = await db.from("members").select("id").eq("owner_id", user.id);
    memberIds = (members ?? []).map((m) => m.id);
  }

  const key = scope === "member" ? `member:${body.memberId}` : `family:${user.id}`;
  const [{ data: existing }, { data: latest }] = await Promise.all([
    db.from("insights").select("*").eq("key", key).maybeSingle(),
    db.from("analyses").select("updated_at").in("member_id", memberIds).order("updated_at", { ascending: false }).limit(1),
  ]);
  const latestAt = latest?.[0]?.updated_at ? Date.parse(latest[0].updated_at) : 0;
  if (!latestAt) return json({ insights: null, reason: "no_readings" });

  const updatedAt = existing ? Date.parse(existing.updated_at) : 0;
  const stale = !existing || updatedAt < latestAt || (body.reason === "sleep" && Date.now() - updatedAt > 86400_000);
  if (stale) {
    try {
      if (scope === "member") await refreshMemberInsights(user.id, body.memberId!);
      else await refreshFamilyInsights(user.id);
    } catch (err) {
      console.error("insights refresh failed", err);
      if (!existing) return json({ error: "generation_failed" }, 502);
    }
  }
  const { data: fresh } = await db.from("insights").select("*").eq("key", key).maybeSingle();
  return json({ insights: fresh ?? null, reason: fresh ? null : "need_two_people" });
}
