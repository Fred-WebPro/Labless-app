import Anthropic from "@anthropic-ai/sdk";
import { HIDDEN_TEST_IDS, MARKER_KEYS, MARKERS } from "@/lib/analysis/markers";
import type { IndexResult } from "@/lib/analysis/indices";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 240_000 });
  return client;
}

export class AnalysisError extends Error {
  constructor(public code: "refusal" | "truncated" | "invalid_output" | "not_a_report" | "api", message: string) {
    super(message);
  }
}

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

/** USD per million tokens at standard speed. Fast mode doubles input and output prices. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export type Usage = {
  model: string;
  speed: "fast" | "standard";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  duration_ms: number;
};

export type UsageSink = (kind: "extraction" | "interpretation", usage: Usage) => Promise<void> | void;

function usageOf(response: Anthropic.Beta.BetaMessage, speed: "fast" | "standard", started: number): Usage {
  const u = response.usage as Anthropic.Beta.BetaUsage & { speed?: string | null };
  const actualSpeed = u.speed === "fast" ? "fast" : u.speed === "standard" ? "standard" : speed;
  const price = PRICES[response.model] ?? PRICES[MODEL];
  const mult = actualSpeed === "fast" ? 2 : 1;
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost =
    (input * price.input * mult + output * price.output * mult + cacheRead * price.cacheRead * mult + cacheWrite * price.input * 1.25 * mult) / 1_000_000;
  return {
    model: response.model,
    speed: actualSpeed,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    duration_ms: Date.now() - started,
  };
}

/**
 * Runs a request in fast mode (higher output speed) and falls back to standard speed
 * when fast mode is rate limited or not available for this request.
 */
async function create(params: Omit<CreateParams, "betas" | "fallbacks">): Promise<{ response: Anthropic.Beta.BetaMessage; usage: Usage }> {
  const base = { ...params, fallbacks: "default" as const };
  const started = Date.now();
  try {
    const response = await anthropic().beta.messages.create({
      ...base,
      betas: ["server-side-fallback-2026-07-01", "fast-mode-2026-02-01"],
      speed: "fast",
    } as CreateParams);
    return { response, usage: usageOf(response, "fast", started) };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.BadRequestError) {
      console.warn("fast mode unavailable, using standard speed:", err.message);
      const response = await anthropic().beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"] } as CreateParams);
      return { response, usage: usageOf(response, "standard", started) };
    }
    throw err;
  }
}

const nullable = (type: "string" | "number" | "integer" | "boolean") => ({ type: [type, "null"] });

// ---------- 1. Reading the report ----------

export type ExtractedResult = {
  marker: string;
  name: string;
  display_name: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  canonical_value: number | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  flag: "low" | "high" | "normal" | "critical_low" | "critical_high" | null;
};

export type Extraction = {
  is_lab_report: boolean;
  lab_name: string | null;
  collected_at: string | null;
  patient_sex: "male" | "female" | null;
  patient_age: number | null;
  results: ExtractedResult[];
};

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_lab_report", "lab_name", "collected_at", "patient_sex", "patient_age", "results"],
  properties: {
    is_lab_report: { type: "boolean" },
    lab_name: nullable("string"),
    collected_at: { type: ["string", "null"], description: "YYYY-MM-DD" },
    patient_sex: { anyOf: [{ type: "string", enum: ["male", "female"] }, { type: "null" }] },
    patient_age: nullable("integer"),
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["marker", "name", "display_name", "value", "value_text", "unit", "canonical_value", "ref_low", "ref_high", "ref_text", "flag"],
        properties: {
          marker: { type: "string", enum: [...MARKER_KEYS, "other"] },
          name: { type: "string" },
          display_name: { type: "string" },
          value: nullable("number"),
          value_text: nullable("string"),
          unit: nullable("string"),
          canonical_value: nullable("number"),
          ref_low: nullable("number"),
          ref_high: nullable("number"),
          ref_text: nullable("string"),
          flag: { anyOf: [{ type: "string", enum: ["low", "high", "normal", "critical_low", "critical_high"] }, { type: "null" }] },
        },
      },
    },
  },
} as const;

const CATALOG = MARKERS.map((m) => `${m.key} | ${m.name} | ${m.unit || "-"}`).join("\n");

