import { DynamicColorIOS, Platform, useColorScheme, type ColorValue } from "react-native";

/** Labless visual system: clinical white paper, black ink, one red pen. At night: dark paper, light ink, the same pen. */
const light = {
  paper: "#FFFFFF",
  /** Raised surfaces: cards, inputs, sheets. In light mode the same white as the page; in dark mode one step lighter. */
  card: "#FFFFFF",
  paper2: "#F6F6F3",
  paper3: "#EEEEEA",
  rule: "#E6E6E1",
  ruleStrong: "#CFCFC8",
  ink: "#121212",
  ink2: "#4F4F49",
  ink3: "#8A8A82",
  /** Text and icons on an ink-filled surface (selected chips, ink buttons). */
  onInk: "#FFFFFF",
  onInkMuted: "rgba(255,255,255,0.65)",
  pen: "#D2261C",
  penSoft: "#FBE9E6",
  penTint: "#FFF8F6",
  penDeep: "#A51D15",
  good: "#1F7A4D",
  goodSoft: "#E6F3EC",
  warn: "#9A6400",
  warnSoft: "#FBF1DC",
  overlay: "rgba(18,18,18,0.45)",
};

const dark: typeof light = {
  // Neutral near-black like iOS: the page is darkest, every raised layer is lighter, never the reverse.
  paper: "#0B0B0C",
  card: "#1A1A1C",
  paper2: "#242427",
  paper3: "#303034",
  rule: "#323236",
  ruleStrong: "#4A4A50",
  ink: "#F5F5F2",
  ink2: "#D2D2CC",
  ink3: "#A0A09A",
  onInk: "#0B0B0C",
  onInkMuted: "rgba(11,11,12,0.6)",
  pen: "#FF5A4E",
  penSoft: "#45201C",
  penTint: "#241311",
  penDeep: "#FF8D84",
  good: "#5FD094",
  goodSoft: "#163524",
  warn: "#F4B95A",
  warnSoft: "#3D2E12",
  overlay: "rgba(0,0,0,0.7)",
};

export type Palette = typeof light;
type Key = keyof Palette;

/**
 * Colors for styles. On iOS each one follows the system light/dark setting by itself,
 * so StyleSheet.create can stay static. Elsewhere it is the light palette.
 */
export const colors = Object.fromEntries(
  (Object.keys(light) as Key[]).map((k) => [k, Platform.OS === "ios" ? DynamicColorIOS({ light: light[k], dark: dark[k] }) : light[k]]),
) as Record<Key, ColorValue>;

/** Plain hex values for the current scheme, for SVG and Animated, which can't take dynamic colors. */
export function useHex(): Palette {
  return useColorScheme() === "dark" && Platform.OS === "ios" ? dark : light;
}

export const fonts = {
  regular: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
  hand: "Caveat_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** Colors people can pick for family members. */
export const memberColors = ["#D2261C", "#3A3A36", "#2F5BD3", "#1F7A4D", "#9A6400", "#7A3FB8", "#C2185B", "#00838F"];

export const severity = {
  good: { fg: colors.good, bg: colors.goodSoft },
  info: { fg: colors.ink2, bg: colors.paper2 },
  watch: { fg: colors.warn, bg: colors.warnSoft },
  attention: { fg: colors.pen, bg: colors.penSoft },
  urgent: { fg: "#FFFFFF" as ColorValue, bg: colors.pen },
} as const;
