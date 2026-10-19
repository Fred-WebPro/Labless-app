import Svg, { Circle, Path } from "react-native-svg";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts } from "@/lib/theme";

/** Hand-drawn red pen underline. */
export function PenUnderline({ width = 160, style }: { width?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} pointerEvents="none">
      <Svg width={width} height={12} viewBox="0 0 300 12" preserveAspectRatio="none">
        <Path d="M3 8 C 60 3, 120 4, 170 6 S 250 10, 297 4" stroke={colors.pen} strokeWidth={4} strokeLinecap="round" fill="none" />
      </Svg>
    </View>
  );
}

/** The Labless wordmark: "Lab" struck through with the red pen. */
export function Wordmark({ size = 26, light }: { size?: number; light?: boolean }) {
  const ink = light ? "#fff" : colors.ink;
  const text = { fontFamily: fonts.bold, fontSize: size, letterSpacing: -size * 0.045, lineHeight: size * 1.15 };
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessible accessibilityLabel="Labless">
      <View>
        <Text style={[text, { color: colors.ink3 }]}>Lab</Text>
        <Svg
          width={size * 1.75}
          height={size * 0.4}
          viewBox="0 0 300 12"
          preserveAspectRatio="none"
          style={{ position: "absolute", left: -size * 0.08, top: size * 0.42, transform: [{ rotate: "-4deg" }] }}
        >
          <Path d="M2 9 C 80 5, 160 3, 298 2" stroke={colors.pen} strokeWidth={5} strokeLinecap="round" fill="none" />
        </Svg>
      </View>
      <Text style={[text, { color: ink }]}>less</Text>
    </View>
  );
}

/** Loupe illustration used on onboarding. */
export function Loupe({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle cx="52" cy="52" r="34" stroke={colors.ink} strokeWidth="7" fill="#fff" />
      <Path d="M77 77l26 26" stroke={colors.ink} strokeWidth="12" strokeLinecap="round" />
      <Path d="M34 50c8-2 18-3 34-1" stroke={colors.pen} strokeWidth="4" strokeLinecap="round" fill="none" />
      <Path d="M36 60c6-1 12-1 20 0" stroke={colors.ruleStrong} strokeWidth="4" strokeLinecap="round" fill="none" />
      <Path d="M36 40c10-1 18-1 26 0" stroke={colors.ruleStrong} strokeWidth="4" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
