import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Header, Screen, T, tap } from "@/components/ui";
import { fill, useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { useMembers } from "@/lib/data";
import { useSelectedMember } from "@/lib/selected";
import { MAX_PAGES, PermissionError, pickFromCamera, pickFromLibrary, pickPdf, submitReport, type Page } from "@/lib/upload";
import { useSharedFiles } from "@/lib/share";
import { colors, fonts, radius } from "@/lib/theme";

export default function Upload() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { data: members } = useMembers();
  const { selected, select } = useSelectedMember();
  const [memberId, setMemberId] = useState<string | null>(params.memberId ?? selected?.id ?? null);
  const [pages, setPages] = useState<Page[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId && selected) setMemberId(selected.id);
  }, [selected, memberId]);

  // Files shared from WhatsApp, Mail, Files or Photos land here as ready pages.
  const [fromShare, setFromShare] = useState(false);
  useSharedFiles(
    (incoming) => {
      setFromShare(true);
      setPages((p) => [...p, ...incoming].slice(0, MAX_PAGES));
    },
    () => toast(t.upload.shareUnsupported, "error"),
  );

  const room = MAX_PAGES - pages.length;
  const add = async (source: "camera" | "gallery" | "pdf") => {
    if (room <= 0) return toast(t.upload.maxPages, "error");
    try {
      const picked = source === "camera" ? await pickFromCamera() : source === "gallery" ? await pickFromLibrary(room) : await pickPdf();
      if (picked.length) setPages((p) => [...p, ...picked].slice(0, MAX_PAGES));
    } catch (err) {
      if (err instanceof PermissionError) toast(err.message === "camera" ? t.upload.permissionCamera : t.upload.permissionLibrary, "error");
      else toast(t.common.genericError, "error");
    }
  };

  const submit = async () => {
    if (!memberId) return;
    if (!pages.length) return toast(t.upload.empty, "error");
    try {
      const reportId = await submitReport(memberId, pages, (done, total) =>
        setProgress(done < total ? fill(t.upload.uploading, { i: done + 1, n: total }) : t.upload.starting),
      );
      select(memberId);
      qc.invalidateQueries({ queryKey: ["reports"] });
      router.replace(`/report/${reportId}`);
    } catch (err) {
      setProgress(null);
      toast(
        err instanceof ApiError && err.code === "network"
          ? t.common.networkError
          : err instanceof ApiError && err.code === "banned"
            ? t.auth.errors.banned
            : t.common.genericError,
        "error",
      );
    }
  };

  const busy = progress !== null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Header title={t.upload.title} right={<Pressable hitSlop={10} onPress={() => router.back()} disabled={busy}><Feather name="x" size={22} color={colors.ink} /></Pressable>} />
      <Screen
        footer={
          <Button
            label={busy ? progress! : pages.length > 1 ? fill(t.upload.submitCount, { n: pages.length }) : t.upload.submit}
            kind="pen"
            icon={busy ? undefined : "zap"}
            loading={false}
            disabled={!pages.length || !memberId || busy}
            onPress={submit}
            testID="upload-submit"
          />
        }
      >
        <T v="smallMedium" style={{ marginTop: 6, marginBottom: 10 }}>
          {t.upload.forWho}
        </T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {members?.map((m) => {
            const on = m.id === memberId;
            return (
              <Pressable
                key={m.id}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  setMemberId(m.id);
                }}
                style={[styles.member, on && styles.memberOn]}
              >
                <Avatar name={m.name} color={m.color} size={28} />
                <Text style={[styles.memberText, on && { color: "#fff" }]} numberOfLines={1}>
                  {m.is_self ? t.member.you : m.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable disabled={busy} onPress={() => router.push("/member/edit")} style={[styles.member, { paddingRight: 14 }]}>
            <View style={styles.plus}>
              <Feather name="plus" size={16} color={colors.ink} />
            </View>
            <Text style={styles.memberText}>{t.common.add}</Text>
          </Pressable>
        </ScrollView>

        {fromShare ? (
          <View style={styles.sharedNote}>
            <Feather name="share" size={16} color={colors.pen} />
            <T v="small" style={{ flex: 1, color: colors.ink }}>
              {t.upload.shared}
            </T>
          </View>
        ) : null}

        <View style={styles.sources}>
          <Source icon="camera" label={t.upload.camera} onPress={() => add("camera")} disabled={busy} />
          <Source icon="image" label={t.upload.gallery} onPress={() => add("gallery")} disabled={busy} />
          <Source icon="file" label={t.upload.pdf} onPress={() => add("pdf")} disabled={busy} />
        </View>

        {pages.length ? (
          <>
            <T v="smallMedium" style={{ marginTop: 24, marginBottom: 10 }}>
              {t.upload.pages} · {pages.length}/{MAX_PAGES}
            </T>
            <View style={styles.grid}>
              {pages.map((p, i) => (
                <View key={p.key} style={styles.thumb}>
                  {p.kind === "image" ? (
                    <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.pdf}>
                      <Feather name="file-text" size={26} color={colors.pen} />
                      <Text style={styles.pdfText} numberOfLines={2}>
                        {p.name ?? t.upload.pdfPage}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.pageNum}>{i + 1}</Text>
                  {!busy ? (
                    <Pressable
                      accessibilityLabel={t.upload.remove}
                      hitSlop={8}
                      onPress={() => {
                        tap();
                        setPages((all) => all.filter((x) => x.key !== p.key));
                      }}
                      style={styles.remove}
                    >
                      <Feather name="x" size={14} color="#fff" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.tips}>
            <T v="hand" style={{ fontSize: 26 }}>
              {t.upload.tipTitle}
            </T>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Text style={{ fontFamily: fonts.hand, fontSize: 20, color: colors.pen }}>↗</Text>
              <T v="small" style={{ flex: 1 }}>
                {t.upload.shareTip}
              </T>
            </View>
            {t.upload.tips.map((tip) => (
              <View key={tip} style={{ flexDirection: "row", gap: 10 }}>
                <Text style={{ fontFamily: fonts.hand, fontSize: 20, color: colors.pen }}>✓</Text>
                <T v="small" style={{ flex: 1 }}>
                  {tip}
                </T>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 22 }}>
          <Feather name="lock" size={14} color={colors.ink3} />
          <T v="caption">{t.upload.privacy}</T>
        </View>
      </Screen>
    </View>
  );
}

function Source({ icon, label, onPress, disabled }: { icon: "camera" | "image" | "file"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.source, pressed && { backgroundColor: colors.paper2 }, disabled && { opacity: 0.5 }]}
    >
      <Feather name={icon} size={24} color={colors.ink} />
      <Text style={styles.sourceText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  member: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  memberOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  memberText: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.ink, maxWidth: 130 },
  plus: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.paper2, alignItems: "center", justifyContent: "center" },
  sources: { flexDirection: "row", gap: 10, marginTop: 24 },
  source: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.ruleStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 10,
  },
  sourceText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  thumb: {
    width: "30.8%",
    aspectRatio: 0.75,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.paper2,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  pdf: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
  pdfText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.ink2, textAlign: "center" },
  pageNum: {
    position: "absolute",
    left: 6,
    bottom: 6,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: "#fff",
    backgroundColor: "rgba(18,18,18,0.7)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  remove: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(18,18,18,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  sharedNote: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginTop: 18,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.penSoft,
  },
  tips: { marginTop: 26, gap: 10, padding: 18, borderRadius: radius.lg, backgroundColor: colors.paper2 },
});
