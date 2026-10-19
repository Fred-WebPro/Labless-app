import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Header, Screen, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { API_URL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Forgot() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!EMAIL.test(email.trim())) return setError(t.auth.errors.invalidEmail);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${API_URL}/auth/reset` });
    setBusy(false);
    if (err && /fetch|network/i.test(err.message)) return setError(t.common.networkError);
    // Same message whether or not the email exists, so accounts can't be probed.
    setSent(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} />
      <Screen
        footer={
          sent ? (
            <Button label={t.auth.signIn} kind="ink" onPress={() => router.replace("/sign-in")} />
          ) : (
            <Button label={t.auth.sendLink} kind="ink" onPress={submit} loading={busy} />
          )
        }
      >
        <View style={{ gap: 8, marginTop: 8, marginBottom: 26 }}>
          <T v="title">{t.auth.forgotTitle}</T>
          <T v="body">{sent ? t.auth.linkSent : t.auth.forgotBody}</T>
        </View>
        {!sent ? (
          <Field
            label={t.auth.email}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={error}
            onSubmitEditing={submit}
          />
        ) : (
          <T v="handLarge">✓</T>
        )}
      </Screen>
    </View>
  );
}
