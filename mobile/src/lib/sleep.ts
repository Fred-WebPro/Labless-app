import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

type HealthKit = typeof import("@kingstinct/react-native-healthkit");

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis" as const;
const CONNECTED = "labless.sleep.connected";
const LAST_SYNC = "labless.sleep.lastSync";
const LAST_SAMPLES = "labless.sleep.lastSamples";

/** How many raw sleep records Apple Health returned on the last sync; 0 means it shared nothing. */
export async function lastSleepSamples(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(LAST_SAMPLES);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

// Sleep values from HealthKit: 0 in bed, 1 asleep (no stages), 2 awake, 3 core, 4 deep, 5 REM.
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

type Span = [number, number];

/** Total minutes covered by the spans, counting overlaps once (a watch and a phone often record the same night). */
function covered(spans: Span[]): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: Span | null = null;
  for (const [s, e] of sorted) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else if (e > cur[1]) cur[1] = e;
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}

/**
 * Groups samples into nights. A night is named after the evening it started:
 * anything ending before 18:00 belongs to the previous evening.
 * Without a watch, iPhone records only "in bed" from the sleep schedule; that time is used as sleep then.
 */
function toNights(samples: readonly { startDate: Date | string; endDate: Date | string; value: number }[]): Night[] {
  const byNight = new Map<string, { asleep: Span[]; inBed: Span[]; deep: Span[]; rem: Span[]; awake: Span[] }>();
  for (const s of samples) {
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const key = localDate(new Date(end - 18 * 3600_000));
    const n = byNight.get(key) ?? { asleep: [], inBed: [], deep: [], rem: [], awake: [] };
    const span: Span = [start, end];
    const v = Number(s.value);
    if (v === IN_BED) n.inBed.push(span);
    else if (v === AWAKE) n.awake.push(span);
    else {
      n.asleep.push(span);
      if (v === DEEP) n.deep.push(span);
      if (v === REM) n.rem.push(span);
    }
    byNight.set(key, n);
  }
  return [...byNight.entries()]
    .map(([night, n]) => {
      const staged = n.deep.length > 0 || n.rem.length > 0;
      const asleepSpans = n.asleep.length ? n.asleep : n.inBed;
      const asleep = covered(asleepSpans);
      const inBed = covered(n.inBed);
      const start = asleepSpans.length ? Math.min(...asleepSpans.map((x) => x[0])) : null;
      const end = asleepSpans.length ? Math.max(...asleepSpans.map((x) => x[1])) : null;
      return {
        night,
        asleep_min: Math.min(1440, Math.round(asleep)),
        in_bed_min: inBed ? Math.round(inBed) : null,
        bedtime: start ? new Date(start).toISOString() : null,
        wake_time: end ? new Date(end).toISOString() : null,
        deep_min: staged ? Math.round(covered(n.deep)) : null,
        rem_min: staged ? Math.round(covered(n.rem)) : null,
        awake_min: staged ? Math.round(covered(n.awake)) : null,
      };
    })
    .filter((n) => n.asleep_min >= 60)
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

    // Shows the Health permission sheet again only if the person never answered it; otherwise a no-op.
    if (force) await hk.requestAuthorization({ toRead: [SLEEP] }).catch(() => false);
    const samples = await hk.queryCategorySamples(SLEEP, {
      limit: 0,
      filter: { date: { startDate: new Date(Date.now() - 45 * 86400_000), endDate: new Date() } },
    });
    const nights = toNights(samples as unknown as { startDate: Date; endDate: Date; value: number }[]);
    await AsyncStorage.setItem(LAST_SAMPLES, String(samples.length));
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
