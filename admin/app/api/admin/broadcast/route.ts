import { currentAdmin } from "@/lib/session";
import { sendBroadcast, type Audience } from "@/lib/push";
import { json } from "@/lib/supabase";

export const maxDuration = 300;

const AUDIENCES = new Set(["all", "locale", "platform", "inactive", "no_reports", "users"]);

export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    audience?: Audience;
    route?: string;
    url?: string;
  };
  const title = (body.title ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!title || !text) return json({ error: "Title and message are required." }, 400);
  if (title.length > 80 || text.length > 300) return json({ error: "Title or message is too long." }, 400);
  if (!body.audience || !AUDIENCES.has(body.audience.type)) return json({ error: "Choose an audience." }, 400);

  try {
    const result = await sendBroadcast({
      title,
      body: text,
      audience: body.audience,
      createdBy: admin.id,
      data: body.url && /^https:\/\/\S+$/.test(body.url) ? { url: body.url } : body.route && body.route.startsWith("/") ? { route: body.route } : {},
    });
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Couldn't send." }, 500);
  }
}
