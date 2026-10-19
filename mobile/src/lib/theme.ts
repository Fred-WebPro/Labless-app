/** Labless visual system: clinical white paper, black ink, one red pen. */
export const colors = {
  paper: "#FFFFFF",
  paper2: "#F6F6F3",
  paper3: "#EEEEEA",
  rule: "#E6E6E1",
  ruleStrong: "#CFCFC8",
  ink: "#121212",
  ink2: "#4F4F49",
  ink3: "#8A8A82",
  pen: "#D2261C",
  penSoft: "#FBE9E6",
  penDeep: "#A51D15",
  good: "#1F7A4D",
  goodSoft: "#E6F3EC",
  warn: "#9A6400",
  warnSoft: "#FBF1DC",
  overlay: "rgba(18,18,18,0.45)",
};

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
export const memberColors = ["#D2261C", "#121212", "#2F5BD3", "#1F7A4D", "#9A6400", "#7A3FB8", "#C2185B", "#00838F"];

export const severity = {
  good: { fg: colors.good, bg: colors.goodSoft },
  info: { fg: colors.ink2, bg: colors.paper2 },
  watch: { fg: colors.warn, bg: colors.warnSoft },
  attention: { fg: colors.pen, bg: colors.penSoft },
  urgent: { fg: "#FFFFFF", bg: colors.pen },
} as const;