const EXTRACTION_SYSTEM = `You read medical laboratory reports (photos or PDFs, any language, any lab) and return every test result as structured data.

Rules:
- Read every row of every page. Do not skip tests, do not invent tests that are not printed.
- "name" is the test name exactly as printed. "display_name" is the short standard name of the test in the language the request asks for (for example "Hemoglobin", "Hemoglobina", "Гемоглобин"); keep common abbreviations like ALT, TSH, HbA1c. "value" is the number as printed, in the printed unit. Use a dot as the decimal separator (convert "5,42" to 5.42).
- Qualitative results (Negative, Positive, "< 0.1") go in value_text; put the number in value only when one is printed.
- Map each test to one catalog key in "marker"; use "other" only when nothing fits. A value printed as a percentage of white cells is the *_pct key, an absolute count is the *_abs key.
- canonical_value is the value converted to the catalog unit for that key (for example glucose 6.0 mmol/L -> 108.1 mg/dL, hemoglobin 154 g/L -> 15.4 g/dL, creatinine 88 µmol/L -> 1.0 mg/dL, triglycerides 1.83 mmol/L -> 162 mg/dL, 10^3/µL equals 10^9/L). If the unit already matches, copy the value. Null when it can't be converted.
- ref_low and ref_high are the printed reference range in the printed unit. For "< 5" set ref_high 5 and ref_low null. Put the original range text in ref_text.
- flag reflects the printed flag or, if none is printed, the value against the printed range. Use critical_* only when the lab marks it critical.
- collected_at is the sample collection date (or report date if that's all there is) as YYYY-MM-DD.
- If the images are not a laboratory report, set is_lab_report false and return an empty results array.

Catalog (key | name | canonical unit):
${CATALOG}`;

type FileInput = { mediaType: string; data: string };

export async function extractReport(files: FileInput[], locale: string, onUsage?: UsageSink): Promise<Extraction> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: f.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: f.data,
          },
        },
  );
  content.push({ type: "text", text: `Extract every test result from this laboratory report. Write display_name in ${LANG[locale] ?? "English"}.` });

  const { response, usage } = await create({
    model: MODEL,
    max_tokens: 16000,
    system: EXTRACTION_SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content }],
  });
  await onUsage?.("extraction", usage);
  return parseJson<Extraction>(response);
}

// ---------- 2. Interpreting the results ----------

export type Finding = {
  title: string;
  detail: string;
  severity: "good" | "info" | "watch" | "attention" | "urgent";
  markers: string[];
};
export type HiddenTest = {
  id: (typeof HIDDEN_TEST_IDS)[number];
  name: string;
  estimate: string;
  confidence: "strong" | "moderate" | "screening" | "test";
  explanation: string;
  inputs: string[];
  spares: string;
};
export type NextStep = { title: string; detail: string; kind: "test" | "lifestyle" | "doctor" | "recheck"; priority: "high" | "medium" | "low" };
export type SkipTest = { name: string; reason: string };
export type CheckinQuestion = { id: string; question: string; why: string; kind: "yes_no" | "choice"; options: string[] };

export type Interpretation = {
  status: "good" | "watch" | "attention" | "urgent";
  summary: string;
  findings: Finding[];
  hidden_tests: HiddenTest[];
  next_steps: NextStep[];
  skip_tests: SkipTest[];
  doctor_questions: string[];
  checkin_questions: CheckinQuestion[];
  red_flags: string[];
};

const INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "findings", "hidden_tests", "next_steps", "skip_tests", "doctor_questions", "checkin_questions", "red_flags"],
  properties: {
    status: { type: "string", enum: ["good", "watch", "attention", "urgent"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "severity", "markers"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["good", "info", "watch", "attention", "urgent"] },
          markers: { type: "array", items: { type: "string" } },
        },
      },
    },
    hidden_tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "estimate", "confidence", "explanation", "inputs", "spares"],
        properties: {
          id: { type: "string", enum: [...HIDDEN_TEST_IDS] },
          name: { type: "string" },
          estimate: { type: "string" },
          confidence: { type: "string", enum: ["strong", "moderate", "screening", "test"] },
          explanation: { type: "string" },
          inputs: { type: "array", items: { type: "string" } },
          spares: { type: "string" },
        },
      },
    },
    next_steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "kind", "priority"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          kind: { type: "string", enum: ["test", "lifestyle", "doctor", "recheck"] },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    skip_tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "reason"],
        properties: { name: { type: "string" }, reason: { type: "string" } },
      },
    },
    doctor_questions: { type: "array", items: { type: "string" } },
    checkin_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "why", "kind", "options"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          why: { type: "string" },
          kind: { type: "string", enum: ["yes_no", "choice"] },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
    red_flags: { type: "array", items: { type: "string" } },
  },
} as const;

const LANG: Record<string, string> = { en: "English", es: "Spanish", ru: "Russian" };

