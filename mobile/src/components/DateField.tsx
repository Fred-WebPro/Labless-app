import { useEffect, useRef, useState, type ComponentRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { T } from "@/components/ui";
import { colors, fonts, radius } from "@/lib/theme";

/** Returns an ISO date (YYYY-MM-DD) when the parts form a real past date, otherwise null. */
export function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || year.length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > Date.now() || y < 1900) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type Props = {
  label: string;
  value: string | null;
  onChange: (iso: string | null, complete: boolean) => void;
  placeholders: { day: string; month: string; year: string };
  error?: string | null;
};

/** Three numeric boxes that work the same on every platform, including the web build. */
export function DateField({ label, value, onChange, placeholders, error }: Props) {
  const [y0, m0, d0] = (value ?? "").split("-");
  const [day, setDay] = useState(d0 ?? "");
  const [month, setMonth] = useState(m0 ?? "");
  const [year, setYear] = useState(y0 ?? "");
  const monthRef = useRef<ComponentRef<typeof TextInput>>(null);
  const yearRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const complete = day.length > 0 && month.length > 0 && year.length === 4;
    onChange(toIsoDate(day, month, year), complete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, month, year]);

  const digits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);

  return (
    <View style={{ gap: 6 }}>
      <T v="smallMedium">{label}</T>
      <View style={styles.row}>
        <TextInput
          style={[styles.box, { flex: 1 }, !!error && styles.err]}
          value={day}
          placeholder={placeholders.day}
          placeholderTextColor={colors.ink3}
          keyboardType="number-pad"
          accessibilityLabel={`${label} ${placeholders.day}`}
          onChangeText={(v) => {
            const all = digits(v, 8);
            setDay(all.slice(0, 2));
            if (all.length > 2) {
              setMonth(all.slice(2, 4));
              if (all.length > 4) setYear(all.slice(4, 8));
              (all.length > 4 ? yearRef : monthRef).current?.focus();
            } else if (all.length === 2) monthRef.current?.focus();
          }}
        />
        <TextInput
          ref={monthRef}
          style={[styles.box, { flex: 1 }, !!error && styles.err]}
          value={month}
          placeholder={placeholders.month}
          placeholderTextColor={colors.ink3}
          keyboardType="number-pad"
          accessibilityLabel={`${label} ${placeholders.month}`}
          onChangeText={(v) => {
            const all = digits(v, 6);
            setMonth(all.slice(0, 2));
            if (all.length > 2) setYear(all.slice(2, 6));
            if (all.length >= 2) yearRef.current?.focus();
          }}
        />
        <TextInput
          ref={yearRef}
          style={[styles.box, { flex: 1.6 }, !!error && styles.err]}
          value={year}
          placeholder={placeholders.year}
          placeholderTextColor={colors.ink3}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel={`${label} ${placeholders.year}`}
          onChangeText={(v) => setYear(digits(v, 4))}
        />
      </View>
      {error ? (
        <T v="small" style={{ color: colors.pen }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  box: {
    minWidth: 0,
    width: 0,
    flexBasis: 0,
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    borderRadius: radius.md,
    textAlign: "center",
    fontFamily: fonts.medium,
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  err: { borderColor: colors.pen },
});
