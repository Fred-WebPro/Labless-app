import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card, T, tap, type IconName } from "@/components/ui";
import { useI18n } from "@/i18n";
import { useInsights } from "@/lib/data";
import { colors, fonts, radius } from "@/lib/theme";
import type { InsightItem } from "@/lib/types";

const KIND_ICON: Record<InsightItem["kind"], IconName> = {
  connection: "link-2",
  experiment: "zap",
  timing: "clock",
  ask_doctor: "message-circle",
  relax: "smile",
  family: "users",
};

export function InsightCard({ item, open = false }: { item: InsightItem; open?: boolean }) {
  const { t } = useI18n();
  return (
    <View style={styles.item}>
      <View style={styles.icon}>
        <Feather name={KIND_ICON[item.kind] ?? "star"} size={17} color={colors.pen} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="caption">
          {t.insights.kind[item.kind]} · {t.insights.horizon[item.horizon]}
        </T>
        <T v="h3">{item.title}</T>
        <T v="small" numberOfLines={open ? undefined : 3}>
          {item.detail}
        </T>
        {open && item.why ? (
          <T v="caption" style={{ marginTop: 2 }}>
            {t.insights.why}: {item.why}
          </T>
        ) : null}
        {open && item.readout ? (
          <View style={styles.readout}>
            <Feather name="crosshair" size={13} color={colors.ink2} />
            <T v="small" style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.medium, color: colors.ink }}>{t.insights.readout}: </Text>
              {item.readout}
            </T>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Headline and the first two recommendations, with a link to the full list. */
export function InsightsPreview({ scope, memberId, title }: { scope: "member" | "family"; memberId?: string; title: string }) {
  const { t } = useI18n();
  const q = useInsights(scope, memberId);
  const data = q.data?.insights;

  if (q.isLoading) {
    return (
      <Card style={styles.card}>
        <T v="caption">{title}</T>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 }}>
          <ActivityIndicator color={colors.pen} />
          <T v="small">{t.insights.preparing}</T>
        </View>
      </Card>
    );
  }
  if (!data?.items?.length) {
    if (scope === "family" && q.data?.reason === "need_two_people") {
      return (
        <Card style={styles.card} onPress={() => router.push("/member/edit")}>
          <T v="caption">{title}</T>
          <T v="bodyMedium">{t.insights.familyEmpty}</T>
          <T v="small" style={{ color: colors.pen }}>
            {t.family.add} →
          </T>
        </Card>
      );
    }
    return null;
  }

  const open = () => {
    tap();
    router.push({ pathname: "/insights", params: scope === "family" ? { scope } : { scope, memberId } });
  };

  return (
    <Card style={styles.card}>
      <T v="caption">{title}</T>
      {data.headline ? <T v="handLarge" style={{ fontSize: 26, lineHeight: 28 }}>{data.headline}</T> : null}
      {data.items.slice(0, 2).map((x, i) => (
        <InsightCard key={i} item={x} />
      ))}
      <Pressable onPress={open} hitSlop={8} style={styles.more} accessibilityRole="button">
        <T v="smallMedium" style={{ color: colors.pen }}>
          {t.insights.all} · {data.items.length}
        </T>
        <Feather name="arrow-right" size={15} color={colors.pen} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 18 },
  item: { flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.penSoft, alignItems: "center", justifyContent: "center" },
  readout: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.paper2, borderRadius: radius.md, padding: 10, marginTop: 4 },
  more: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 },
});
