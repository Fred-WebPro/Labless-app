import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InsightsPreview } from "@/components/Insights";
import { StatusBadge } from "@/components/report";
import { Avatar, Button, Card, Screen, T } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { useAnalyses, useMembers, useReports } from "@/lib/data";
import { ageOf } from "@/lib/format";
import { colors } from "@/lib/theme";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export default function Family() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const members = useMembers();
  const reports = useReports();
  const analyses = useAnalyses();
  const [refreshing, setRefreshing] = useState(false);
  useRefreshOnFocus(useCallback(() => {
    reports.refetch();
    analyses.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([members.refetch(), reports.refetch(), analyses.refetch()]);
    setRefreshing(false);
  };

  return (
    <Screen safeTop refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} />}>
      <View style={[styles.head, { paddingTop: insets.top + 18 }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="title">{t.family.title}</T>
          <T v="body">{t.family.subtitle}</T>
        </View>
      </View>

      {!members.isLoading && (analyses.data?.length ?? 0) > 0 ? (
        <View style={{ marginTop: 22 }}>
          <InsightsPreview scope="family" title={t.insights.familyTitle} />
        </View>
      ) : null}

      {members.isLoading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 12, marginTop: 22 }}>
          {members.data?.map((m) => {
            const own = reports.data?.filter((r) => r.member_id === m.id) ?? [];
            const last = own[0];
            const analysis = analyses.data?.find((a) => a.report_id === last?.id);
            const age = ageOf(m.birth_date);
            return (
              <Card key={m.id} onPress={() => router.push(`/member/${m.id}`)} style={styles.card}>
                <Avatar name={m.name} color={m.color} size={50} photo={m.photo_url} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="h3" numberOfLines={1}>
                    {m.name}
                  </T>
                  <T v="small" numberOfLines={1}>
                    {[t.family.relations[m.relation], age != null ? fill(t.member.age, { n: age }) : null].filter(Boolean).join(" · ")}
                  </T>
                  <T v="caption" numberOfLines={1}>
                    {last ? fill(t.family.lastReading, { date: formatDate(last.collected_at ?? last.created_at, locale) }) : t.family.noReports}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  {analysis?.status && last?.status === "ready" ? <StatusBadge status={analysis.status} /> : null}
                  <Feather name="chevron-right" size={18} color={colors.ink3} />
                </View>
              </Card>
            );
          })}
          <Button label={t.family.add} kind="ghost" icon="user-plus" onPress={() => router.push("/member/edit")} style={{ marginTop: 6 }} testID="family-add" />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
});
