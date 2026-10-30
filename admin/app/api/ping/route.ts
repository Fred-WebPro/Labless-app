import { recordGeo } from "@/lib/geo";
import { json, userFromRequest } from "@/lib/supabase";

/** Called by the app on open: refreshes the approximate location shown in the admin panel. */
export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  await recordGeo(req, user.id);
  return json({ ok: true });
}
