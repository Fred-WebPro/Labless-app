import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Button, Card, Choice, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { keys } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { colors, fonts, radius } from "@/lib/theme";
import type { Member } from "@/lib/types";

type Units = "metric" | "us";
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

const num = (s: string) => {
  const v = Number(s.replace(",", ".").trim());
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export const hasBody = (m: Pick<Member, "height_cm" | "weight_kg"> | undefined | null) => !!m?.height_cm && !!m?.weight_kg;

/** Height, weight and optional waist, stored in metric. Shows feet and pounds for English by default. */
export function BodyForm({ member, saveLabel, onSaved }: { member: Member; saveLabel: string; onSaved?: () => void | Promise<void> }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [units, setUnits] = useState<Units>(locale === "en" ? "us" : "metric");
  const h = member.height_cm ? Number(member.height_cm) : null;
  const w = member.weight_kg ? Number(member.weight_kg) : null;
  const wa = member.waist_cm ? Number(member.waist_cm) : null;
  const [cm, setCm] = useState(h ? String(r1(h)) : "");
  const [ft, setFt] = useState(h ? String(Math.floor(h / CM_PER_IN / 12)) : "");
  const [inch, setInch] = useState(h ? String(Math.round((h / CM_PER_IN) % 12)) : "");
  const [kg, setKg] = useState(w ? String(r1(w)) : "");
  const [lb, setLb] = useState(w ? String(Math.round(w / KG_PER_LB)) : "");
  const [waistCm, setWaistCm] = useState(wa ? String(r1(wa)) : "");
  const [waistIn, setWaistIn] = useState(wa ? String(r1(wa / CM_PER_IN)) : "");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const height = units === "metric" ? num(cm) : (num(ft) ?? 0) * 12 * CM_PER_IN + (num(inch) ?? 0) * CM_PER_IN || null;
    const weight = units === "metric" ? num(kg) : num(lb) ? num(lb)! * KG_PER_LB : null;
    const waist = units === "metric" ? num(waistCm) : num(waistIn) ? num(waistIn)! * CM_PER_IN : null;
    const ok = height && weight && height >= 40 && height <= 260 && weight >= 2 && weight <= 400 && (!waist || (waist >= 30 && waist <= 250));
    if (!ok) {
      setError(true);
      return;
    }
    setError(false);
    setBusy(true);
    try {
      const { error: e } = await supabase
        .from("members")
        .update({ height_cm: r1(height), weight_kg: r1(weight), waist_cm: waist ? r1(waist) : null, body_measured_at: new Date().toISOString() })
        .eq("id", member.id);
      if (e) throw e;
      await qc.invalidateQueries({ queryKey: keys.members });
      await onSaved?.();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Choice
        options={[
          { value: "us", label: t.body.us },
          { value: "metric", label: t.body.metric },
        ]}
        value={units}
        onChange={setUnits}
      />
      {units === "metric" ? (
        <View style={styles.row}>
          <Num label={t.body.height} unit={t.body.cm} value={cm} onChange={setCm} />
          <Num label={t.body.weight} unit={t.body.kg} value={kg} onChange={setKg} />
        </View>
      ) : (
        <View style={styles.row}>
          <Num label={t.body.height} unit={t.body.ft} value={ft} onChange={setFt} />
          <Num label=" " unit={t.body.in} value={inch} onChange={setInch} />
          <Num label={t.body.weight} unit={t.body.lb} value={lb} onChange={setLb} />
        </View>
      )}
      <View style={styles.row}>
        {units === "metric" ? (
          <Num label={t.body.waist} unit={t.body.cm} value={waistCm} onChange={setWaistCm} />
        ) : (
          <Num label={t.body.waist} unit={t.body.in} value={waistIn} onChange={setWaistIn} />
        )}
        <View style={{ flex: 1 }} />
      </View>
      <T v="caption">{t.body.promptWaist}</T>
      {error ? <T v="small" style={{ color: colors.pen }}>{t.body.invalid}</T> : null}
      <Button label={saveLabel} kind="ink" onPress={save} loading={busy} small />
    </View>
  );
}

function Num({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <T v="smallMedium">{label}</T>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={colors.ink3}
          accessibilityLabel={`${label} ${unit}`}
          maxLength={5}
        />
        <T v="small" style={{ color: colors.ink3 }}>{unit}</T>
      </View>
    </View>
  );
}

/** Asks for height and weight on a reading when they're missing, then updates the reading. */
export function BodyPrompt({ member, onSaved }: { member: Member; onSaved: () => void | Promise<void> }) {
  const { t } = useI18n();
  return (
    <Card style={{ gap: 10, backgroundColor: colors.penTint, borderColor: colors.penSoft }}>
      <T v="h3">{t.body.title}</T>
      <T v="small">{t.body.prompt}</T>
      <BodyForm member={member} saveLabel={t.body.save} onSaved={onSaved} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 18, color: colors.ink, paddingVertical: 10 },
});
