import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, RefreshControl, StyleSheet, View } from "react-native";
import { confirm } from "@/components/confirm";
import { SleepBars, SleepCard, hm, useSleepConnected } from "@/components/Sleep";
import { Button, Card, Empty, Header, Screen, T } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { keys, useSleepNights } from "@/lib/data";
import { useSelectedMember } from "@/lib/selected";
import { disconnectSleep, lastSleepSamples, sleepStats, sleepSupported, syncSleep } from "@/lib/sleep";
import { colors } from "@/lib/theme";

/** Sleep from Apple Health: 30-night averages, the nightly chart and how it feeds the reading. */
export default function SleepScreen() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { selected } = useSelectedMember();
  const [connected, setConnected] = useSleepConnected();
  const nights = useSleepNights(!!connected);
  const [refreshing, setRefreshing] = useState(false);
  const [samples, setSamples] = useState<number | null>(null);
  useEffect(() => {
    lastSleepSamples().then(setSamples);
  }, [connected]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const refresh = async () => {
    setRefreshing(true);
    await syncSleep(true);
    await nights.refetch();
    setSamples(await lastSleepSamples());
    setRefreshing(false);
  };

  const disconnect = async () => {
    const ok = await confirm({ title: t.sleep.disconnectTitle, message: t.sleep.disconnectBody, confirm: t.sleep.disconnect, cancel: t.common.cancel, destructive: true });
    if (!ok) return;
    await disconnectSleep();
    setConnected(false);
    await qc.invalidateQueries({ queryKey: keys.sleep });
  };

  const stats = sleepStats(nights.data ?? []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header onBack={back} title={t.sleep.title} />
      <Screen refresh={connected ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} /> : undefined}>
        {!sleepSupported() ? (
          <Empty icon="moon" title={t.sleep.unavailableTitle} body={t.sleep.unavailableBody} />
        ) : !connected ? (
          <View style={{ marginTop: 8 }}>
            <SleepCard memberId={selected?.is_self ? selected.id : undefined} />
          </View>
        ) : (
          <>
            {nights.isSuccess && !nights.data?.length ? (
              <Card style={{ gap: 10, marginBottom: 14, backgroundColor: colors.penTint, borderColor: colors.penSoft }}>
                <T v="h3">{t.sleep.noRecordsTitle}</T>
                <T v="small">{samples ? t.sleep.shortRecordsBody : t.sleep.noRecordsBody}</T>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button small kind="ink" icon="refresh-cw" label={t.sleep.syncNow} onPress={refresh} loading={refreshing} style={{ flex: 1 }} />
                  <Button small kind="ghost" icon="heart" label={t.sleep.openHealth} onPress={() => Linking.openURL("x-apple-health://").catch(() => {})} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null}
            <View style={styles.stats}>
              <Stat value={hm(stats.avgAsleep, t.sleep)} label={t.sleep.avg} />
              <Stat value={stats.avgBedtime ?? "—"} label={t.sleep.bedtime} />
              <Stat value={stats.spreadMin == null ? "—" : `±${stats.spreadMin} ${t.sleep.m}`} label={t.sleep.spread} />
            </View>
            <Card style={{ gap: 12, marginTop: 18 }}>
              <T v="caption">{t.sleep.last30}</T>
              {stats.nights.length ? <SleepBars nights={stats.nights} height={120} /> : <T v="small">{t.sleep.noData}</T>}
              <T v="caption">{fill(t.sleep.shortNights, { n: stats.shortNights })}</T>
            </Card>
            <Card style={{ gap: 6, marginTop: 14, backgroundColor: colors.penTint, borderColor: colors.penSoft }}>
              <T v="h3">{t.sleep.whyTitle}</T>
              <T v="small">{t.sleep.whyBody}</T>
            </Card>
            <View style={{ marginTop: 18 }}>
              {[...stats.nights].reverse().slice(0, 10).map((n) => (
                <View key={n.night} style={styles.night}>
                  <T v="smallMedium" style={{ flex: 1 }}>
                    {formatDate(n.night, locale, { weekday: "short", day: "numeric", month: "short" })}
                  </T>
                  <T v="small" style={{ color: n.asleep_min < 360 ? colors.pen : colors.ink }}>
                    {hm(n.asleep_min, t.sleep)}
                  </T>
                </View>
              ))}
            </View>
            <Button label={t.sleep.disconnect} kind="ghost" onPress={disconnect} style={{ marginTop: 22 }} />
          </>
        )}
      </Screen>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="h2">{value}</T>
      <T v="caption">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 12, marginTop: 8 },
  night: { flexDirection: "row", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule },
});
