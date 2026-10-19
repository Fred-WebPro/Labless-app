import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const isExpoGoAndroid = Platform.OS === "android" && Constants.executionEnvironment === "storeClient";

export type PushState = "granted" | "denied" | "unavailable";

/**
 * Asks for permission (only when `ask`), fetches the Expo push token and stores it.
 * Remote push isn't available on web, simulators, or Expo Go on Android.
 */
export async function registerPush(ask: boolean): Promise<PushState> {
  if (Platform.OS === "web" || !Device.isDevice || isExpoGoAndroid) return "unavailable";
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Labless",
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: "#D2261C",
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && ask) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return "denied";

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return "unavailable";
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return "granted";
    await supabase.from("push_tokens").upsert({
      token,
      user_id: userId,
      platform: Platform.OS,
      device_name: Device.modelName ?? null,
      disabled: false,
      updated_at: new Date().toISOString(),
    });
    if (ask) track("push_enabled");
    return "granted";
  } catch {
    return "unavailable";
  }
}

export async function disablePush() {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (userId) await supabase.from("push_tokens").update({ disabled: true }).eq("user_id", userId);
  } catch {
    // ignore
  }
}
