import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Empty, LinkButton, Screen, T, tap } from "@/components/ui";
import { hasTarget, openTarget } from "@/lib/notify";
import { formatDate, useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { useInbox, useMarkRead } from "@/lib/data";
import { colors } from "@/lib/theme";

export default function Inbox() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const [refreshing, setRefreshing] = useState(false);
  const unread = inbox.data?.filter((n) => !n.read_at) ?? [];

  useFocusEffect(
    useCallback(() => {
      track("inbox_opened");
      inbox.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const refresh = async () => {
    setRefreshing(true);
    await inbox.refetch();
    setRefreshing(false);
  };

  return (
    <Screen safeTop refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} />}>
      <View style={[styles.head, { paddingTop: insets.top + 18 }]}>
        <T v="title">{t.inbox.title}</T>
        {unread.length ? <LinkButton label={t.inbox.markAll} onPress={() => markRead.mutate(unread.map((n) => n.id))} color={colors.pen} /> : null}
      </View>

      {inbox.isLoading ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 40 }} />
      ) : !inbox.data?.length ? (
        <Empty icon="bell" title={t.inbox.emptyTitle} body={t.inbox.emptyBody} />
      ) : (
        <View style={{ marginTop: 14 }}>
          {inbox.data.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => {
                tap();
                if (!n.read_at) markRead.mutate([n.id]);
                if (hasTarget(n.data)) openTarget(n.data);
              }}
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.paper2 }]}
            >
              <View style={[styles.dot, n.read_at ? { backgroundColor: "transparent" } : null]} />
              <View style={{ flex: 1, gap: 4 }}>
                <T v="bodyMedium">{n.title}</T>
                <T v="small">{n.body}</T>
                <T v="caption">{formatDate(n.created_at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</T>
                {hasTarget(n.data) ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <T v="smallMedium" style={{ color: colors.pen }}>
                      {n.data?.url ? t.inbox.openLink : t.inbox.open}
                    </T>
                    <Feather name={n.data?.url ? "external-link" : "arrow-right"} size={14} color={colors.pen} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  item: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pen, marginTop: 7 },
});