const INTERPRETATION_SYSTEM = `You are the reasoning engine of Labless, a wellness app that reads routine blood work far more thoroughly than a quick appointment allows. You explain results to a layperson and prepare them for a conversation with their doctor. You never diagnose or prescribe; you estimate, explain your confidence, and point to the single most useful next step.

You receive: the person's age and sex, every result already converted to canonical units with the lab's own reference range, indices that were computed deterministically in code (never recompute or contradict them), earlier results for the same person when they exist, and answers to earlier check-in questions when they exist.

How to reason:
1. Judge each value against the lab range AND against current guidelines with sex and age in mind (for example fasting glucose 100–125 mg/dL is impaired fasting glucose by ADA even when the lab prints it as normal; HbA1c 5.7–6.4% is the prediabetes range; hs-CRP 1–3 mg/L is average cardiovascular risk, > 3 high). Note when the lab range ignores sex or age.
2. Look for patterns across markers, not single flags: ratios, combinations, values near the edge of their range, and trends across earlier reports (a value falling or rising over time inside the range is a finding).
3. Look for one explanation that accounts for several odd values at once (for example smoking can explain high-normal hematocrit, borderline calcitonin and low-grade CRP together; proton-pump inhibitors can explain borderline calcitonin and a B12 risk). Present such links as hypotheses and turn them into check-in questions.
4. Hidden tests: estimate results of tests that were NOT done, using only the markers present. Include a hidden test only when the inputs support it. Confidence: "strong" = validated formula or strong published association with the needed inputs present; "moderate" = useful estimate that should be confirmed if it changes a decision; "screening" = only says whether to look closer; "test" = blood work can't answer, recommend the real test (vitamin D is almost always "test"). Use these ids: ${HIDDEN_TEST_IDS.join(", ")}. "estimate" is a short verdict (a few words). "spares" names the expensive test or visit this estimate may make unnecessary when the result is reassuring, or says it can't.
5. Next steps: order by value. Prefer the single cheapest test that resolves the most uncertainty. Include lifestyle steps only when tied to a finding. Add "recheck" steps with a timeframe when relevant.
6. Skip tests: name expensive tests or specialist visits that this data makes unnecessary right now, with the reason. Only when the data really supports it.
7. Check-in questions: 0–6 short questions whose answers would change the interpretation (smoking, snoring or daytime sleepiness, heartburn medication, fasting status, family history of diabetes or early heart disease, alcohol, diet, symptoms). Ask only questions this report raises; do not repeat questions that already have answers. Use stable snake_case ids. Options for yes_no are the localized "Yes" and "No".
8. Red flags: values that need prompt medical attention (critical flags, potassium > 6.0 or < 3.0 mmol/L, hemoglobin < 8 g/dL, platelets < 50, glucose > 300 mg/dL, sodium < 125, eGFR < 30, and similar). Say what to do. Empty when there are none. If any exist, status is "urgent".
9. Status: "good" when nothing needs action, "watch" for minor things to keep an eye on, "attention" when a finding deserves a doctor visit or a test soon, "urgent" only for red flags.
10. Findings: 3–8 items, most important first, each with the markers it relies on. Include reassuring findings ("good") when meaningful, so the person knows what is fine.

Writing: plain words, short sentences, no jargon without a one-line explanation, no fear-mongering, no exclamation marks. Numbers keep their units. Never claim certainty you don't have. Never tell the person to stop or change medication. Write everything in the requested language.`;

type InterpretInput = {
  locale: string;
  person: { age: number | null; sex: "male" | "female" | null; relation: string };
  collectedAt: string | null;
  results: { marker: string; name: string; value: number | null; value_text: string | null; unit: string | null; ref: string | null; flag: string | null }[];
  indices: IndexResult[];
  history: { marker: string; date: string | null; value: number }[];
  answers: { question: string; answer: string }[];
};

export async function interpret(input: InterpretInput, onUsage?: UsageSink): Promise<Interpretation> {
  const payload = {
    language: LANG[input.locale] ?? "English",
    person: input.person,
    collected_at: input.collectedAt,
    results: input.results,
    computed_indices: input.indices.map((i) => ({ name: i.name, value: i.value, unit: i.unit, status: i.status, reference: i.reference })),
    earlier_results: input.history,
    checkin_answers: input.answers,
  };

  const { response, usage } = await create({
    model: MODEL,
    max_tokens: 16000,
    system: INTERPRETATION_SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: INTERPRETATION_SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: `Interpret these results. Respond in ${payload.language}.\n\n${JSON.stringify(payload)}`,
      },
    ],
  });
  await onUsage?.("interpretation", usage);
  return parseJson<Interpretation>(response);
}

function parseJson<T>(response: Anthropic.Beta.BetaMessage): T {
  if (response.stop_reason === "refusal") {
    throw new AnalysisError("refusal", "The model declined to process this report.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnalysisError("truncated", "The report was too long to process in one pass.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AnalysisError("invalid_output", "The model returned an unreadable result.");
  }
}
