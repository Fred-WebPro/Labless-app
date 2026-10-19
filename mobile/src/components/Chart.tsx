import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { colors, fonts } from "@/lib/theme";

type Point = { x: string; y: number };

/** Small trend line, scaled to its own min and max. */
export function Sparkline({ points, width = 96, height = 32, color = colors.ink }: { points: number[]; width?: number; height?: number; color?: string }) {
  if (points.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={(points.length - 1) * step} cy={y(last)} r={3.5} fill={colors.pen} />
    </Svg>
  );
}

/** Full trend chart with the reference band, axis labels and every value marked. */
export function TrendChart({ data, low, high, format }: { data: Point[]; low?: number | null; high?: number | null; format: (v: number) => string }) {
  const [width, setWidth] = useState(0);
  const height = 200;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const values = data.map((d) => d.y);
  const bandVals = [low, high].filter((v): v is number => v != null && Number.isFinite(v));
  let min = Math.min(...values, ...bandVals);
  let max = Math.max(...values, ...bandVals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;

  const innerW = Math.max(1, width - padL - padR);
  const innerH = height - padT - padB;
  const x = (i: number) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {low != null && high != null ? (
            <Rect x={padL} y={y(high)} width={innerW} height={Math.max(1, y(low) - y(high))} fill={colors.goodSoft} />
          ) : null}
          {ticks.map((t) => (
            <Line key={t} x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={colors.rule} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`l${t}`} x={padL - 8} y={y(t) + 4} fontSize={11} fill={colors.ink3} textAnchor="end" fontFamily={fonts.regular}>
              {format(t)}
            </SvgText>
          ))}
          <Path d={d} stroke={colors.ink} strokeWidth={2.2} fill="none" strokeLinejoin="round" />
          {data.map((p, i) => (
            <Circle key={`${p.x}-${i}`} cx={x(i)} cy={y(p.y)} r={i === data.length - 1 ? 5 : 3.5} fill={i === data.length - 1 ? colors.pen : colors.ink} />
          ))}
          {data.map((p, i) =>
            data.length <= 6 || i === 0 || i === data.length - 1 ? (
              <SvgText key={`x${i}`} x={x(i)} y={height - 8} fontSize={11} fill={colors.ink3} textAnchor="middle" fontFamily={fonts.regular}>
                {p.x}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}
