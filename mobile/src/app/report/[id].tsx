import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { confirm } from "@/components/confirm";
import { PenUnderline } from "@/components/Pen";
import { Checkin, FindingCard, HiddenTestCard, IndexRow, ResultRow, StatusBadge, StepCard } from "@/components/report";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, Empty, Header, IconButton, Loading, Screen, SectionTitle, T, tap } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { keys, useAnalysis, useDeleteReport, useMember, useReport, useResults } from "@/lib/data";
import { restartAnalysis } from "@/lib/upload";
import { colors, fonts, radius } from "@/lib/theme";

type Tab = "findings" | "hidden" | "values" | "plan";
const STAGES = ["queued", "reading", "calculating", "interpreting"] as const;

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const report = useReport(id);
  const ready = report.data?.status === "ready";
  const analysis = useAnalysis(id, ready);
  const results = useResults(id, ready);
  const { data: member } = useMember(report.data?.member_id);
  const del = useDeleteReport();
  const [tab, setTab] = useState<Tab>("findings");
  const [refining, setRefining] = useState(false);
  const wasProcessing = useRef(false);

  // When processing finishes, pull the fresh reading.
  useEffect(() => {
    const s = report.data?.status;
    if (s === "processing" || s === "uploaded") wasProcessing.current = true;
    if (s === "ready" && wasProcessing.current) {
      wasProcessing.current = false;
      setRefining(false);
      qc.invalidateQueries({ queryKey: keys.analysis(id) });
      qc.invalidateQueries({ queryKey: keys.results(id) });
      qc.invalidateQueries({ queryKey: keys.analyses });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["memberResults"] });
    }
    if (s === "failed") setRefining(false);
  }, [report.data?.status, id, qc]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const remove = async () => {
    if (!report.data) return;
    const ok = await confirm({ title: t.report.deleteTitle, message: t.report.deleteBody, confirm: t.common.delete, cancel: t.common.cancel, destructive: true });
    if (!ok) return;
    try {
      await del.mutateAsync(report.data);
      track("report_deleted", { report_id: id });
      toast(t.report.deleted);
      back();
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  const retry = async () => {
    try {
      await restartAnalysis(id);
      await report.refetch();
    } catch {
      toast(t.common.genericError, "error");
    }
  };

  const submitCheckin = async (answers: Record<string, string>) => {
    setRefining(true);
    try {
      await api("/api/checkin", { body: { reportId: id, answers } });
      track("checkin_submitted", { report_id: id, answers: Object.keys(answers).length });
      wasProcessing.current = true;
      await report.refetch();
    } catch {
      setRefining(false);
      toast(t.common.genericError, "error");
    }
  };

  const share = async () => {
    const a = analysis.data;
    if (!a) return;
    const lines = [
      `${t.report.shareHeader} · ${member?.name ?? ""} · ${formatDate(report.data?.collected_at ?? report.data?.created_at, locale)}`,
      "",
      a.summary ?? "",
      "",
      ...a.findings.map((f, i) => `${i + 1}. ${f.title}: ${f.detail}`),
      "",
      `${t.report.nextSteps}:`,
      ...a.next_steps.map((s) => `• ${s.title}`),
      "",
      `${t.report.doctor}:`,
      ...a.doctor_questions.map((q) => `• ${q}`),
      "",
      t.common.notDiagnosis,
    ];
    try {
      await Share.share({ message: lines.join("\n") });
      track("report_shared", { report_id: id });
    } catch {
      // dismissed
    }
  };

  if (report.isLoading) return <Loading />;
  if (!report.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        <Header onBack={back} />
        <Empty icon="file" title={t.common.genericError} action={<Button label={t.common.back} kind="ghost" onPress={back} />} />
      </View>
    );
  }

  const r = report.data;
  const a = analysis.data;
  const processing = r.status === "processing" || r.status === "uploaded";

  const header = (
    <Header
      onBack={back}
      title={member?.name}
      subtitle={formatDate(r.collected_at ?? r.created_at, locale)}
      right={
        <View style={{ flexDirection: "row" }}>
          {ready && a ? <IconButton icon="share" label={t.report.share} onPress={share} /> : null}
          {!processing ? <IconButton icon="trash-2" label={t.common.delete} onPress={remove} /> : null}
        </View>
      }
    />
  );

  if (processing && !refining && !a) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        {header}
        <Processing stage={r.stage} />
      </View>
    );
  }

  if (r.status === "failed") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        {header}
        <Screen>
          <Empty
            icon="alert-circle"
            title={t.report.failedTitle}
            body={r.stage === "not_a_report" ? t.report.notReport : t.report.failedBody}
            action={
              <View style={{ gap: 10 }}>
                {r.stage !== "not_a_report" ? <Button label={t.report.retry} kind="ink" icon="refresh-cw" onPress={retry} /> : null}
                <Button label={t.home.upload} kind={r.stage === "not_a_report" ? "pen" : "ghost"} onPress={() => router.replace({ pathname: "/upload", params: { memberId: r.member_id } })} />
                <Button label={t.common.delete} kind="danger" onPress={remove} />
              </View>
            }
          />
        </Screen>
      </View>
    );
  }

  if (!a) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.paper }}>
        {header}
        <Loading />
      </View>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "findings", label: t.report.tabs.findings, count: a.findings.length },
    { key: "hidden", label: t.report.tabs.hidden, count: a.hidden_tests.length },
    { key: "values", label: t.report.tabs.values, count: results.data?.length },
    { key: "plan", label: t.report.tabs.plan, count: a.next_steps.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      <Screen>
        <View style={{ gap: 12, marginTop: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {member ? <Avatar name={member.name} color={member.color} size={30} /> : null}
            {a.status ? <StatusBadge status={a.status} /> : null}
            {refining || processing ? (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.pen} />
                <T v="caption">{t.report.checkinRefining}</T>
              </View>
            ) : null}
          </View>
          <T v="h2" selectable>
            {a.summary}
          </T>
          <PenUnderline width={140} />
        </View>

        {a.red_flags?.length ? (
          <View style={styles.red}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Feather name="alert-triangle" size={18} color="#fff" />
              <Text style={styles.redTitle}>{t.report.redFlags}</Text>
            </View>
            {a.red_flags.map((f, i) => (
              <Text key={i} style={styles.redText}>
                {f}
              </Text>
            ))}
          </View>
        ) : null}

        {a.checkin_questions?.length ? (
          <View style={{ marginTop: 20 }}>
            <Checkin questions={a.checkin_questions} answers={a.checkin_answers ?? {}} onSubmit={submitCheckin} busy={refining || processing} />
          </View>
        ) : null}

        <View style={styles.tabs}>
          {tabs.map((x) => {
            const on = x.key === tab;
            return (
              <Pressable
                key={x.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  setTab(x.key);
                }}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && { color: "#fff" }]} numberOfLines={1}>
                  {x.label}
                  {x.count ? <Text style={[styles.tabCount, on && { color: "rgba(255,255,255,0.65)" }]}> {x.count}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "findings" ? (
          <View style={{ gap: 10 }}>
            {a.findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
            {a.indices?.length ? (
              <>
                <SectionTitle title={t.report.indices} />
                <Card style={{ paddingVertical: 4 }}>
                  {a.indices.map((ix) => (
                    <IndexRow key={ix.key} index={ix} />
                  ))}
                </Card>
              </>
            ) : null}
          </View>
        ) : null}

        {tab === "hidden" ? (
          <View style={{ gap: 12 }}>
            {a.hidden_tests.length ? a.hidden_tests.map((h, i) => <HiddenTestCard key={`${h.id}-${i}`} test={h} />) : <Empty icon="eye-off" title={t.report.noHidden} />}
          </View>
        ) : null}

        {tab === "values" ? (
          <View>
            {results.isLoading ? <ActivityIndicator color={colors.ink} /> : null}
            {results.data?.map((res) => (
              <ResultRow
                key={res.id}
                result={res}
                onPress={res.value != null && !res.marker.startsWith("other:") ? () => router.push({ pathname: "/marker", params: { memberId: r.member_id, marker: res.marker, name: res.name } }) : undefined}
              />
            ))}
            <T v="caption" style={{ marginTop: 12 }}>
              {t.report.sampleNote}
            </T>
          </View>
        ) : null}

        {tab === "plan" ? (
          <View>
            <T v="h3" style={{ marginBottom: 4 }}>
              {t.report.nextSteps}
            </T>
            {a.next_steps.map((s, i) => (
              <StepCard key={i} step={s} index={i} />
            ))}
            {a.skip_tests?.length ? (
              <>
                <SectionTitle title={t.report.skip} />
                {a.skip_tests.map((s, i) => (
                  <View key={i} style={styles.skip}>
                    <Text style={styles.skipName}>{s.name}</Text>
                    <T v="small">{s.reason}</T>
                  </View>
                ))}
              </>
            ) : null}
            {a.doctor_questions?.length ? (
              <>
                <SectionTitle title={t.report.doctor} />
                <Card style={{ gap: 12 }}>
                  {a.doctor_questions.map((q, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                      <Text style={{ fontFamily: fonts.hand, fontSize: 22, color: colors.pen, lineHeight: 22 }}>?</Text>
                      <T v="small" style={{ flex: 1, color: colors.ink }}>
                        {q}
                      </T>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            <Button label={t.report.share} kind="ghost" icon="share" onPress={share} style={{ marginTop: 22 }} />
          </View>
        ) : null}

        <T v="caption" style={{ textAlign: "center", marginTop: 26 }}>
          {[r.processing_ms ? fill(t.report.readIn, { s: Math.round(r.processing_ms / 1000) }) : null, r.lab_name].filter(Boolean).join(" · ")}
        </T>
        <T v="caption" style={{ textAlign: "center", marginTop: 6 }}>
          {t.common.notDiagnosis}
        </T>
      </Screen>
    </View>
  );
}

function Processing({ stage }: { stage: string | null }) {
  const { t } = useI18n();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const current = Math.max(0, STAGES.indexOf((stage ?? "queued") as (typeof STAGES)[number]));
  const steps = useMemo(() => STAGES.map((s) => t.report.stages[s]), [t]);

  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 40, gap: 14 }}>
        <Animated.View style={[styles.loupe, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}>
          <Feather name="search" size={44} color={colors.ink} />
        </Animated.View>
        <T v="title" style={{ textAlign: "center" }}>
          {t.report.processingTitle}
        </T>
        <T v="body" style={{ textAlign: "center", maxWidth: 300 }}>
          {t.report.processingBody}
        </T>
      </View>
      <View style={{ marginTop: 34, gap: 14 }}>
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.stepDot, done && { backgroundColor: colors.ink, borderColor: colors.ink }, active && { borderColor: colors.pen }]}>
                {done ? <Feather name="check" size={13} color="#fff" /> : active ? <ActivityIndicator size="small" color={colors.pen} /> : null}
              </View>
              <T v={active ? "bodyMedium" : "body"} style={!done && !active ? { color: colors.ink3 } : undefined}>
                {label}
              </T>
            </View>
          );
        })}
      </View>
      <Button label={t.common.close} kind="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ marginTop: 40 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  red: { marginTop: 20, backgroundColor: colors.pen, borderRadius: radius.lg, padding: 16, gap: 8 },
  redTitle: { fontFamily: fonts.semibold, fontSize: 16, color: "#fff" },
  redText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: "#fff" },
  tabs: { flexDirection: "row", gap: 6, marginTop: 26, marginBottom: 16, flexWrap: "wrap" },
  tab: { paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ruleStrong, justifyContent: "center" },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  tabCount: { fontFamily: fonts.regular, color: colors.ink3 },
  skip: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule, gap: 4 },
  skipName: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.ink, textDecorationLine: "line-through", textDecorationColor: colors.pen },
  loupe: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderColor: colors.ink, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.ruleStrong, alignItems: "center", justifyContent: "center" },
});
