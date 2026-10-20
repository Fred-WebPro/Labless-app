import type { Result } from "@/lib/types";

export type Direction = "better" | "worse" | "stable" | "moved";

export type Delta = {
  marker: string;
  name: string;
  unit: string | null;
  now: number;
  prev: number;
  prevDate: string | null;
  pct: number;
  direction: Direction;
  outOfRange: boolean;
};

const dateOf = (r: Pick<Result, "collected_at" | "created_at">) => r.collected_at ?? r.created_at.slice(0, 10);

/** How far a value sits outside its reference range; 0 inside it. */
function distance(value: number, low: number | null, high: number | null) {
  if (low != null && value < low) return low - value;
  if (high != null && value > high) return value - high;
  return 0;
}

export function outOfRange(r: Pick<Result, "value" | "ref_low" | "ref_high" | "flag">) {
  if (r.flag && r.flag !== "normal") return true;
  return r.value != null && distance(Number(r.value), r.ref_low, r.ref_high) > 0;
}

/**
 * Compares every value in a report with the same marker in the closest earlier report.
 * Better or worse means it moved towards or away from the reference range.
 */
export function compareWithPrevious(current: Result[], history: Result[], reportId: string): Delta[] {
  const base = current.find((r) => r.collected_at)?.collected_at ?? current[0]?.created_at.slice(0, 10);
  if (!base) return [];
  const earlier = history
    .filter((h) => h.report_id !== reportId && h.value != null && dateOf(h) <= base)
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)));

  const deltas: Delta[] = [];
  for (const r of current) {
    if (r.value == null || r.marker.startsWith("other:")) continue;
    const p = earlier.find((h) => h.marker === r.marker);
    if (!p) continue;
    const now = Number(r.value);
    const prev = Number(p.value);
    const pct = prev ? ((now - prev) / Math.abs(prev)) * 100 : 0;
    const low = r.ref_low ?? p.ref_low;
    const high = r.ref_high ?? p.ref_high;
    const dNow = distance(now, low, high);
    const dPrev = distance(prev, low, high);
    const tolerance = Math.max(Math.abs(prev), Math.abs(now)) * 0.02;
    let direction: Direction;
    if (Math.abs(pct) < 3) direction = "stable";
    else if (low == null && high == null) direction = "moved";
    else if (dNow + tolerance < dPrev) direction = "better";
    else if (dNow > dPrev + tolerance) direction = "worse";
    else direction = dNow === 0 ? "moved" : "stable";
    deltas.push({ marker: r.marker, name: r.name, unit: r.unit, now, prev, prevDate: dateOf(p), pct, direction, outOfRange: outOfRange(r) });
  }
  const rank: Record<Direction, number> = { worse: 0, better: 1, moved: 2, stable: 3 };
  return deltas.sort((a, b) => rank[a.direction] - rank[b.direction] || Math.abs(b.pct) - Math.abs(a.pct));
}

export type Series = {
  marker: string;
  name: string;
  unit: string | null;
  values: number[];
  last: Result;
  pct: number | null;
  outOfRange: boolean;
};

/** One entry per marker with all its values in date order, newest result last. */
export function seriesByMarker(results: Result[]): Series[] {
  const map = new Map<string, Result[]>();
  for (const r of results) {
    if (r.value == null || r.marker.startsWith("other:")) continue;
    map.set(r.marker, [...(map.get(r.marker) ?? []), r]);
  }
  const out: Series[] = [];
  for (const [marker, rows] of map) {
    rows.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const values = rows.map((r) => Number(r.value));
    const last = rows[rows.length - 1];
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const pct = prev ? ((values[values.length - 1] - prev) / Math.abs(prev)) * 100 : null;
    out.push({ marker, name: last.name, unit: last.unit, values, last, pct, outOfRange: outOfRange(last) });
  }
  return out.sort((a, b) => Number(b.outOfRange) - Number(a.outOfRange) || b.values.length - a.values.length || a.name.localeCompare(b.name));
}
