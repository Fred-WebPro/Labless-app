import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { getLocales } from "expo-localization";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { api } from "@/lib/api";
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
      const push = Platform.OS === "web" ? null : await Notifications.getPermissionsAsync().then((p) => p.status).catch(() => null);
      await supabase
        .from("profiles")
        .update({
          platform: Platform.OS,
          app_version: appVersion,
          device_model: Device.modelName ?? (Platform.OS === "web" ? "browser" : null),
          device_brand: Device.brand ?? Device.manufacturer ?? null,
          os_version: Device.osVersion ? `${Device.osName ?? Platform.OS} ${Device.osVersion}` : null,
          device_region: getLocales()[0]?.regionCode ?? null,
          app_build: Application.nativeBuildVersion ?? null,
          update_id: Updates.updateId ?? null,
          device_language: getLocales()[0]?.languageTag ?? null,
          push_status: push,
          last_seen_at: new Date().toISOString(),
          locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        })
        .eq("id", userId);
      // The server reads the approximate location from the request.
      await api("/api/ping").catch(() => {});
    } catch {
      // ignore
    }
  })();
  track("app_open");
}
