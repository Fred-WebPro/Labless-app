import { adminDb } from "@/lib/supabase";

export type Audience =
  | { type: "all" }
  | { type: "locale"; locale: string }
  | { type: "platform"; platform: string }
  | { type: "inactive"; days: number }
  | { type: "no_reports" }
  | { type: "users"; ids: string[] };

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS = "https://exp.host/--/api/v2/push/getReceipts";

type Ticket = { status: string; id?: string; message?: string; details?: { error?: string } };

type PushMessage = { to: string; title: string; body: string; sound: "default"; data: Record<string, unknown> };

/**
 * Sends messages through Expo and then asks Apple/Google (via Expo receipts) whether they were
 * really delivered. A ticket only means Expo accepted the message.
 */
async function deliver(messages: PushMessage[]) {
  let sent = 0;
  let failed = 0;
  let firstError: string | null = null;
  const dead: string[] = [];
  const ticketIds: string[] = [];
  const noteError = (msg: string | undefined, code: string | undefined) => {
    failed++;
    firstError ??= msg ?? code ?? "unknown error";
  };

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const payload = (await res.json()) as { data?: Ticket[] };
      (payload.data ?? []).forEach((ticket, idx) => {
        if (ticket.status === "ok" && ticket.id) ticketIds.push(ticket.id);
        else {
          noteError(ticket.message, ticket.details?.error);
          if (ticket.details?.error === "DeviceNotRegistered") dead.push(batch[idx].to);
        }
      });
    } catch (err) {
      failed += batch.length;
      firstError ??= err instanceof Error ? err.message : String(err);
    }
  }

  if (ticketIds.length) {
    // Receipts are usually ready within a few seconds.
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(EXPO_RECEIPTS, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ids: ticketIds }),
      });
      const payload = (await res.json()) as { data?: Record<string, Ticket> };
      for (const id of ticketIds) {
        const receipt = payload.data?.[id];
        if (!receipt || receipt.status === "ok") sent++;
        else noteError(receipt.message, receipt.details?.error);
      }
    } catch {
      sent += ticketIds.length;
    }
  }

  if (dead.length) await adminDb().from("push_tokens").update({ disabled: true }).in("token", dead);
  return { sent, failed, error: firstError };
}

/** Push to every device of one user (no inbox entry). Used for "your reading is ready". */
export async function pushToUser(userId: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const db = adminDb();
  const { data: profile } = await db.from("profiles").select("notifications_enabled").eq("id", userId).maybeSingle();
  if (profile && profile.notifications_enabled === false) return { sent: 0, failed: 0, error: null };
  const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", userId).eq("disabled", false);
  if (!tokens?.length) return { sent: 0, failed: 0, error: null };
  return deliver(tokens.map((t) => ({ to: t.token as string, title, body, sound: "default" as const, data })));
}

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

  const tokens: { token: string; user_id: string }[] = [];
  for (let i = 0; i < userIds.length; i += 300) {
    const { data } = await db
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", userIds.slice(i, i + 300))
      .eq("disabled", false);
    tokens.push(...(data ?? []));
  }

  const { sent, failed, error: pushError } = await deliver(
    tokens.map((t) => ({
      to: t.token,
      title: input.title,
      body: input.body,
      sound: "default" as const,
      data: { ...(input.data ?? {}), broadcastId: broadcast.id },
    })),
  );

  await db
    .from("broadcasts")
    .update({ status: "sent", push_sent: sent, push_failed: failed, push_error: pushError, sent_at: new Date().toISOString() })
    .eq("id", broadcast.id);

  return { id: broadcast.id as string, recipients: userIds.length, devices: tokens.length, sent, failed, error: pushError };
}
