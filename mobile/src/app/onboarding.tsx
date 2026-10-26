import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { DateField } from "@/components/DateField";
import { Loupe } from "@/components/Pen";
import { useToast } from "@/components/Toast";
import { Button, Choice, Field, Screen, T } from "@/components/ui";
import { useI18n } from "@/i18n";
import { registerPush } from "@/lib/push";
import { useFamily, useMembers, useProfile, useSaveMember, useUpdateProfile } from "@/lib/data";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Sex } from "@/lib/types";

export default function Onboarding() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: profile } = useProfile();
  const { data: family } = useFamily();
  const { data: members } = useMembers();
  const saveMember = useSaveMember();
  const updateProfile = useUpdateProfile();
  const hasSelf = !!members?.some((m) => m.is_self);

  const [step, setStep] = useState<1 | 2>(hasSelf ? 2 : 1);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [sex, setSex] = useState<Sex | null>(null);
  const [birth, setBirth] = useState<string | null>(null);
  const [birthComplete, setBirthComplete] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; sex?: string; birth?: string }>({});

  useEffect(() => {
    if (hasSelf) setStep(2);
  }, [hasSelf]);
  useEffect(() => {
    if (profile?.full_name && !name) setName(profile.full_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name]);

  const saveSelf = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t.auth.errors.nameRequired;
    if (!sex) next.sex = t.onboarding.sexRequired;
    if (!birth) next.birth = t.onboarding.invalidDate;
    setErrors(next);
    if (Object.keys(next).length || !family) return;
    try {
      await saveMember.mutateAsync({
        familyId: family.id,
        input: { name: name.trim(), relation: "self", sex, birth_date: birth, color: "#D2261C", is_self: true },
      });
      if (!profile?.full_name) await updateProfile.mutateAsync({ full_name: name.trim(), locale });
      setStep(2);
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  const finish = async (addMember: boolean) => {
    try {
      await updateProfile.mutateAsync({ onboarded: true, locale });
      registerPush(true);
      router.replace("/");
      if (addMember) setTimeout(() => router.push("/member/edit"), 350);
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  if (step === 2) {
    return (
      <Screen safeTop
        footer={
          <>
            <Button label={t.onboarding.addFamily} kind="pen" icon="user-plus" onPress={() => finish(true)} loading={updateProfile.isPending} />
            <Button label={t.onboarding.later} kind="ghost" onPress={() => finish(false)} />
          </>
        }
      >
        <View style={{ paddingTop: insets.top + 60, alignItems: "flex-start", gap: 18 }}>
          <Loupe size={110} />
          <T v="display">{t.onboarding.familyTitle}</T>
          <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>
            {t.onboarding.familyBody}
          </T>
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen safeTop footer={<Button label={t.onboarding.finish} kind="ink" onPress={saveSelf} loading={saveMember.isPending} testID="onboarding-continue" />}>
        <View style={{ paddingTop: insets.top + 24, gap: 10, marginBottom: 26 }}>
          <T v="caption">1 / 2</T>
          <T v="title">{t.onboarding.title}</T>
          <T v="body">{t.onboarding.body}</T>
        </View>
        <View style={{ gap: 20 }}>
          <Field
            label={t.auth.name}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setErrors((e) => ({ ...e, name: undefined }));
            }}
            error={errors.name}
            maxLength={60}
            autoComplete="name"
          />
          <View style={{ gap: 6 }}>
            <T v="smallMedium">{t.onboarding.sex}</T>
            <Choice
              value={sex}
              onChange={(v) => {
                setSex(v);
                setErrors((e) => ({ ...e, sex: undefined }));
              }}
              options={[
                { value: "female", label: t.onboarding.female },
                { value: "male", label: t.onboarding.male },
              ]}
            />
            {errors.sex ? (
              <T v="small" style={{ color: "#D2261C" }}>
                {errors.sex}
              </T>
            ) : null}
          </View>
          <DateField
            label={t.onboarding.birthDate}
            value={birth}
            placeholders={{ day: t.onboarding.day, month: t.onboarding.month, year: t.onboarding.year }}
            onChange={(iso, complete) => {
              setBirth(iso);
              setBirthComplete(complete);
              if (iso) setErrors((e) => ({ ...e, birth: undefined }));
            }}
            error={errors.birth ?? (birthComplete && !birth ? t.onboarding.invalidDate : null)}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
