import { adminDb } from "@/lib/supabase";
import { AnalysisError, MODEL, extractReport, interpret, type UsageSink } from "@/lib/analysis/claude";
import { ageFrom, computeIndices } from "@/lib/analysis/indices";
import { markerByKey } from "@/lib/analysis/markers";
import { refreshAfterAnalysis } from "@/lib/analysis/insights";
import { sleepSummary } from "@/lib/analysis/sleep";
import { pushToUser } from "@/lib/push";

const READY_PUSH: Record<string, { title: string; body: (name: string) => string }> = {
  en: { title: "Your reading is ready", body: (n) => `${n}: open it to see the findings and hidden tests.` },
  es: { title: "Tu lectura está lista", body: (n) => `${n}: ábrela para ver los hallazgos y las pruebas ocultas.` },
  ru: { title: "Разбор готов", body: (n) => `${n}: откройте, чтобы увидеть находки и скрытые анализы.` },
};

type ReportFile = { path: string; type: string };

async function setStage(reportId: string, stage: string) {
  await adminDb().from("reports").update({ stage }).eq("id", reportId);
}

async function loadFiles(files: ReportFile[]) {
  const db = adminDb();
  return Promise.all(
    files.map(async (f) => {
      const { data, error } = await db.storage.from("reports").download(f.path);
      if (error || !data) throw new AnalysisError("api", `Couldn't read ${f.path}`);
      const buf = Buffer.from(await data.arrayBuffer());
      const mediaType = f.type === "application/pdf" ? "application/pdf" : f.type === "image/png" ? "image/png" : f.type === "image/webp" ? "image/webp" : "image/jpeg";
      return { mediaType, data: buf.toString("base64") };
    }),
  );
}

/**
 * Full pipeline: read the files, store results, compute indices, interpret.
 * With `reinterpretOnly`, reuses stored results and only re-runs interpretation
 * (used after the person answers check-in questions).
 */
