import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

type HealthKit = typeof import("@kingstinct/react-native-healthkit");

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis" as const;
const CONNECTED = "labless.sleep.connected";
const LAST_SYNC = "labless.sleep.lastSync";

// Sleep stage values from HealthKit.
const IN_BED = 0;
const AWAKE = 2;
const DEEP = 4;
const REM = 5;

let cached: HealthKit | null | undefined;
/** The native module exists only in the App Store / TestFlight build, not in Expo Go or on the web. */
function healthKit(): HealthKit | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== "ios") return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@kingstinct/react-native-healthkit") as HealthKit;
    cached = mod.isHealthDataAvailable() ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

export const sleepSupported = () => healthKit() !== null;

export async function isSleepConnected() {
  try {
    return (await AsyncStorage.getItem(CONNECTED)) === "1";
  } catch {
    return false;
  }
}

export type Night = {
  night: string;
  asleep_min: number;
  in_bed_min: number | null;
  bedtime: string | null;
  wake_time: string | null;
  deep_min: number | null;
  rem_min: number | null;
  awake_min: number | null;
};

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Groups samples into nights. A night is named after the evening it started:
 * anything ending before 18:00 belongs to the previous evening.
 */
function toNights(samples: readonly { startDate: Date; endDate: Date; value: number }[]): Night[] {
  const byNight = new Map<string, { asleep: number; inBed: number; deep: number; rem: number; awake: number; start: Date | null; end: Date | null; stages: boolean }>();
  for (const s of samples) {
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const min = Math.max(0, (end.getTime() - start.getTime()) / 60000);
    const anchor = new Date(end.getTime() - 18 * 3600_000);
    const key = localDate(anchor);
    const n = byNight.get(key) ?? { asleep: 0, inBed: 0, deep: 0, rem: 0, awake: 0, start: null, end: null, stages: false };
    if (s.value === IN_BED) n.inBed += min;
    else if (s.value === AWAKE) n.awake += min;
    else {
      n.asleep += min;
      if (s.value === DEEP) n.deep += min;
      if (s.value === REM) n.rem += min;
      if (s.value >= 3) n.stages = true;
      if (!n.start || start < n.start) n.start = start;
      if (!n.end || end > n.end) n.end = end;
    }
    byNight.set(key, n);
  }
  return [...byNight.entries()]
    .filter(([, n]) => n.asleep >= 60)
    .map(([night, n]) => ({
      night,
      asleep_min: Math.min(1440, Math.round(n.asleep)),
      in_bed_min: n.inBed ? Math.round(n.inBed) : null,
      bedtime: n.start?.toISOString() ?? null,
      wake_time: n.end?.toISOString() ?? null,
      deep_min: n.stages ? Math.round(n.deep) : null,
      rem_min: n.stages ? Math.round(n.rem) : null,
      awake_min: n.stages ? Math.round(n.awake) : null,
    }))
    .sort((a, b) => a.night.localeCompare(b.night));
}

/** Asks for read access to sleep and does the first sync. Returns false when it isn't available. */
export async function connectSleep(): Promise<boolean> {
  const hk = healthKit();
  if (!hk) return false;
  await hk.requestAuthorization({ toRead: [SLEEP] });
  await AsyncStorage.setItem(CONNECTED, "1");
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) await supabase.from("profiles").update({ sleep_connected_at: new Date().toISOString() }).eq("id", userId);
  await syncSleep(true);
  return true;
}

export async function disconnectSleep() {
  await AsyncStorage.removeItem(CONNECTED);
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId) {
    await supabase.from("sleep_nights").delete().eq("owner_id", userId);
    await supabase.from("profiles").update({ sleep_connected_at: null }).eq("id", userId);
  }
}

/**
 * Reads the last 45 nights from Apple Health and stores one row per night.
 * Runs at most every 6 hours unless forced. HealthKit returns nothing (not an error)
 * when the person declined access, so an empty result is fine.
 */
export async function syncSleep(force = false): Promise<number> {
  const hk = healthKit();
  if (!hk || !(await isSleepConnected())) return 0;
  try {
    const last = Number((await AsyncStorage.getItem(LAST_SYNC)) ?? 0);
    if (!force && Date.now() - last < 6 * 3600_000) return 0;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return 0;

    const samples = await hk.queryCategorySamples(SLEEP, {
      limit: 0,
      filter: { date: { startDate: new Date(Date.now() - 45 * 86400_000), endDate: new Date() } },
    });
    const nights = toNights(samples as unknown as { startDate: Date; endDate: Date; value: number }[]);
    if (nights.length) {
      const rows = nights.map((n) => ({ ...n, owner_id: userId, source: "apple_health", updated_at: new Date().toISOString() }));
      const { error } = await supabase.from("sleep_nights").upsert(rows, { onConflict: "owner_id,night" });
      if (error) throw new Error(error.message);
    }
    await AsyncStorage.setItem(LAST_SYNC, String(Date.now()));
    return nights.length;
  } catch (err) {
    console.warn("sleep sync failed", err);
    return 0;
  }
}

export type SleepStats = {
  nights: Night[];
  avgAsleep: number | null;
  avgBedtime: string | null;
  spreadMin: number | null;
  shortNights: number;
};

/** Averages over the given nights. Bedtimes are compared as minutes after 18:00 so midnight doesn't break them. */
export function sleepStats(nights: Night[]): SleepStats {
  const recent = nights.slice(-30);
  const asleep = recent.map((n) => n.asleep_min);
  const avg = asleep.length ? asleep.reduce((a, b) => a + b, 0) / asleep.length : null;
  const bed = recent
    .filter((n) => n.bedtime)
    .map((n) => {
      const d = new Date(n.bedtime!);
      return (d.getHours() * 60 + d.getMinutes() - 18 * 60 + 1440) % 1440;
    });
  const bedAvg = bed.length ? bed.reduce((a, b) => a + b, 0) / bed.length : null;
  const spread = bedAvg == null ? null : Math.round(Math.sqrt(bed.reduce((a, b) => a + (b - bedAvg) ** 2, 0) / bed.length));
  const clock = bedAvg == null ? null : (() => {
    const total = Math.round(bedAvg + 18 * 60) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  })();
  return { nights: recent, avgAsleep: avg, avgBedtime: clock, spreadMin: spread, shortNights: asleep.filter((m) => m < 360).length };
}
