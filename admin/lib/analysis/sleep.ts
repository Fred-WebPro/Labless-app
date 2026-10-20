import { adminDb } from "@/lib/supabase";
import type { SleepSummary } from "@/lib/analysis/claude";

type Night = { night: string; asleep_min: number; bedtime: string | null; deep_min: number | null; rem_min: number | null };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Minutes after 18:00 local, so 23:30 and 00:30 stay close to each other. */
function eveningMinutes(iso: string, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return ((h * 60 + m - 18 * 60) + 1440) % 1440;
}

/** Last 30 nights from the person's watch, summarized for the model. Null without data. */
export async function sleepSummary(ownerId: string, tz = "America/New_York"): Promise<SleepSummary | null> {
  const since = new Date(Date.now() - 31 * 86400_000).toISOString().slice(0, 10);
  const { data } = await adminDb()
    .from("sleep_nights")
    .select("night, asleep_min, bedtime, deep_min, rem_min")
    .eq("owner_id", ownerId)
    .gte("night", since)
    .gt("asleep_min", 60);
  const nights = (data ?? []) as Night[];
  if (nights.length < 5) return null;

  const bed = nights.filter((n) => n.bedtime).map((n) => eveningMinutes(n.bedtime!, tz));
  const avgBed = mean(bed);
  const spread = avgBed == null ? null : Math.sqrt(mean(bed.map((b) => (b - avgBed) ** 2)) ?? 0);
  const clock = (mins: number) => {
    const total = Math.round(mins + 18 * 60) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const deep = nights.map((n) => n.deep_min).filter((x): x is number => x != null && x > 0);
  const rem = nights.map((n) => n.rem_min).filter((x): x is number => x != null && x > 0);

  return {
    nights: nights.length,
    avg_asleep_h: Math.round(((mean(nights.map((n) => n.asleep_min)) ?? 0) / 60) * 10) / 10,
    avg_bedtime: avgBed == null ? null : clock(avgBed),
    bedtime_spread_min: spread == null ? null : Math.round(spread),
    short_nights: nights.filter((n) => n.asleep_min < 360).length,
    avg_deep_min: deep.length ? Math.round(mean(deep)!) : null,
    avg_rem_min: rem.length ? Math.round(mean(rem)!) : null,
  };
}
