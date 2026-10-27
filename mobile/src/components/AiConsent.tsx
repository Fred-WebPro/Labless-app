import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, LinkButton, T, type IconName } from "@/components/ui";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { keys } from "@/lib/data";
import { openLegal } from "@/lib/legal";
import { supabase } from "@/lib/supabase";
import { colors, radius } from "@/lib/theme";

/** Saves or withdraws the consent to AI processing. The API refuses to analyze without it. */
export async function setAiConsent(userId: string, on: boolean) {
  const { error } = await supabase
    .from("profiles")
    .update({ ai_consent_at: on ? new Date().toISOString() : null })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Shown before the first upload: what happens to a report, who processes it and the person's choice.
 * Nothing is sent until they agree.
 */
export function AiConsent({ userId, onDecline }: { userId: string; onDecline: () => void }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const agree = async () => {
    setBusy(true);
    setError(false);
    try {
      await setAiConsent(userId, true);
      track("ai_consent_given");
      await qc.invalidateQueries({ queryKey: keys.profile });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const points: { icon: IconName; text: string }[] = [
    { icon: "send", text: t.consent.what },
    { icon: "lock", text: t.consent.provider },
    { icon: "trash-2", text: t.consent.control },
    { icon: "alert-circle", text: t.consent.notMedical },
  ];

  return (
    <View style={{ gap: 18, marginTop: 8 }}>
      <View style={{ gap: 8 }}>
        <T v="title">{t.consent.title}</T>
        <T v="body">{t.consent.intro}</T>
      </View>
      <View style={styles.box}>
        {points.map((p) => (
          <View key={p.icon} style={styles.point}>
            <Feather name={p.icon} size={18} color={colors.pen} style={{ marginTop: 2 }} />
            <T v="small" style={{ flex: 1, color: colors.ink }}>
              {p.text}
            </T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 20 }}>
        <LinkButton label={t.legalLinks.privacy} onPress={() => openLegal("privacy", locale)} />
        <LinkButton label={t.legalLinks.terms} onPress={() => openLegal("terms", locale)} />
      </View>
      {error ? <T v="small" style={{ color: colors.pen, textAlign: "center" }}>{t.common.genericError}</T> : null}
      <View style={{ gap: 10 }}>
        <Button label={t.consent.agree} kind="ink" onPress={agree} loading={busy} testID="ai-consent-agree" />
        <Button label={t.consent.decline} kind="ghost" onPress={onDecline} />
      </View>
      <T v="caption" style={{ textAlign: "center" }}>
        {t.consent.later}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.rule, backgroundColor: colors.card },
  point: { flexDirection: "row", gap: 12 },
});
