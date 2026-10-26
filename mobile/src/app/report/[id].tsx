import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { BodyPrompt, hasBody } from "@/components/Body";
import { confirm } from "@/components/confirm";
import { PenUnderline } from "@/components/Pen";
import { AdviceCard, Checkin, DeltaRow, FindingCard, HiddenTestCard, IndexRow, ResultRow, StatusBadge, StepCard, directionColor } from "@/components/report";
import { useToast } from "@/components/Toast";
import { Avatar, Button, Card, Empty, Header, IconButton, Loading, Screen, SectionTitle, T, tap } from "@/components/ui";
import { fill, formatDate, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { compareWithPrevious, outOfRange } from "@/lib/compare";
import { keys, useAnalysis, useDeleteReport, useMember, useMemberResults, useReport, useResults } from "@/lib/data";
import { shareDoctorPdf } from "@/lib/doctorPdf";
import { cancelReminder, getReminder, remindersSupported, setReminder } from "@/lib/reminders";
import { restartAnalysis } from "@/lib/upload";
import { colors, fonts, radius } from "@/lib/theme";

type Tab = "findings" | "changes" | "hidden" | "values" | "plan";
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
  const [outOnly, setOutOnly] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const wasProcessing = useRef(false);
  const history = useMemberResults(report.data?.member_id, ready);
  const deltas = useMemo(
    () => (results.data && history.data ? compareWithPrevious(results.data, history.data, id) : []),
    [results.data, history.data, id],
  );

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

  /** Height and weight were just added: recompute the indices and the reading with them. */
  const bodySaved = async () => {
    setRefining(true);
    try {
      await api("/api/reanalyze", { body: { reportId: id } });
      track("body_added", { report_id: id });
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
    // Kept short: some messengers (Telegram among them) silently drop long text from the share sheet.
    const lines = [
      `${t.report.shareHeader} · ${member?.name ?? ""} · ${formatDate(report.data?.collected_at ?? report.data?.created_at, locale)}`,
      "",
      a.summary ?? "",
      "",
      ...a.findings.slice(0, 4).map((f, i) => `${i + 1}. ${f.title}`),
      "",
      `${t.report.nextSteps}:`,
      ...a.next_steps.slice(0, 3).map((s) => `• ${s.title}`),
      "",
      "Labless · labless.dilami.pro",
    ];
    try {
      await Share.share({ message: lines.join("\n") });
      track("report_shared", { report_id: id });
    } catch {
      // dismissed
    }
  };

  const doctorPdf = async () => {
    if (!report.data || !analysis.data) return;
    setPdfBusy(true);
    try {
      await shareDoctorPdf({ t, locale, member, report: report.data, analysis: analysis.data, results: results.data ?? [], deltas });
      track("doctor_pdf", { report_id: id });
    } catch {
      toast(t.common.genericError, "error");
    } finally {
      setPdfBusy(false);
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
          {ready && a ? <IconButton icon="share" label={t.report.pdf} onPress={doctorPdf} /> : null}
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
    ...(deltas.length || a.changes?.length ? [{ key: "changes" as const, label: t.report.tabs.changes, count: deltas.filter((d) => d.direction === "better" || d.direction === "worse").length || undefined }] : []),
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
            {member ? <Avatar name={member.name} color={member.color} size={30} photo={member.photo_url} /> : null}
            {a.status ? <StatusBadge status={a.status} /> : null}
            {refining || processing ? (
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.pen} />
                <T v="caption">{t.report.checkinRefining}</T>
              </View>
            ) : null}
          </View>
          <Text selectable style={styles.summary}>
            {a.summary}
          </Text>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
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
                <Text style={[styles.tabText, on && { color: colors.onInk }]} numberOfLines={1}>
                  {x.label}
                  {x.count ? <Text style={[styles.tabCount, on && { color: colors.onInkMuted }]}> {x.count}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === "findings" ? (
          <View style={{ gap: 10 }}>
            {a.findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
            {member && !hasBody(member) && !refining && !processing ? (
              <View style={{ marginTop: 10 }}>
                <BodyPrompt member={member} onSaved={bodySaved} />
              </View>
            ) : null}
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

        {tab === "changes" ? (
          <View>
            {a.changes?.length ? (
              <Card style={{ gap: 12, marginBottom: 6 }}>
                <T v="caption">{t.report.changesAi}</T>
                {a.changes.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                    <View style={[styles.changeDot, { backgroundColor: directionColor(c.direction === "stable" ? "stable" : c.direction) }]} />
                    <T v="small" style={{ flex: 1, color: colors.ink }}>
                      <Text style={{ fontFamily: fonts.medium }}>{c.marker}. </Text>
                      {c.note}
                    </T>
                  </View>
                ))}
              </Card>
            ) : null}
            {deltas.length ? (
              <>
                <SectionTitle title={fill(t.report.changesSince, { date: formatDate(deltas[0].prevDate, locale) })} />
                {deltas.map((d) => (
                  <DeltaRow key={d.marker} delta={d} onPress={() => router.push({ pathname: "/marker", params: { memberId: r.member_id, marker: d.marker, name: d.name } })} />
                ))}
              </>
            ) : (
              <T v="small">{t.report.changesEmpty}</T>
            )}
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
            {results.data?.some(outOfRange) ? (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                {[false, true].map((v) => (
                  <Pressable
                    key={String(v)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: outOnly === v }}
                    onPress={() => {
                      tap();
                      setOutOnly(v);
                    }}
                    style={[styles.filter, outOnly === v && styles.tabOn]}
                  >
                    <Text style={[styles.filterText, outOnly === v && { color: colors.onInk }]}>
                      {v ? `${t.report.outOnly} · ${results.data.filter(outOfRange).length}` : t.report.allValues}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {results.data?.filter((res) => !outOnly || outOfRange(res)).map((res) => (
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
            {a.advice?.length ? (
              <>
                <SectionTitle title={t.report.advice} />
                {a.advice.map((x, i) => (
                  <AdviceCard key={i} advice={x} />
                ))}
              </>
            ) : null}
            {remindersSupported ? <RecheckReminder memberId={r.member_id} name={member?.name ?? ""} /> : null}
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
            <Button label={t.report.pdf} kind="ink" icon="file-text" loading={pdfBusy} onPress={doctorPdf} style={{ marginTop: 22 }} />
            <Button label={t.report.shareText} kind="ghost" icon="message-square" onPress={share} style={{ marginTop: 10 }} />
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

function RecheckReminder({ memberId, name }: { memberId: string; name: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [due, setDue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getReminder(memberId).then((d) => alive && setDue(d));
    return () => {
      alive = false;
    };
  }, [memberId]);

  const pick = async (months: number) => {
    setBusy(true);
    try {
      const d = await setReminder(memberId, months, { title: t.report.reminderPush.title, body: fill(t.report.reminderPush.body, { name: name.split(" ")[0] }) });
      if (d) setDue(d);
      else toast(t.report.reminderDenied, "error");
    } catch {
      toast(t.common.genericError, "error");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelReminder(memberId);
      setDue(null);
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { months: 3, label: t.report.reminderMonths.m3 },
    { months: 6, label: t.report.reminderMonths.m6 },
    { months: 12, label: t.report.reminderMonths.m12 },
  ];

  return (
    <Card style={{ gap: 10, marginTop: 22 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Feather name="bell" size={18} color={colors.pen} />
        <T v="h3" style={{ flex: 1 }}>
          {t.report.reminderTitle}
        </T>
      </View>
      {due ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T v="bodyMedium" style={{ flex: 1 }}>
            {fill(t.report.reminderSet, { date: formatDate(due, locale) })}
          </T>
          <Button label={t.report.reminderCancel} kind="ghost" small disabled={busy} onPress={cancel} />
        </View>
      ) : (
        <>
          <T v="small">{t.report.reminderBody}</T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {options.map((o) => (
              <Pressable key={o.months} disabled={busy} onPress={() => { tap(); pick(o.months); }} style={({ pressed }) => [styles.filter, pressed && { backgroundColor: colors.paper2 }]}>
                <Text style={styles.filterText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Card>
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
                {done ? <Feather name="check" size={13} color={colors.onInk} /> : active ? <ActivityIndicator size="small" color={colors.pen} /> : null}
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
  summary: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 27, color: colors.ink, letterSpacing: -0.2 },
  red: { marginTop: 20, backgroundColor: colors.pen, borderRadius: radius.lg, padding: 16, gap: 8 },
  redTitle: { fontFamily: fonts.semibold, fontSize: 16, color: "#fff" },
  redText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: "#fff" },
  tabsScroll: { marginTop: 26, marginBottom: 16, marginHorizontal: -20, flexGrow: 0 },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 20 },
  tab: { paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ruleStrong, justifyContent: "center" },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  tabCount: { fontFamily: fonts.regular, color: colors.ink3 },
  changeDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  filter: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ruleStrong, justifyContent: "center" },
  filterText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink },
  skip: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule, gap: 4 },
  skipName: { fontFamily: fonts.medium, fontSize: 15.5, color: colors.ink, textDecorationLine: "line-through", textDecorationColor: colors.pen },
  loupe: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderColor: colors.ink, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.ruleStrong, alignItems: "center", justifyContent: "center" },
});
