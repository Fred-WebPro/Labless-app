import { router } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { Button, Field, Header, LinkButton, Screen, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { ApiError, api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignUp() {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passRef = useRef<ComponentRef<typeof TextInput>>(null);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t.auth.errors.nameRequired;
    if (!EMAIL.test(email.trim())) next.email = t.auth.errors.invalidEmail;
    if (password.length < 8) next.password = t.auth.errors.weakPassword;
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api("/api/signup", { auth: false, body: { email: email.trim(), password, name: name.trim(), locale } });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      track("sign_up");
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") setErrors({ email: t.auth.errors.emailTaken });
      else if (err instanceof ApiError && err.code === "network") setErrors({ form: t.common.networkError });
      else if (err instanceof ApiError && err.code === "invalid_email") setErrors({ email: t.auth.errors.invalidEmail });
      else setErrors({ form: t.common.genericError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))} />
      <Screen
        footer={
          <>
            <Button label={t.auth.signUp} kind="pen" onPress={submit} loading={busy} testID="signup-submit" />
            <LinkButton label={t.auth.haveAccount} onPress={() => router.replace("/sign-in")} />
          </>
        }
      >
        <View style={{ gap: 8, marginTop: 8, marginBottom: 26 }}>
          <T v="title">{t.auth.signUpTitle}</T>
          <T v="body">{t.auth.signUpBody}</T>
        </View>
        <View style={{ gap: 18 }}>
          <Field
            label={t.auth.name}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
            }}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            error={errors.name}
            maxLength={60}
          />
          <Field
            ref={emailRef}
            label={t.auth.email}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            error={errors.email}
          />
          <Field
            ref={passRef}
            label={t.auth.password}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
            }}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
            error={errors.password}
            hint={t.auth.passwordHint}
          />
          {errors.form ? (
            <T v="small" style={{ color: colors.pen }}>
              {errors.form}
            </T>
          ) : null}
          <T v="caption">{t.auth.terms}</T>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
