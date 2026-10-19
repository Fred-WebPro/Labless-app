import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tap, type IconName } from "@/components/ui";
import { useInbox } from "@/lib/data";
import { useI18n } from "@/i18n";
import { colors, fonts } from "@/lib/theme";

const ICONS: Record<string, IconName> = { index: "home", family: "users", inbox: "bell", profile: "user" };

/** Four tabs with a raised upload button in the middle. */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { data: inbox } = useInbox();
  const unread = inbox?.filter((n) => !n.read_at).length ?? 0;
  const labels: Record<string, string> = { index: t.tabs.home, family: t.tabs.family, inbox: t.tabs.inbox, profile: t.tabs.profile };

  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={labels[route.name]}
        onPress={() => {
          tap();
          if (!focused) navigateToTab(route.key);
        }}
        style={styles.item}
      >
        <View>
          <Feather name={ICONS[route.name] ?? "circle"} size={22} color={focused ? colors.ink : colors.ink3} />
          {route.name === "inbox" && unread > 0 ? <View style={styles.dot} /> : null}
        </View>
        <Text style={[styles.label, { color: focused ? colors.ink : colors.ink3 }]} numberOfLines={1}>
          {labels[route.name]}
        </Text>
      </Pressable>
    );
  });

  const upload = (
    <Pressable
      key="upload"
      accessibilityRole="button"
      accessibilityLabel={t.tabs.upload}
      onPress={() => {
        tap();
        router.push("/upload");
      }}
      style={styles.item}
    >
      {({ pressed }) => (
        <View style={[styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Feather name="plus" size={26} color="#fff" />
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.slice(0, 2)}
      {upload}
      {items.slice(2)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ruleStrong,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, minHeight: 50 },
  label: { fontFamily: fonts.medium, fontSize: 11.5 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.pen,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -16,
    shadowColor: colors.pen,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dot: { position: "absolute", top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pen, borderWidth: 1.5, borderColor: colors.paper },
});
