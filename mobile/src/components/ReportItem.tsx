import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { StatusBadge } from "@/components/report";
import { T, tap } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { colors } from "@/lib/theme";
import type { Analysis, Report } from "@/lib/types";

/** One report in a list: date, lab, and its reading status. */
export function ReportItem({ report, analysis, memberName }: { report: Report; analysis?: Pick<Analysis, "status" | "findings"> | null; memberName?: string }) {
  const { t, locale } = useI18n();
  const date = formatDate(report.collected_at ?? report.created_at, locale);
  const busy = report.status === "processing" || report.status === "uploaded";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        router.push(`/report/${report.id}`);
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper2 }]}
    >
      <View style={styles.icon}>
        {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Feather name={report.status === "failed" ? "alert-circle" : "file-text"} size={18} color={report.status === "failed" ? colors.pen : colors.ink} />}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="smallMedium" numberOfLines={1}>
          {[memberName, report.lab_name || date].filter(Boolean).join(" · ")}
        </T>
        <T v="caption" numberOfLines={1}>
          {busy ? t.home.processing : report.status === "failed" ? t.home.failed : report.lab_name ? date : analysis ? fill(t.home.findings, { n: analysis.findings?.length ?? 0 }) : date}
        </T>
      </View>
      {analysis?.status && report.status === "ready" ? <StatusBadge status={analysis.status} /> : null}
      <Feather name="chevron-right" size={18} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.paper2, alignItems: "center", justifyContent: "center" },
});