export async function runAnalysis(reportId: string, opts: { reinterpretOnly?: boolean } = {}) {
  const db = adminDb();
  const started = Date.now();

  const { data: report } = await db.from("reports").select("*").eq("id", reportId).single();
  if (!report) throw new Error("report not found");
  const { data: member } = await db.from("members").select("*").eq("id", report.member_id).single();
  const { data: profile } = await db.from("profiles").select("locale, timezone").eq("id", report.owner_id).maybeSingle();
  const locale = profile?.locale ?? "en";
  const logUsage: UsageSink = async (kind, usage) => {
    const { error } = await db.from("ai_usage").insert({ user_id: report.owner_id, report_id: reportId, kind, ...usage });
    if (error) console.error("ai_usage insert failed", error.message);
  };

  try {
    let sex: "male" | "female" | null = member?.sex ?? null;
    let collectedAt: string | null = report.collected_at;
    let age = ageFrom(member?.birth_date ?? null, collectedAt ? new Date(collectedAt) : new Date());

    if (!opts.reinterpretOnly) {
      await db.from("reports").update({ status: "processing", stage: "reading", error: null }).eq("id", reportId);
      const files = await loadFiles((report.files ?? []) as ReportFile[]);
      if (files.length === 0) throw new AnalysisError("not_a_report", "No files were uploaded.");

      const extraction = await extractReport(files, locale, logUsage);
      const rows = (extraction.results ?? []).filter((r) => r.name);
      if (!extraction.is_lab_report || rows.length === 0) {
        throw new AnalysisError("not_a_report", "We couldn't find lab results in these files.");
      }

      sex = sex ?? extraction.patient_sex;
      if (age == null && extraction.patient_age) age = extraction.patient_age;
      if (!collectedAt && extraction.collected_at && /^\d{4}-\d{2}-\d{2}$/.test(extraction.collected_at)) {
        collectedAt = extraction.collected_at;
      }

      await setStage(reportId, "calculating");
      await db.from("results").delete().eq("report_id", reportId);
      const insert = rows.map((r) => {
        const def = markerByKey.get(r.marker);
        const canonical = def && r.canonical_value != null && Number.isFinite(r.canonical_value);
        const norm = (u: string | null | undefined) => (u ?? "").toLowerCase().replace(/[\s·.]/g, "").replace("μ", "µ");
        const sameUnit = canonical && norm(r.unit) === norm(def!.unit);
        return {
          report_id: reportId,
          member_id: report.member_id,
          owner_id: report.owner_id,
          marker: r.marker === "other" ? `other:${r.name.toLowerCase().slice(0, 40)}` : r.marker,
          name: r.display_name?.trim() || r.name,
          printed_name: r.name,
          category: def?.category ?? "other",
          value: canonical ? r.canonical_value : r.value,
          value_text: r.value_text,
          unit: canonical ? def!.unit : r.unit,
          ref_low: canonical && !sameUnit ? null : r.ref_low,
          ref_high: canonical && !sameUnit ? null : r.ref_high,
          ref_text: r.ref_text ?? (r.ref_low != null || r.ref_high != null ? `${r.ref_low ?? ""}–${r.ref_high ?? ""} ${r.unit ?? ""}`.trim() : null),
          flag: r.flag,
          collected_at: collectedAt,
        };
      });
      const { error: insertError } = await db.from("results").insert(insert);
      if (insertError) throw new AnalysisError("api", insertError.message);

      await db
        .from("reports")
        .update({ lab_name: extraction.lab_name, collected_at: collectedAt, title: extraction.lab_name ?? report.title })
        .eq("id", reportId);
    } else {
      await db.from("reports").update({ status: "processing", stage: "interpreting", error: null }).eq("id", reportId);
    }

    const { data: results } = await db.from("results").select("*").eq("report_id", reportId);
    const values: Record<string, number> = {};
    for (const r of results ?? []) {
      if (r.value != null && markerByKey.has(r.marker)) values[r.marker] = Number(r.value);
    }
    const body = {
      heightCm: member?.height_cm != null ? Number(member.height_cm) : null,
      weightKg: member?.weight_kg != null ? Number(member.weight_kg) : null,
      waistCm: member?.waist_cm != null ? Number(member.waist_cm) : null,
    };
    const indices = computeIndices(values, { age, sex, ...body });

    const { data: history } = await db
      .from("results")
      .select("marker, value, collected_at, report_id")
      .eq("member_id", report.member_id)
      .neq("report_id", reportId)
      .not("value", "is", null)
      .order("collected_at", { ascending: false })
      .limit(300);

    const { data: existing } = await db.from("analyses").select("checkin_questions, checkin_answers").eq("report_id", reportId).maybeSingle();
    const answers = Object.entries((existing?.checkin_answers ?? {}) as Record<string, string>).map(([id, answer]) => ({
      question: ((existing?.checkin_questions ?? []) as { id: string; question: string }[]).find((q) => q.id === id)?.question ?? id,
      answer,
    }));

    await setStage(reportId, "interpreting");
    const result = await interpret({
      locale,
      person: {
        age,
        sex,
        relation: member?.relation ?? "self",
        height_cm: body.heightCm,
        weight_kg: body.weightKg,
        waist_cm: body.waistCm,
      },
      collectedAt,
      results: (results ?? []).map((r) => ({
        marker: r.marker,
        name: r.name,
        value: r.value != null ? Number(r.value) : null,
        value_text: r.value_text,
        unit: r.unit,
        ref: r.ref_text,
        flag: r.flag,
      })),
      indices,
      // Only earlier draws count as history; a report uploaded later for an older date is not "previous".
      history: (history ?? [])
        .filter((h) => !collectedAt || !h.collected_at || h.collected_at <= collectedAt)
        .map((h) => ({ marker: h.marker, date: h.collected_at, value: Number(h.value) })),
      answers,
      sleep: member?.is_self ? await sleepSummary(report.owner_id, profile?.timezone ?? undefined) : null,
    }, logUsage);

    // Keep questions that were already answered so their answers stay readable.
    const answeredIds = new Set(answers.length ? Object.keys(existing?.checkin_answers ?? {}) : []);
    const previous = ((existing?.checkin_questions ?? []) as { id: string }[]).filter((q) => answeredIds.has(q.id));
    const questions = [...previous, ...result.checkin_questions.filter((q) => !answeredIds.has(q.id))];

    const { error: upsertError } = await db.from("analyses").upsert({
      report_id: reportId,
      owner_id: report.owner_id,
      member_id: report.member_id,
      status: result.status,
      summary: result.summary,
      findings: result.findings,
      hidden_tests: result.hidden_tests,
      indices,
      next_steps: result.next_steps,
      skip_tests: result.skip_tests,
      doctor_questions: result.doctor_questions,
      checkin_questions: questions,
      checkin_answers: existing?.checkin_answers ?? {},
      red_flags: result.red_flags,
      advice: result.advice,
      changes: result.changes,
      locale,
      model: MODEL,
    });
    if (upsertError) throw new AnalysisError("api", upsertError.message);

    await db
      .from("reports")
      .update({ status: "ready", stage: "done", error: null, processing_ms: Date.now() - started })
      .eq("id", reportId);
    await db.from("events").insert({
      user_id: report.owner_id,
      name: opts.reinterpretOnly ? "analysis_refined" : "analysis_ready",
      props: { report_id: reportId, ms: Date.now() - started, results: results?.length ?? 0, status: result.status },
      platform: "server",
    });

    if (!opts.reinterpretOnly) {
      const text = READY_PUSH[locale] ?? READY_PUSH.en;
      await pushToUser(report.owner_id, text.title, text.body(member?.name ?? ""), { route: `/report/${reportId}` }).catch((e) =>
        console.error("ready push failed", e),
      );
    }
    await refreshAfterAnalysis(report.owner_id, report.member_id);
  } catch (err) {
    const code = err instanceof AnalysisError ? err.code : "api";
    const message = err instanceof Error ? err.message : String(err);
    console.error("analysis failed", reportId, code, message);
    await db
      .from("reports")
      .update({ status: "failed", stage: code, error: message.slice(0, 500), processing_ms: Date.now() - started })
      .eq("id", reportId);
    await db.from("events").insert({
      user_id: report.owner_id,
      name: "analysis_failed",
      props: { report_id: reportId, code, message: message.slice(0, 200) },
      platform: "server",
    });
  }
}
