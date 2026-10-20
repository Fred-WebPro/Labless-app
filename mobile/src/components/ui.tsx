import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { forwardRef, useEffect, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/i18n";
import { colors, fonts, radius, space, useHex } from "@/lib/theme";

export type IconName = ComponentProps<typeof Feather>["name"];

export const tap = () => {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
};

// ---------- Text ----------

type Variant = "display" | "title" | "h2" | "h3" | "body" | "bodyMedium" | "small" | "smallMedium" | "caption" | "mono" | "hand" | "handLarge";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 37, letterSpacing: -1.2, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, color: colors.ink },
  h2: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 26, letterSpacing: -0.5, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.ink2 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink2 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.ink3 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, color: colors.ink2 },
  hand: { fontFamily: fonts.hand, fontSize: 22, lineHeight: 24, color: colors.pen },
  handLarge: { fontFamily: fonts.hand, fontSize: 32, lineHeight: 34, color: colors.pen },
};

export function T({
  v = "body",
  style,
  children,
  numberOfLines,
  selectable,
}: {
  v?: Variant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  return (
    <Text style={[variants[v], style]} numberOfLines={numberOfLines} selectable={selectable} maxFontSizeMultiplier={1.4}>
      {children}
    </Text>
  );
}

// ---------- Button ----------

type ButtonKind = "pen" | "ink" | "ghost" | "soft" | "danger";

export function Button({
  label,
  onPress,
  kind = "ink",
  icon,
  loading,
  disabled,
  style,
  small,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
}) {
  const palette = {
    pen: { bg: colors.pen, fg: "#fff", border: colors.pen },
    ink: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    ghost: { bg: "transparent", fg: colors.ink, border: colors.ruleStrong },
    soft: { bg: colors.paper2, fg: colors.ink, border: colors.paper2 },
    danger: { bg: "transparent", fg: colors.pen, border: colors.penSoft },
  }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={() => {
        if (inactive) return;
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 },
        pressed && !inactive && { transform: [{ scale: 0.98 }], opacity: 0.92 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon && <Feather name={icon} size={small ? 16 : 18} color={palette.fg} />}
          <Text style={[styles.buttonText, small && { fontSize: 14.5 }, { color: palette.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color = colors.ink,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.paper2 }, style]}
    >
      <Feather name={icon} size={20} color={color} />
    </Pressable>
  );
}

export function LinkButton({ label, onPress, color = colors.ink }: { label: string; onPress: () => void; color?: ColorValue }) {
  return (
    <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
      {({ pressed }) => (
        <Text style={[variants.smallMedium, { color, textAlign: "center", opacity: pressed ? 0.6 : 1, textDecorationLine: "underline" }]}>{label}</Text>
      )}
    </Pressable>
  );
}

// ---------- Inputs ----------

export const Field = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label: string; error?: string | null; hint?: string }>(function Field(
  { label, error, hint, style, ...props },
  ref,
) {
  return (
    <View style={{ gap: 6 }}>
      <T v="smallMedium">{label}</T>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.ink3}
        style={[styles.input, !!error && { borderColor: colors.pen }, style]}
        accessibilityLabel={label}
        {...props}
      />
      {error ? <T v="small" style={{ color: colors.pen }}>{error}</T> : hint ? <T v="caption">{hint}</T> : null}
    </View>
  );
});

export function Choice<V extends string>({
  options,
  value,
  onChange,
  wrap,
}: {
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
  wrap?: boolean;
}) {
  return (
    <View style={[styles.choiceRow, wrap && { flexWrap: "wrap" }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.choice, !wrap && { flex: 1 }, on && styles.choiceOn]}
          >
            <Text style={[variants.smallMedium, { color: on ? colors.onInk : colors.ink, textAlign: "center" }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  refresh,
  padded = true,
  footer,
  background = colors.paper,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  refresh?: React.ReactElement<RefreshControlProps>;
  padded?: boolean;
  footer?: ReactNode;
  background?: ColorValue;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space.xl } : null;
  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh}
          contentContainerStyle={[pad, { paddingBottom: (footer ? 16 : insets.bottom + 32) }, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View> : null}
    </View>
  );
}

export function Header({ title, onBack, right, subtitle }: { title?: string; onBack?: () => void; right?: ReactNode; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={{ width: 44 }}>{onBack ? <IconButton icon="chevron-left" label={t.common.back} onPress={onBack} /> : null}</View>
      <View style={{ flex: 1, alignItems: "center" }}>
        {title ? (
          <T v="h3" numberOfLines={1}>
            {title}
          </T>
        ) : null}
        {subtitle ? <T v="caption">{subtitle}</T> : null}
      </View>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

export function Card({ children, style, onPress, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.paper2 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <T v="h2">{title}</T>
      {action && onAction ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <T v="smallMedium" style={{ color: colors.pen }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({ label, fg = colors.ink2, bg = colors.paper2, icon }: { label: string; fg?: ColorValue; bg?: ColorValue; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Feather name={icon} size={12} color={fg} /> : null}
      <Text style={[variants.caption, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Avatar({ name, color, size = 44, photo }: { name: string; color: string; size?: number; photo?: string | null }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: size * 0.42, color: "#fff" }}>{initial}</Text>
      {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** On/off switch drawn in the Labless style, the same size on every iOS version. */
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const hex = useHex();
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [value, x]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => {
        tap();
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={{
          width: 50,
          height: 30,
          borderRadius: 15,
          padding: 3,
          backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [hex.ruleStrong, hex.ink] }),
        }}
      >
        <Animated.View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: [hex.paper, hex.paper] }),
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={24} color={colors.ink} />
      </View>
      <T v="h3" style={{ textAlign: "center" }}>
        {title}
      </T>
      {body ? (
        <T v="small" style={{ textAlign: "center", maxWidth: 300 }}>
          {body}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 6, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const content = (
    <>
      {icon ? <Feather name={icon} size={19} color={danger ? colors.pen : colors.ink} /> : null}
      <Text style={[variants.bodyMedium, { flex: 1, color: danger ? colors.pen : colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <T v="small">{value}</T> : null}
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={colors.ink3} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.paper2 }]}
    >
      {content}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height, width, borderRadius: 8, backgroundColor: colors.paper2 }, style]} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
  },
  buttonSmall: { minHeight: 42, paddingHorizontal: 16 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.1 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontFamily: fonts.regular,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: colors.paper,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space.lg,
  },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 30, marginBottom: 12 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 34, paddingHorizontal: 12 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.paper2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingTop: 12,
    backgroundColor: colors.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
    gap: 10,
  },
});
