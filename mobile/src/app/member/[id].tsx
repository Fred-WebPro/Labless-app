import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkline } from "@/components/Chart";
import { confirm } from "@/components/confirm";
import { ReportItem } from "@/components/ReportItem";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, Empty, Header, IconButton, Loading, Screen, SectionTitle, T, tap } from "@/components/ui";
import { fill, formatNumber, useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { useAnalyses, useDeleteMember, useMember, useMemberResults, useReports } from "@/lib/data";
import { ageOf } from "@/lib/format";
import { useSelectedMember } from "@/lib/selected";
import { colors, fonts } from "@/lib/theme";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { data: member, isLoading } = useMember(id);
  const reports = useReports(id);
  const analyses = useAnalyses();
  const results = useMemberResults(id);
  const del = useDeleteMember();
  const { select } = useSelectedMember();
  useRefreshOnFocus(useCallback(() => {
    reports.refetch();
    results.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const trends = useMemo(() => {
    const byMarker = new Map<string, { name: string; unit: string | null; values: number[] }>();
    for (const r of results.data ?? []) {
      if (r.value == null || r.marker.startsWith("other:")) continue;
      const entry = byMarker.get(r.marker) ?? { name: r.name, unit: r.unit, values: [] };
      entry.values.push(Number(r.value));
      byMarker.set(r.marker, entry);
    }
    return [...byMarker.entries()].filter(([, v]) => v.values.length >= 2).slice(0, 20);
  }, [results.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/family"));

  if (isLoading) return <Loading />;
  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        <Header onBack={back} />
        <Empty icon="user-x" title={t.common.genericError} action={<Button label={t.common.back} kind="ghost" onPress={back} />} />
      </View>
    );
  }

  const age = ageOf(member.birth_date);
  const remove = async () => {
    const ok = await confirm({
      title: fill(t.member.deleteTitle, { name: member.name }),
      message: t.member.deleteBody,
      confirm: t.common.delete,
      cancel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(member.id);
      track("member_deleted");
      back();
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header
        onBack={back}
        right={
          <View style={{ flexDirection: "row" }}>
            <IconButton icon="edit-2" label={t.common.edit} onPress={() => router.push({ pathname: "/member/edit", params: { id: member.id } })} />
            {!member.is_self ? <IconButton icon="trash-2" label={t.common.delete} onPress={remove} /> : null}
          </View>
        }
      />
      <Screen>
        <View style={styles.head}>
          <Avatar name={member.name} color={member.color} size={72} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="title" numberOfLines={2}>
              {member.name}
            </T>
            <T v="body">{[t.family.relations[member.relation], age != null ? fill(t.member.age, { n: age }) : null].filter(Boolean).join(" · ")}</T>
          </View>
        </View>

        <Button
          label={t.home.upload}
          kind="pen"
          icon="camera"
          onPress={() => {
            select(member.id);
            router.push({ pathname: "/upload", params: { memberId: member.id } });
          }}
          style={{ marginTop: 22 }}
        />

        <SectionTitle title={t.member.trends} />
        {results.isLoading ? (
          <ActivityIndicator color={colors.ink} />
        ) : trends.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {trends.map(([marker, v]) => {
              const last = v.values[v.values.length - 1];
              const prev = v.values[v.values.length - 2];
              const delta = prev ? ((last - prev) / Math.abs(prev)) * 100 : 0;
              return (
                <Pressable
                  key={marker}
                  onPress={() => {
                    tap();
                    router.push({ pathname: "/marker", params: { memberId: member.id, marker, name: v.name } });
                  }}
                  style={({ pressed }) => [styles.trend, pressed && { backgroundColor: colors.paper2 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="smallMedium" numberOfLines={1}>
                      {v.name}
                    </T>
                    <Text style={[styles.delta, { color: Math.abs(delta) < 5 ? colors.ink3 : delta > 0 ? colors.pen : colors.good }]}>
                      {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(Math.round(delta))}%
                    </Text>
                  </View>
                  <Sparkline points={v.values} />
                  <Text style={styles.value}>
                    {formatNumber(last, locale)}
                    {v.unit ? <Text style={styles.unit}> {v.unit}</Text> : null}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <T v="small">{t.member.trendsEmpty}</T>
        )}

        <SectionTitle title={t.member.reports} />
        {reports.isLoading ? (
          <ActivityIndicator color={colors.ink} />
        ) : reports.data?.length ? (
          reports.data.map((r) => <ReportItem key={r.id} report={r} analysis={analyses.data?.find((a) => a.report_id === r.id)} />)
        ) : (
          <Empty icon="file-plus" title={fill(t.member.noReportsTitle, { name: member.name })} body={t.member.noReportsBody} />
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 },
  trend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  delta: { fontFamily: fonts.medium, fontSize: 12.5 },
  value: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, minWidth: 70, textAlign: "right" },
  unit: { fontFamily: fonts.regular, fontSize: 11, color: colors.ink3 },
});
