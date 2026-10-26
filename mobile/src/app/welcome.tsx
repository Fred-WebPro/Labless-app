import { router } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loupe, PenUnderline, Wordmark } from "@/components/Pen";
import { Button, T, tap } from "@/components/ui";
import { LOCALES, useI18n } from "@/i18n";
import { colors, fonts } from "@/lib/theme";

function SlideArt({ index }: { index: number }) {
  if (index === 0) {
    return (
      <View style={styles.sheet}>
        {["Glucose  98", "Insulin  13.2", "ALT  38", "CRP  2.1"].map((row, i) => (
          <View key={row} style={styles.sheetRow}>
            <Text style={styles.sheetText}>{row}</Text>
            {i === 1 ? <Text style={styles.sheetNote}>HOMA-IR 3.2 !</Text> : i === 2 ? <Text style={styles.sheetNote}>AST/ALT ?</Text> : null}
          </View>
        ))}
      </View>
    );
  }
  if (index === 1) return <Loupe size={150} />;
  return (
    <View style={{ flexDirection: "row", gap: -12 }}>
      {[colors.pen, colors.ink, "#2F5BD3", "#1F7A4D"].map((c, i) => (
        <View key={i} style={[styles.bubble, { backgroundColor: c, marginLeft: i ? -14 : 0 }]} />
      ))}
    </View>
  );
}

export default function Welcome() {
  const { t, locale, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const slides = t.welcome.slides;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== index) setIndex(i);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 18) }]}>
      <View style={styles.top}>
        <Wordmark size={24} />
        <View style={styles.langs}>
          {LOCALES.map((l) => (
            <Pressable
              key={l.code}
              accessibilityRole="button"
              accessibilityLabel={l.name}
              onPress={() => {
                tap();
                setLocale(l.code);
              }}
              style={[styles.lang, locale === l.code && styles.langOn]}
            >
              <Text style={[styles.langText, locale === l.code && { color: colors.onInk }]}>{l.code.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyExtractor={(_, i) => String(i)}
        style={{ flexGrow: 1 }}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.art}>
              <SlideArt index={i} />
            </View>
            <View style={{ gap: 12 }}>
              <T v="display">{item.title}</T>
              {i === 0 ? <PenUnderline width={180} /> : null}
              <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>
                {item.body}
              </T>
            </View>
          </View>
        )}
      />

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <Pressable key={i} hitSlop={8} onPress={() => list.current?.scrollToIndex({ index: i, animated: true })}>
            <View style={[styles.dotItem, i === index && styles.dotOn]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <Button label={t.welcome.create} kind="pen" onPress={() => router.push("/sign-up")} testID="welcome-create" />
        <Button label={t.welcome.signIn} kind="ghost" onPress={() => router.push("/sign-in")} testID="welcome-signin" />
        <T v="caption" style={{ textAlign: "center", marginTop: 4 }}>
          {t.common.notDiagnosis}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  langs: { flexDirection: "row", borderWidth: 1, borderColor: colors.rule, borderRadius: 999, padding: 3 },
  lang: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  langOn: { backgroundColor: colors.ink },
  langText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.ink3 },
  slide: { paddingHorizontal: 24, justifyContent: "flex-end", paddingBottom: 12, gap: 28 },
  art: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 },
  sheet: {
    width: "88%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    borderRadius: 6,
    padding: 16,
    gap: 4,
    backgroundColor: colors.card,
    transform: [{ rotate: "-2deg" }],
  },
  sheetRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule, paddingVertical: 8 },
  sheetText: { fontFamily: fonts.mono, fontSize: 14, color: colors.ink },
  sheetNote: { fontFamily: fonts.hand, fontSize: 21, color: colors.pen, marginTop: 2 },
  bubble: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: colors.paper },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 18 },
  dotItem: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ruleStrong },
  dotOn: { width: 22, backgroundColor: colors.ink },
  actions: { paddingHorizontal: 20, gap: 10 },
});
