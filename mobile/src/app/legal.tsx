import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Header, Screen, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { colors } from "@/lib/theme";

export default function Legal() {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header
        title={t.legal.title}
        right={
          <Pressable hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityLabel={t.common.close}>
            <Feather name="x" size={22} color={colors.ink} />
          </Pressable>
        }
      />
      <Screen>
        <View style={{ gap: 22, marginTop: 10 }}>
          {t.legal.sections.map((s) => (
            <View key={s.title} style={{ gap: 6 }}>
              <T v="h3">{s.title}</T>
              <T v="body">{s.body}</T>
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}
