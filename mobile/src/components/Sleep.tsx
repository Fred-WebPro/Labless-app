import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useToast } from "@/components/Toast";
import { Button, Card, T } from "@/components/ui";
import { fill, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { keys, useSleepNights } from "@/lib/data";
import { connectSleep, isSleepConnected, sleepStats, sleepSupported, type Night } from "@/lib/sleep";
import { colors, radius } from "@/lib/theme";

export const hm = (min: number | null, t: { h: string; m: string }) =>
  min == null ? "—" : `${Math.floor(min / 60)} ${t.h} ${String(Math.round(min % 60)).padStart(2, "0")} ${t.m}`;

/** One bar per night, the 7-hour line dashed, short nights in red. */
export function SleepBars({ nights, height = 90 }: { nights: Night[]; height?: number }) {
  const max = 10 * 60;
  return (
    <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
      <View style={[styles.goal, { bottom: (7 * 60 * height) / max }]} />
      {nights.map((n) => (
        <View
          key={n.night}
          style={{
            flex: 1,
            height: Math.max(4, (Math.min(n.asleep_min, max) / max) * height),
            borderRadius: 3,
            backgroundColor: n.asleep_min < 360 ? colors.pen : colors.ink,
            opacity: n.asleep_min < 360 ? 1 : 0.85,
          }}
        />
      ))}
    </View>
  );
}

export function useSleepConnected() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    isSleepConnected().then((v) => alive && setConnected(v));
    return () => {
      alive = false;
    };
  }, []);
  return [connected, setConnected] as const;
}

/** Home card: connect Apple Health, or the last two weeks at a glance. */
export function SleepCard({ memberId }: { memberId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [connected, setConnected] = useSleepConnected();
  const [busy, setBusy] = useState(false);
  const nights = useSleepNights(!!connected);
  if (!sleepSupported() || connected === null) return null;

  const connect = async () => {
    setBusy(true);
    try {
      const ok = await connectSleep();
      setConnected(ok);
      track("sleep_connected", { ok });
      await qc.invalidateQueries({ queryKey: keys.sleep });
      // New sleep data can change the personal recommendations.
      if (memberId) api("/api/insights", { body: { scope: "member", memberId, reason: "sleep" } }).then(() => qc.invalidateQueries({ queryKey: ["insights"] })).catch(() => {});
    } catch {
      toast(t.common.genericError, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!connected) {
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Feather name="moon" size={18} color={colors.pen} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="h3">{t.sleep.connectTitle}</T>
            <T v="small">{t.sleep.connectBody}</T>
          </View>
        </View>
        <Button label={t.sleep.connect} kind="ink" icon="heart" small loading={busy} onPress={connect} />
      </Card>
    );
  }

  const stats = sleepStats(nights.data ?? []);
  return (
    <Card style={styles.card} onPress={() => router.push("/sleep")}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <T v="caption">{t.sleep.title}</T>
        <Feather name="chevron-right" size={16} color={colors.ink3} />
      </View>
      {stats.nights.length ? (
        <>
          <View style={[styles.row, { alignItems: "baseline", gap: 18 }]}>
            <View>
              <T v="title" style={{ fontSize: 26 }}>
                {hm(stats.avgAsleep, t.sleep)}
              </T>
              <T v="caption">{t.sleep.avg}</T>
            </View>
            <View>
              <T v="h2">{stats.avgBedtime ?? "—"}</T>
              <T v="caption">{t.sleep.bedtime}</T>
            </View>
          </View>
          <SleepBars nights={stats.nights.slice(-14)} height={56} />
          {stats.shortNights ? <T v="small" style={{ color: colors.pen }}>{fill(t.sleep.shortNights, { n: stats.shortNights })}</T> : null}
        </>
      ) : (
        <T v="small">{t.sleep.noData}</T>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.penSoft, alignItems: "center", justifyContent: "center" },
  goal: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.ruleStrong, borderRadius: radius.sm },
});
