import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { BodyForm } from "@/components/Body";
import { DateField } from "@/components/DateField";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Choice, Field, Header, Loading, Screen, T, tap } from "@/components/ui";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { keys, useFamily, useMember, useSaveMember } from "@/lib/data";
import { pickPhoto, removeMemberPhoto, uploadMemberPhoto } from "@/lib/photo";
import { PermissionError } from "@/lib/upload";
import { useSelectedMember } from "@/lib/selected";
import { colors, memberColors } from "@/lib/theme";
import type { Member, Relation, Sex } from "@/lib/types";

const RELATIONS: Relation[] = ["partner", "child", "parent", "sibling", "grandparent", "other"];

export default function MemberEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: member, isLoading } = useMember(id);
  if (id && isLoading) return <Loading />;
  return <Form key={member?.id ?? "new"} member={id ? member : undefined} />;
}

function Form({ member }: { member?: Member }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: family } = useFamily();
  const save = useSaveMember();
  const { select } = useSelectedMember();

  const [name, setName] = useState(member?.name ?? "");
  const [relation, setRelation] = useState<Relation>(member?.relation ?? "child");
  const [sex, setSex] = useState<Sex | null>(member?.sex ?? null);
  const [birth, setBirth] = useState<string | null>(member?.birth_date ?? null);
  const [birthComplete, setBirthComplete] = useState(!!member?.birth_date);
  const [color, setColor] = useState(member?.color ?? memberColors[1]);
  const [errors, setErrors] = useState<{ name?: string; sex?: string; birth?: string }>({});
  const [photo, setPhoto] = useState<string | null>(member?.photo_url ?? null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const qc = useQueryClient();

  const choosePhoto = async (source: "library" | "camera") => {
    try {
      const uri = await pickPhoto(source);
      if (uri) {
        setPhoto(uri);
        setPhotoChanged(true);
      }
    } catch (e) {
      toast(e instanceof PermissionError ? (source === "camera" ? t.upload.permissionCamera : t.upload.permissionLibrary) : t.common.genericError, "error");
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace("/family"));

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t.auth.errors.nameRequired;
    if (!sex) next.sex = t.onboarding.sexRequired;
    if (!birth) next.birth = t.onboarding.invalidDate;
    setErrors(next);
    if (Object.keys(next).length || !family) return;
    try {
      const saved = await save.mutateAsync({
        id: member?.id,
        familyId: family.id,
        input: { name: name.trim(), relation: member?.is_self ? "self" : relation, sex, birth_date: birth, color },
      });
      if (photoChanged) {
        try {
          if (photo) await uploadMemberPhoto(saved.id, photo, member?.photo_path ?? null);
          else await removeMemberPhoto(saved.id, member?.photo_path ?? null);
          track("member_photo", { removed: !photo });
        } catch {
          toast(t.memberEdit.photoFailed, "error");
        }
        await qc.invalidateQueries({ queryKey: keys.members });
      }
      track(member ? "member_updated" : "member_added", { relation: saved.relation });
      if (!member) select(saved.id);
      toast(t.memberEdit.saved);
      close();
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Header
        title={member ? t.memberEdit.editTitle : t.memberEdit.newTitle}
        right={
          <Pressable hitSlop={10} onPress={close} accessibilityLabel={t.common.close}>
            <Feather name="x" size={22} color={colors.ink} />
          </Pressable>
        }
      />
      <Screen footer={<Button label={t.common.save} kind="ink" onPress={submit} loading={save.isPending} testID="member-save" />}>
        <View style={{ gap: 22, marginTop: 8 }}>
          <View style={styles.photoRow}>
            <Avatar name={name || "?"} color={color} size={84} photo={photo} />
            <View style={{ flex: 1, gap: 8 }}>
              <T v="smallMedium">{t.memberEdit.photo}</T>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Button small kind="ghost" icon="image" label={t.memberEdit.photoLibrary} onPress={() => choosePhoto("library")} />
                {Platform.OS !== "web" ? <Button small kind="ghost" icon="camera" label={t.memberEdit.photoCamera} onPress={() => choosePhoto("camera")} /> : null}
              </View>
              {photo ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    tap();
                    setPhoto(null);
                    setPhotoChanged(true);
                  }}
                >
                  <T v="small" style={{ color: colors.pen }}>
                    {t.memberEdit.photoRemove}
                  </T>
                </Pressable>
              ) : (
                <T v="caption">{t.memberEdit.photoHint}</T>
              )}
            </View>
          </View>
          <Field
            label={t.memberEdit.name}
            placeholder={t.memberEdit.namePh}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setErrors((e) => ({ ...e, name: undefined }));
            }}
            error={errors.name}
            maxLength={60}
            autoFocus={!member}
          />
          {!member?.is_self ? (
            <View style={{ gap: 8 }}>
              <T v="smallMedium">{t.memberEdit.relation}</T>
              <Choice wrap value={relation} onChange={setRelation} options={RELATIONS.map((r) => ({ value: r, label: t.family.relations[r] }))} />
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
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
              <T v="small" style={{ color: colors.pen }}>
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
          <View style={{ gap: 10 }}>
            <T v="smallMedium">{t.memberEdit.color}</T>
            <View style={styles.colors}>
              {memberColors.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: c === color }}
                  accessibilityLabel={c}
                  onPress={() => {
                    tap();
                    setColor(c);
                  }}
                  style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchOn]}
                >
                  {c === color ? <Feather name="check" size={18} color="#fff" /> : null}
                </Pressable>
              ))}
            </View>
          </View>
          {member ? (
            <View style={{ gap: 10 }}>
              <T v="h3">{t.body.title}</T>
              <BodyForm member={member} saveLabel={t.body.saveOnly} onSaved={() => toast(t.memberEdit.saved)} />
            </View>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", gap: 16, alignItems: "center" },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3, borderColor: colors.paper, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
