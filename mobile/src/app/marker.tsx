import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { TrendChart } from "@/components/Chart";
import { Card, Empty, Header, Screen, SectionTitle, T } from "@/components/ui";
import { formatDate, formatNumber, useI18n } from "@/i18n";
import { useMember, useMemberResults } from "@/lib/data";
import { colors, fonts } from "@/lib/theme";

export default function MarkerScreen() {
  const { memberId, marker, name } = useLocalSearchParams<{ memberId: string; marker: string; name?: string }>();
  const { t, locale } = useI18n();
  const { data: member } = useMember(memberId);
  const results = useMemberResults(memberId);

  const rows = useMemo(
    () =>
      (results.data ?? [])
        .filter((r) => r.marker === marker && r.value != null)
        .sort((a, b) => (a.collected_at ?? a.created_at).localeCompare(b.collected_at ?? b.created_at)),
    [results.data, marker],
  );
  const last = rows[rows.length - 1];
  const low = last?.ref_low != null ? Number(last.ref_low) : null;
  const high = last?.ref_high != null ? Number(last.ref_high) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} title={name ?? last?.name ?? marker} subtitle={member?.name} />
      <Screen>
        {results.isLoading ? (
          <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
        ) : !rows.length ? (
          <Empty icon="activity" title={t.marker.noData} />
        ) : (
          <>
            <View style={{ marginTop: 8, gap: 2 }}>
              <Text style={styles.big}>
                {formatNumber(Number(last.value), locale)}
                {last.unit ? <Text style={styles.unit}> {last.unit}</Text> : null}
              </Text>
              <T v="caption">{formatDate(last.collected_at ?? last.created_at, locale)}</T>
              {last.ref_text ? <T v="small">{last.ref_text}</T> : null}
            </View>
            <Card style={{ marginTop: 18, paddingHorizontal: 8 }}>
              <TrendChart
                data={rows.map((r) => ({ x: formatDate(r.collected_at ?? r.created_at, locale, { month: "short", year: "2-digit" }), y: Number(r.value) }))}
                low={low}
                high={high}
                format={(v) => formatNumber(v, locale)}
              />
            </Card>
            <SectionTitle title={t.marker.history} />
            {[...rows].reverse().map((r) => {
              const flagged = r.flag && r.flag !== "normal";
              return (
                <View key={r.id} style={styles.row}>
                  <T v="small" style={{ flex: 1 }}>
                    {formatDate(r.collected_at ?? r.created_at, locale)}
                  </T>
                  {flagged ? <Text style={styles.flag}>{t.report.flags[r.flag!]}</Text> : null}
                  <Text style={[styles.val, flagged && { color: colors.pen }]}>
                    {formatNumber(Number(r.value), locale)} <Text style={styles.unit}>{r.unit}</Text>
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontFamily: fonts.bold, fontSize: 44, letterSpacing: -1.5, color: colors.ink },
  unit: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink3, letterSpacing: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  val: { fontFamily: fonts.semibold, fontSize: 15.5, color: colors.ink },
  flag: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.pen },
});
