import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

export type NotificationTarget = { route?: string; url?: string } | null | undefined;

/** True when tapping the notification leads somewhere other than the inbox. */
export function hasTarget(data: NotificationTarget) {
  return !!(data && ((typeof data.url === "string" && data.url.startsWith("https://")) || (typeof data.route === "string" && data.route.startsWith("/") && data.route !== "/inbox")));
}

/**
 * Opens what a notification points at: a web link, a screen, or "/latest" for the newest reading.
 * Without a target it opens the inbox.
 */
export async function openTarget(data: NotificationTarget, fallback = "/inbox") {
  if (data?.url && data.url.startsWith("https://")) {
    await WebBrowser.openBrowserAsync(data.url).catch(() => {});
    return;
  }
  const route = typeof data?.route === "string" && data.route.startsWith("/") ? data.route : null;
  if (!route) {
    router.push(fallback as never);
    return;
  }
  if (route === "/latest") {
    const { data: rows } = await supabase.from("reports").select("id").eq("status", "ready").order("created_at", { ascending: false }).limit(1);
    router.push((rows?.[0] ? `/report/${rows[0].id}` : "/") as never);
    return;
  }
  router.push(route as never);
}
