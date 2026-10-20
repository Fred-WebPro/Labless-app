import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { InsightCard } from "@/components/Insights";
import { Empty, Header, Screen, T } from "@/components/ui";
import { formatDate, useI18n } from "@/i18n";
import { useInsights, useMember } from "@/lib/data";
import { useSelectedMember } from "@/lib/selected";
import { colors } from "@/lib/theme";

/** All recommendations for one person, or for the whole family. Opened from Home, Family or a notification. */
export default function InsightsScreen() {
  const params = useLocalSearchParams<{ scope?: string; memberId?: string }>();
  const { t, locale } = useI18n();
  const { selected } = useSelectedMember();
  const scope = params.scope === "family" ? "family" : "member";
  const memberId = scope === "member" ? (params.memberId ?? selected?.id) : undefined;
  const { data: member } = useMember(memberId);
  const q = useInsights(scope, memberId);
  const data = q.data?.insights;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header
        onBack={back}
        title={scope === "family" ? t.insights.familyTitle : t.insights.title}
        subtitle={scope === "family" ? undefined : member?.name}
      />
      <Screen>
        {q.isLoading ? (
          <View style={{ alignItems: "center", gap: 12, marginTop: 60 }}>
            <ActivityIndicator color={colors.pen} />
            <T v="small">{t.insights.preparing}</T>
          </View>
        ) : !data?.items?.length ? (
          <Empty icon="star" title={t.insights.emptyTitle} body={scope === "family" ? t.insights.familyEmpty : t.insights.emptyBody} />
        ) : (
          <>
            {data.headline ? (
              <T v="handLarge" style={{ fontSize: 30, lineHeight: 32, marginTop: 6 }}>
                {data.headline}
              </T>
            ) : null}
            <View style={{ marginTop: 14 }}>
              {data.items.map((x, i) => (
                <InsightCard key={i} item={x} open />
              ))}
            </View>
            <T v="caption" style={{ marginTop: 18 }}>
              {t.insights.updated} {formatDate(data.updated_at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </T>
            <T v="caption" style={{ marginTop: 6 }}>
              {t.common.notDiagnosis}
            </T>
          </>
        )}
      </Screen>
    </View>
  );
}
