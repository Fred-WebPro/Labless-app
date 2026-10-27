import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setAiConsent } from "@/components/AiConsent";
import { confirm } from "@/components/confirm";
import { Wordmark } from "@/components/Pen";
import { useToast } from "@/components/Toast";
import { Choice, Row, Screen, T, Toggle } from "@/components/ui";
import { LOCALES, fill, useI18n, type Locale } from "@/i18n";
import { api } from "@/lib/api";
import { appVersion, track } from "@/lib/analytics";
import { useQueryClient } from "@tanstack/react-query";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/appearance";
import { keys, useProfile, useUpdateProfile } from "@/lib/data";
import { openLegal } from "@/lib/legal";
import { disablePush, registerPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function Profile() {
  const { t, locale, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [deleting, setDeleting] = useState(false);
  const theme = useThemePref();
  const qc = useQueryClient();

  const toggleAi = async (on: boolean) => {
    if (!profile) return;
    try {
      await setAiConsent(profile.id, on);
      track(on ? "ai_consent_given" : "ai_consent_withdrawn");
      await qc.invalidateQueries({ queryKey: keys.profile });
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  const changeLocale = (l: Locale) => {
    setLocale(l);
    update.mutate({ locale: l });
    track("language_changed", { locale: l });
  };

  const toggleNotifications = async (on: boolean) => {
    update.mutate({ notifications_enabled: on });
    if (on) {
      const state = await registerPush(true);
      if (state === "denied") toast(t.profile.notificationsDenied, "error");
    } else {
      await disablePush();
    }
  };

  const signOut = async () => {
    track("sign_out");
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    const ok = await confirm({
      title: t.profile.deleteTitle,
      message: t.profile.deleteBody,
      confirm: t.common.delete,
      cancel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      track("account_deleted");
      await api("/api/account", { method: "DELETE" });
      await supabase.auth.signOut();
      toast(t.profile.deleted);
    } catch {
      toast(t.common.genericError, "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen safeTop padded={false}>
      <View style={{ paddingTop: insets.top + 18, paddingHorizontal: 20, gap: 4 }}>
        <T v="title">{t.profile.title}</T>
        <T v="body" numberOfLines={1}>
          {profile?.email}
        </T>
      </View>

      <T v="caption" style={styles.group}>
        {t.profile.language.toUpperCase()}
      </T>
      <View style={{ paddingHorizontal: 20 }}>
        <Choice value={locale} onChange={changeLocale} options={LOCALES.map((l) => ({ value: l.code, label: l.name }))} />
      </View>

      <T v="caption" style={styles.group}>
        {t.profile.appearance.toUpperCase()}
      </T>
      <View style={{ paddingHorizontal: 20 }}>
        <Choice<ThemePref>
          value={theme}
          onChange={(v) => {
            setThemePref(v);
            track("theme_changed", { theme: v });
          }}
          options={[
            { value: "system", label: t.profile.themeSystem },
            { value: "light", label: t.profile.themeLight },
            { value: "dark", label: t.profile.themeDark },
          ]}
        />
      </View>

      <T v="caption" style={styles.group}>
        {t.profile.notifications.toUpperCase()}
      </T>
      <View style={styles.box}>
        <Row
          icon="bell"
          label={t.profile.notifications}
          right={
            <Toggle value={profile?.notifications_enabled ?? true} onChange={toggleNotifications} label={t.profile.notifications} />
          }
        />
      </View>
      <T v="caption" style={{ paddingHorizontal: 20, marginTop: 6 }}>
        {t.profile.notificationsBody}
      </T>

      <T v="caption" style={styles.group}>
        {t.profile.aiAnalysis.toUpperCase()}
      </T>
      <View style={styles.box}>
        <Row icon="cpu" label={t.profile.aiAnalysis} right={<Toggle value={!!profile?.ai_consent_at} onChange={toggleAi} label={t.profile.aiAnalysis} />} />
      </View>
      <T v="caption" style={{ paddingHorizontal: 20, marginTop: 6 }}>
        {t.profile.aiAnalysisBody}
      </T>

      <T v="caption" style={styles.group}>
        {t.profile.account.toUpperCase()}
      </T>
      <View style={styles.box}>
        <Row icon="users" label={t.family.title} onPress={() => router.push("/family")} />
        <Row icon="info" label={t.profile.legal} onPress={() => router.push("/legal")} />
        <Row icon="shield" label={t.profile.privacyPolicy} onPress={() => openLegal("privacy", locale)} />
        <Row icon="file-text" label={t.profile.terms} onPress={() => openLegal("terms", locale)} />
        <Row icon="log-out" label={t.profile.signOut} onPress={signOut} />
        <Row icon="trash-2" label={deleting ? t.common.loading : t.profile.deleteAccount} onPress={deleting ? undefined : deleteAccount} danger />
      </View>

      <View style={{ alignItems: "center", gap: 8, marginTop: 36 }}>
        <Wordmark size={22} />
        <T v="caption">{fill(t.profile.version, { v: appVersion })}</T>
        <T v="caption" style={{ textAlign: "center", paddingHorizontal: 40 }}>
          {t.common.notDiagnosis}
        </T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { paddingHorizontal: 20, marginTop: 28, marginBottom: 8, letterSpacing: 0.6 },
  box: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
});
