import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const appVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "1.0.0";

async function uid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Fire-and-forget product analytics. Never throws, never blocks the UI. */
export function track(name: string, props: Record<string, unknown> = {}) {
  void (async () => {
    try {
      const userId = await uid();
      if (!userId) return;
      await supabase.from("events").insert({
        user_id: userId,
        name,
        props,
        platform: Platform.OS,
        app_version: appVersion,
        session_id: sessionId,
      });
    } catch {
      // Analytics must never break the app.
    }
  })();
}

let lastPing = 0;
let lastScreen = "";

/** Screen views, skipping repeats of the same screen. */
export function trackScreen(path: string) {
  if (path === lastScreen) return;
  lastScreen = path;
  track("screen_view", { path });
}

/** Records an app open (at most once a minute) and refreshes the device fields shown in the admin panel. */
export function ping(locale: string) {
  if (Date.now() - lastPing < 60_000) return;
  lastPing = Date.now();
  void (async () => {
    try {
      const userId = await uid();
      if (!userId) return;
      await supabase
        .from("profiles")
        .update({
          platform: Platform.OS,
          app_version: appVersion,
          device_model: Device.modelName ?? (Platform.OS === "web" ? "browser" : null),
          last_seen_at: new Date().toISOString(),
          locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        })
        .eq("id", userId);
    } catch {
      // ignore
    }
  })();
  track("app_open");
}
