import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PenUnderline } from "@/components/Pen";
import { ReportItem } from "@/components/ReportItem";
import { Sparkline } from "@/components/Chart";
import { InsightsPreview } from "@/components/Insights";
import { AdviceCard, StatusBadge } from "@/components/report";
import { SleepCard } from "@/components/Sleep";
import { Avatar, Button, Card, Empty, Screen, SectionTitle, T, tap } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { seriesByMarker } from "@/lib/compare";
import { useAnalyses, useMemberResults, useMembers, useProfile, useReports } from "@/lib/data";
import { useSelectedMember } from "@/lib/selected";
import { colors, fonts, radius } from "@/lib/theme";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export default function Home() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: members } = useMembers();
  const { selected, select } = useSelectedMember();
  const reports = useReports(selected?.id);
  const analyses = useAnalyses();
  const [refreshing, setRefreshing] = useState(false);
  const results = useMemberResults(selected?.id);
  const moved = useMemo(
    () =>
      seriesByMarker(results.data ?? [])
        .filter((s) => s.pct != null && Math.abs(s.pct) >= 3)
        .sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!))
        .slice(0, 3),
    [results.data],
  );
  const hasReady = (reports.data ?? []).some((r) => r.status === "ready");
  useRefreshOnFocus(useCallback(() => {
    reports.refetch();
    analyses.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const list = reports.data ?? [];
  const latest = list[0];
  const latestAnalysis = analyses.data?.find((a) => a.report_id === latest?.id);
  // The newest reading that has advice; a different tip each day.
  const tipSource = analyses.data?.find((a) => a.member_id === selected?.id && a.advice?.length);
  const [day] = useState(() => Math.floor(Date.now() / 86_400_000));
  const tip = tipSource?.advice?.[day % tipSource.advice.length];
  const firstName = (profile?.full_name || members?.find((m) => m.is_self)?.name || "").split(" ")[0];

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([reports.refetch(), analyses.refetch(), results.refetch()]);
    setRefreshing(false);
  };

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} />}>
      <View style={{ paddingTop: insets.top + 18, gap: 4 }}>
        <T v="title">{fill(t.home.hello, { name: firstName || "👋" })}</T>
        <T v="body">{t.home.subtitle}</T>
      </View>

      {members && members.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {members.map((m) => {
            const on = m.id === selected?.id;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  select(m.id);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Avatar name={m.name} color={m.color} size={26} photo={m.photo_url} />
                <Text style={[styles.chipText, on && { color: colors.onInk }]} numberOfLines={1}>
                  {m.is_self ? t.member.you : m.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {reports.isLoading ? (
        <View style={{ paddingVertical: 60 }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : !latest ? (
        <Card style={{ marginTop: 22, padding: 22 }}>
          <Empty
            icon="file-plus"
            title={t.home.emptyTitle}
            body={t.home.emptyBody}
            action={<Button label={selected && !selected.is_self ? fill(t.home.uploadFor, { name: selected.name.split(" ")[0] }) : t.home.upload} kind="pen" icon="camera" onPress={() => router.push("/upload")} />}
          />
        </Card>
      ) : (
        <>
          <SectionTitle title={t.home.latest} />
          <Card onPress={() => router.push(`/report/${latest.id}`)} style={styles.latest} testID="home-latest">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <T v="caption">{formatDate(latest.collected_at ?? latest.created_at, locale)}</T>
              {latest.status === "ready" && latestAnalysis?.status ? <StatusBadge status={latestAnalysis.status} /> : null}
            </View>
            {latest.status === "processing" || latest.status === "uploaded" ? (
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 10 }}>
                <ActivityIndicator color={colors.pen} />
                <T v="bodyMedium">{t.home.processing}</T>
              </View>
            ) : latest.status === "failed" ? (
              <T v="bodyMedium" style={{ color: colors.pen }}>
                {t.home.failed}
              </T>
            ) : latestAnalysis ? (
              <>
                <T v="h2" numberOfLines={4}>
                  {latestAnalysis.summary}
                </T>
                <PenUnderline width={120} />
                {latestAnalysis.findings?.slice(0, 3).map((f, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text style={styles.bulletMark}>{i + 1}</Text>
                    <T v="small" style={{ flex: 1 }} numberOfLines={2}>
                      <Text style={{ fontFamily: fonts.medium, color: colors.ink }}>{f.title}. </Text>
                      {f.detail}
                    </T>
                  </View>
                ))}
                {latestAnalysis.next_steps?.[0] ? (
                  <View style={styles.next}>
                    <Feather name="arrow-right-circle" size={18} color={colors.pen} />
                    <View style={{ flex: 1 }}>
                      <T v="caption">{t.home.nextStep}</T>
                      <T v="smallMedium">{latestAnalysis.next_steps[0].title}</T>
                    </View>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
                  <T v="caption">{fill(t.home.findings, { n: latestAnalysis.findings?.length ?? 0 })}</T>
                  <T v="caption">{fill(t.home.hidden, { n: latestAnalysis.hidden_tests?.length ?? 0 })}</T>
                </View>
              </>
            ) : (
              <ActivityIndicator color={colors.ink} />
            )}
          </Card>

          {tip && tipSource ? (
            <>
              <SectionTitle title={t.home.tip} />
              <Card onPress={() => router.push(`/report/${tipSource.report_id}`)} style={{ paddingVertical: 2 }}>
                <AdviceCard advice={tip} />
              </Card>
            </>
          ) : null}

          {hasReady && selected ? (
            <>
              <SectionTitle title={t.insights.title} />
              <InsightsPreview scope="member" memberId={selected.id} title={selected.is_self ? t.insights.forYou : fill(t.insights.forName, { name: selected.name.split(" ")[0] })} />
            </>
          ) : null}

          {hasReady && selected ? (
            <>
              <SectionTitle title={t.home.analytics} action={t.common.seeAll} onAction={() => router.push(`/member/${selected.id}`)} />
              <Card onPress={() => router.push(`/member/${selected.id}`)} style={{ paddingVertical: 6 }}>
                {moved.length ? (
                  moved.map((s) => (
                    <View key={s.marker} style={styles.moveRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <T v="smallMedium" numberOfLines={1}>
                          {s.name}
                        </T>
                        <T v="caption" style={{ color: s.outOfRange ? colors.pen : colors.ink3 }}>
                          {s.pct! > 0 ? "↑" : "↓"} {Math.abs(Math.round(s.pct!))}% · {s.values.length} {t.home.points}
                        </T>
                      </View>
                      <Sparkline points={s.values} width={70} height={28} color={s.outOfRange ? "pen" : "ink"} />
                    </View>
                  ))
                ) : (
                  <T v="small" style={{ paddingVertical: 12 }}>
                    {t.home.analyticsEmpty}
                  </T>
                )}
              </Card>
            </>
          ) : null}

          {selected?.is_self ? (
            <>
              <SectionTitle title={t.sleep.title} />
              <SleepCard memberId={selected.id} />
            </>
          ) : null}

          <SectionTitle
            title={t.home.reports}
            action={selected ? t.common.seeAll : undefined}
            onAction={selected ? () => router.push(`/member/${selected.id}`) : undefined}
          />
          <View>
            {list.slice(0, 5).map((r) => (
              <ReportItem key={r.id} report={r} analysis={analyses.data?.find((a) => a.report_id === r.id)} />
            ))}
          </View>
          <Button label={t.home.upload} kind="ghost" icon="plus" onPress={() => router.push("/upload")} style={{ marginTop: 18 }} />
        </>
      )}

      <T v="caption" style={{ textAlign: "center", marginTop: 28 }}>
        {t.common.notDiagnosis}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.paper,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, maxWidth: 120 },
  latest: { gap: 12, padding: 20 },
  bullet: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bulletMark: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 22, color: colors.pen, width: 14 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule },
  next: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: colors.paper2,
    padding: 12,
    borderRadius: radius.md,
    marginTop: 4,
  },
});
