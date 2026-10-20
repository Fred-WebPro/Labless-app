import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { track } from "@/lib/analytics";

/** Recheck reminders are local notifications, so they work offline and in Expo Go. */
export const remindersSupported = Platform.OS !== "web";

type ReminderData = { kind: "recheck"; memberId: string; due: string; route: string };

async function scheduled(memberId: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter((n) => {
    const d = n.content.data as Partial<ReminderData> | undefined;
    return d?.kind === "recheck" && d.memberId === memberId;
  });
}

/** Due date of the member's recheck reminder, or null when none is set. */
export async function getReminder(memberId: string): Promise<string | null> {
  if (!remindersSupported) return null;
  try {
    const [first] = await scheduled(memberId);
    return (first?.content.data as Partial<ReminderData> | undefined)?.due ?? null;
  } catch {
    return null;
  }
}

export async function cancelReminder(memberId: string) {
  for (const n of await scheduled(memberId)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
}

/**
 * Replaces the member's reminder with one `months` from now, at 10 am local time.
 * Returns the due date, or null when notifications are not allowed.
 */
export async function setReminder(memberId: string, months: number, content: { title: string; body: string }): Promise<string | null> {
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Labless", importance: Notifications.AndroidImportance.HIGH });
  }
  await cancelReminder(memberId);

  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setHours(10, 0, 0, 0);
  const due = date.toISOString();
  const data: ReminderData = { kind: "recheck", memberId, due, route: `/upload?memberId=${memberId}` };
  await Notifications.scheduleNotificationAsync({
    content: { ...content, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "default" },
  });
  track("reminder_set", { months });
  return due;
}
