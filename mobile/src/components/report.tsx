import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Pill, T, tap } from "@/components/ui";
import { fill, useI18n, formatNumber } from "@/i18n";
import { colors, fonts, radius, severity } from "@/lib/theme";
import type { Delta } from "@/lib/compare";
import type { Advice, AdviceArea, Analysis, CheckinQuestion, Finding, HiddenTest, IndexResult, NextStep, Result } from "@/lib/types";

export function StatusBadge({ status }: { status: NonNullable<Analysis["status"]> }) {
  const { t } = useI18n();
  const s = severity[status === "good" ? "good" : status === "watch" ? "watch" : status === "urgent" ? "urgent" : "attention"];
  const icon = status === "good" ? "check-circle" : status === "urgent" ? "alert-triangle" : status === "watch" ? "eye" : "alert-circle";
  return <Pill label={t.home.status[status]} fg={s.fg} bg={s.bg} icon={icon} />;
}

export function FindingCard({ finding }: { finding: Finding }) {
  const s = severity[finding.severity] ?? severity.info;
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={() => {
        tap();
        setOpen((v) => !v);
      }}
      style={({ pressed }) => [styles.finding, pressed && { backgroundColor: colors.paper2 }]}
    >
      <View style={[styles.stripe, { backgroundColor: finding.severity === "urgent" ? colors.pen : s.fg }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <T v="h3" style={{ flex: 1 }}>
            {finding.title}
          </T>
          <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.ink3} />
        </View>
        <T v="small" numberOfLines={open ? undefined : 2}>
          {finding.detail}
        </T>
        {open && finding.markers?.length ? (
          <View style={styles.chips}>
            {finding.markers.map((m) => (
              <Text key={m} style={styles.chip}>
                {m}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const confidenceLevel = { strong: 4, moderate: 3, screening: 2, test: 1 } as const;

export function Strip({ confidence }: { confidence: HiddenTest["confidence"] }) {
  const level = confidenceLevel[confidence] ?? 1;
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i <= level && { backgroundColor: confidence === "test" ? colors.pen : colors.ink, borderColor: confidence === "test" ? colors.pen : colors.ink },
          ]}
        />
      ))}
    </View>
  );
}

export function HiddenTestCard({ test }: { test: HiddenTest }) {
  const { t } = useI18n();
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Strip confidence={test.confidence} />
        <T v="caption">{t.report.confidence[test.confidence]}</T>
      </View>
      <View style={{ gap: 4 }}>
        <T v="h3">{test.name}</T>
        <T v="hand" style={{ fontSize: 24 }}>
          {test.estimate}
        </T>
      </View>
      <T v="small">{test.explanation}</T>
      {test.inputs?.length ? (
        <View style={{ gap: 6 }}>
          <T v="caption">{t.report.builtFrom}</T>
          <View style={styles.chips}>
            {test.inputs.map((m) => (
              <Text key={m} style={styles.chip}>
                {m}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {test.spares ? (
        <View style={styles.spares}>
          <Feather name="scissors" size={14} color={colors.ink2} />
          <T v="small" style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.medium, color: colors.ink }}>{t.report.spares}: </Text>
            {test.spares}
          </T>
        </View>
      ) : null}
    </Card>
  );
}

export function IndexRow({ index }: { index: IndexResult }) {
  const { t, locale } = useI18n();
  const loc = (t.indices as Record<string, { name: string; ref: string } | undefined>)[index.key];
  const name = loc?.name ?? index.name;
  const reference = loc ? fill(loc.ref, { age: index.reference.match(/\d+/)?.[0] ?? "" }) : index.reference;
  const bad = index.status === "high" || index.status === "low";
  const color = bad ? colors.pen : index.status === "borderline" ? colors.warn : colors.good;
  return (
    <View style={styles.indexRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="smallMedium">{name}</T>
        <T v="caption" numberOfLines={2}>
          {reference}
        </T>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={styles.indexValue}>
          {formatNumber(index.value, locale)}
          {index.unit ? <Text style={styles.indexUnit}> {index.unit}</Text> : null}
        </Text>
        <Text style={[styles.indexStatus, { color }]}>{t.report.indexStatus[index.status]}</Text>
      </View>
    </View>
  );
}

export function ResultRow({ result, onPress, trend }: { result: Result; onPress?: () => void; trend?: React.ReactNode }) {
  const { t, locale } = useI18n();
  const flagged = result.flag && result.flag !== "normal";
  const value = result.value != null ? formatNumber(Number(result.value), locale) : result.value_text ?? "—";
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.resultRow, pressed && onPress && { backgroundColor: colors.paper2 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="smallMedium" numberOfLines={2}>
          {result.name}
        </T>
        {result.ref_text ? <T v="caption">{result.ref_text}</T> : null}
      </View>
      {trend}
      <View style={{ alignItems: "flex-end", minWidth: 84 }}>
        <Text style={[styles.resultValue, flagged && { color: colors.pen }]}>
          {value}
          {result.unit ? <Text style={styles.indexUnit}> {result.unit}</Text> : null}
        </Text>
        {flagged ? <Text style={[styles.indexStatus, { color: colors.pen }]}>{t.report.flags[result.flag!]}</Text> : null}
      </View>
      {onPress ? <Feather name="chevron-right" size={16} color={colors.ink3} /> : null}
    </Pressable>
  );
}

export function StepCard({ step, index }: { step: NextStep; index: number }) {
  const { t } = useI18n();
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{index + 1}</Text>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Pill label={t.report.kind[step.kind]} />
          <Pill
            label={t.report.priority[step.priority]}
            fg={step.priority === "high" ? colors.pen : colors.ink2}
            bg={step.priority === "high" ? colors.penSoft : colors.paper2}
          />
        </View>
        <T v="h3">{step.title}</T>
        <T v="small">{step.detail}</T>
      </View>
    </View>
  );
}

export function Checkin({
  questions,
  answers,
  onSubmit,
  busy,
}: {
  questions: CheckinQuestion[];
  answers: Record<string, string>;
  onSubmit: (answers: Record<string, string>) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const open = questions.filter((q) => !answers[q.id]);
  if (!open.length) return null;
  const picked = Object.keys(draft).length;

  if (!expanded) {
    return (
      <View style={styles.checkin}>
        <T v="handLarge" style={{ fontSize: 30 }}>
          {t.report.checkinTitle}
        </T>
        <T v="small">{t.report.checkinBody}</T>
        <Button label={fill(t.report.checkinStart, { n: open.length })} kind="pen" icon="message-circle" onPress={() => setExpanded(true)} style={{ marginTop: 10 }} small />
      </View>
    );
  }

  return (
    <View style={styles.checkin}>
      <T v="handLarge" style={{ fontSize: 30 }}>
        {t.report.checkinTitle}
      </T>
      <T v="small">{t.report.checkinBody}</T>
      {open.map((q) => {
        const options = q.options?.length ? q.options : [t.common.yes, t.common.no];
        return (
          <View key={q.id} style={{ gap: 8, marginTop: 6 }}>
            <T v="bodyMedium">{q.question}</T>
            {q.why ? <T v="caption">{q.why}</T> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {options.map((o) => {
                const on = draft[q.id] === o;
                return (
                  <Pressable
                    key={o}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      tap();
                      setDraft((d) => {
                        const next = { ...d };
                        if (on) delete next[q.id];
                        else next[q.id] = o;
                        return next;
                      });
                    }}
                    style={[styles.option, on && styles.optionOn]}
                  >
                    <Text style={[styles.optionText, on && { color: colors.onInk }]}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <Button
        label={busy ? t.report.checkinRefining : t.report.checkinSubmit}
        kind="pen"
        loading={busy}
        disabled={!picked}
        onPress={() => onSubmit(draft)}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

const areaIcon: Record<AdviceArea, React.ComponentProps<typeof Feather>["name"]> = {
  nutrition: "coffee",
  activity: "activity",
  sleep: "moon",
  stress: "wind",
  habits: "repeat",
  supplements: "plus-circle",
};

export function AdviceCard({ advice }: { advice: Advice }) {
  const { t } = useI18n();
  return (
    <View style={styles.advice}>
      <View style={styles.adviceIcon}>
        <Feather name={areaIcon[advice.area] ?? "check"} size={17} color={colors.pen} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="caption">{t.report.area[advice.area] ?? advice.area}</T>
        <T v="bodyMedium">{advice.title}</T>
        <T v="small">{advice.detail}</T>
      </View>
    </View>
  );
}

export const directionColor = (d: Delta["direction"]) => (d === "worse" ? colors.pen : d === "better" ? colors.good : colors.ink3);

export function DeltaRow({ delta, onPress }: { delta: Delta; onPress?: () => void }) {
  const { t, locale } = useI18n();
  const color = directionColor(delta.direction);
  const arrow = delta.pct > 0 ? "↑" : delta.pct < 0 ? "↓" : "→";
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.resultRow, pressed && onPress && { backgroundColor: colors.paper2 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="smallMedium" numberOfLines={2}>
          {delta.name}
        </T>
        <Text style={[styles.indexStatus, { color }]}>
          {t.report.dir[delta.direction]} · {arrow} {Math.abs(Math.round(delta.pct))}%
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", minWidth: 110 }}>
        <Text style={styles.resultValue}>
          <Text style={styles.prevValue}>{formatNumber(delta.prev, locale)} → </Text>
          <Text style={delta.outOfRange ? { color: colors.pen } : undefined}>{formatNumber(delta.now, locale)}</Text>
          {delta.unit ? <Text style={styles.indexUnit}> {delta.unit}</Text> : null}
        </Text>
      </View>
      {onPress ? <Feather name="chevron-right" size={16} color={colors.ink3} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  advice: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  adviceIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.penSoft, alignItems: "center", justifyContent: "center" },
  prevValue: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink3 },
  finding: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  stripe: { width: 4, borderRadius: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
    backgroundColor: colors.paper2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.ruleStrong },
  spares: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  indexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  indexValue: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, letterSpacing: -0.3 },
  indexUnit: { fontFamily: fonts.regular, fontSize: 12, color: colors.ink3 },
  indexStatus: { fontFamily: fonts.medium, fontSize: 12.5 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  resultValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, textAlign: "right" },
  step: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  stepNum: { fontFamily: fonts.hand, fontSize: 34, lineHeight: 36, color: colors.pen, width: 24 },
  checkin: {
    gap: 6,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.penTint,
    borderWidth: 1,
    borderColor: colors.penSoft,
  },
  option: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  optionOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionText: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink },
});
