import { router } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { Button, Field, Header, LinkButton, Screen, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    if (!EMAIL.test(email.trim())) return setError(t.auth.errors.invalidEmail);
    if (!password) return setError(t.auth.errors.wrongCredentials);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (err) {
      setError(/fetch|network/i.test(err.message) ? t.common.networkError : t.auth.errors.wrongCredentials);
      return;
    }
    track("sign_in");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
      <Screen
        footer={
          <>
            <Button label={t.auth.signIn} kind="ink" onPress={submit} loading={busy} testID="signin-submit" />
            <LinkButton label={t.auth.noAccount} onPress={() => router.replace("/sign-up")} />
          </>
        }
      >
        <View style={{ gap: 8, marginTop: 8, marginBottom: 26 }}>
          <T v="title">{t.auth.signInTitle}</T>
        </View>
        <View style={{ gap: 18 }}>
          <Field
            label={t.auth.email}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
          />
          <Field
            ref={passRef}
            label={t.auth.password}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {error ? (
            <T v="small" style={{ color: colors.pen }}>
              {error}
            </T>
          ) : null}
          <View style={{ alignItems: "flex-start" }}>
            <LinkButton label={t.auth.forgot} onPress={() => router.push({ pathname: "/forgot", params: { email: email.trim() } })} />
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
