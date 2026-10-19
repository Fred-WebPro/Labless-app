import { adminDb } from "@/lib/supabase";

export type Audience =
  | { type: "all" }
  | { type: "locale"; locale: string }
  | { type: "platform"; platform: string }
  | { type: "inactive"; days: number }
  | { type: "no_reports" }
  | { type: "users"; ids: string[] };

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

/** Resolve the user ids an audience targets. */
export async function resolveAudience(audience: Audience): Promise<string[]> {
  const db = adminDb();
  if (audience.type === "users") return audience.ids;

  let query = db.from("profiles").select("id, last_seen_at, notifications_enabled").eq("notifications_enabled", true);
  if (audience.type === "locale") query = query.eq("locale", audience.locale);
  if (audience.type === "platform") query = query.eq("platform", audience.platform);
  if (audience.type === "inactive") {
    const cutoff = new Date(Date.now() - audience.days * 86400_000).toISOString();
    query = query.or(`last_seen_at.lt.${cutoff},last_seen_at.is.null`);
  }
  const { data } = await query.limit(50000);
  let ids = (data ?? []).map((p) => p.id as string);

  if (audience.type === "no_reports" && ids.length) {
    const { data: withReports } = await db.from("reports").select("owner_id").limit(100000);
    const has = new Set((withReports ?? []).map((r) => r.owner_id));
    ids = ids.filter((id) => !has.has(id));
  }
  return ids;
}

/**
 * Send a broadcast: writes an inbox entry for every recipient (always visible in the app)
 * and delivers a push notification to every registered device.
 */
export async function sendBroadcast(input: {
  title: string;
  body: string;
  audience: Audience;
  createdBy: string | null;
  data?: Record<string, unknown>;
}) {
  const db = adminDb();
  const userIds = await resolveAudience(input.audience);

  const { data: broadcast, error } = await db
    .from("broadcasts")
    .insert({
      title: input.title,
      body: input.body,
      audience: input.audience,
      data: input.data ?? {},
      created_by: input.createdBy,
      recipients: userIds.length,
      status: "sending",
    })
    .select()
    .single();
  if (error || !broadcast) throw new Error(error?.message ?? "Couldn't create broadcast");

  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500).map((user_id) => ({
      user_id,
      broadcast_id: broadcast.id,
      kind: "broadcast",
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    }));
    await db.from("inbox").insert(chunk);
  }

  let sent = 0;
  let failed = 0;
  const tokens: { token: string; user_id: string }[] = [];
  for (let i = 0; i < userIds.length; i += 300) {
    const { data } = await db
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", userIds.slice(i, i + 300))
      .eq("disabled", false);
    tokens.push(...(data ?? []));
  }

  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(
          batch.map((t) => ({
            to: t.token,
            title: input.title,
            body: input.body,
            sound: "default",
            data: { ...(input.data ?? {}), broadcastId: broadcast.id },
          })),
        ),
      });
      const payload = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (payload.data ?? []).forEach((ticket, idx) => {
        if (ticket.status === "ok") sent++;
        else {
          failed++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            void db.from("push_tokens").update({ disabled: true }).eq("token", batch[idx].token);
          }
        }
      });
    } catch {
      failed += batch.length;
    }
  }

  await db
    .from("broadcasts")
    .update({ status: "sent", push_sent: sent, push_failed: failed, sent_at: new Date().toISOString() })
    .eq("id", broadcast.id);

  return { id: broadcast.id as string, recipients: userIds.length, devices: tokens.length, sent, failed };
}
