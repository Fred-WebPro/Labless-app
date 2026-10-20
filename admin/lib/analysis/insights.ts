import { adminDb } from "@/lib/supabase";
import { LANG, MODEL, create, parseJson, type UsageSink } from "@/lib/analysis/claude";
import { ageFrom } from "@/lib/analysis/indices";
import { sleepSummary } from "@/lib/analysis/sleep";

export type InsightItem = {
  kind: "connection" | "experiment" | "timing" | "ask_doctor" | "relax" | "family";
  title: string;
  detail: string;
  why: string;
  horizon: "now" | "weeks" | "next_test";
  readout: string;
  members: string[];
};

type InsightsOutput = { headline: string; items: InsightItem[] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "items"],
  properties: {
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "detail", "why", "horizon", "readout", "members"],
        properties: {
          kind: { type: "string", enum: ["connection", "experiment", "timing", "ask_doctor", "relax", "family"] },
          title: { type: "string" },
          detail: { type: "string" },
          why: { type: "string" },
          horizon: { type: "string", enum: ["now", "weeks", "next_test"] },
          readout: { type: "string" },
          members: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const RULES = `Rules for every recommendation:
- It must hinge on THIS data: name the numbers, the combination or the trend it comes from ("why"). If the same sentence could be written for anyone, drop it.
- Banned unless reframed around a specific number with its mechanism and a measurable target: drink more water, eat a balanced diet, exercise regularly, sleep more, reduce stress, see your doctor regularly.
- Prefer what a sharp clinician friend would say: hidden links between markers; small self-experiments with a clear readout at the next test ("readout": which marker should move, roughly where, by when); timing tricks for the next blood draw (strict 10–12 h fast, no hard workout 48 h before because it raises ALT/AST/CK, hydration and hemoglobin, morning draw for TSH/cortisol, same lab for trends); supplement or medication interactions worth asking the doctor about; seasonality (vitamin D in winter); things that look alarming but are fine ("relax").
- One idea per item. 1–3 short sentences in "detail". Plain words, units kept, no fear-mongering, no exclamation marks. Never tell anyone to start, stop or change medication; frame it as a question for the doctor.
- "horizon": "now" for something to do today or at the next draw, "weeks" for a 2–8 week experiment, "next_test" for what to add or watch at the next test.
- Not a diagnosis. Wellness and education only.
- "headline": one sentence with the single most useful idea.
- Write in the requested language.`;

const MEMBER_SYSTEM = `You are Labless, a careful, curious clinical reader. From one person's lab history, write 4–6 personal recommendations that feel discovered, not generic.
"members" is an empty array. "kind" is never "family".
${RULES}`;

const FAMILY_SYSTEM = `You are Labless, a careful, curious clinical reader. You see the lab results of several people in one family (with their relation to the account owner). Write 4–6 recommendations for the family as a whole, the kind no single report could give.
Look for: heredity (a parent's high LDL or glucose plus a child's or adult's borderline value: screening such as Lp(a), ApoB, family cholesterol check, HbA1c); shared household patterns (several people with high triglycerides, insulin or low vitamin D: one kitchen- or routine-level change and how to see it in everyone's next tests); who should get which test next because of someone else's result; kids-specific points (iron, vitamin D, growth-age ranges); joint experiments with a readout per person.
Use people's names in the text and list the names involved in "members". Use "kind": "family" for whole-family items, other kinds when it is about one person in family context.
If only one person has results, write what the relatives should check because of that person's results.
${RULES}`;

type Db = ReturnType<typeof adminDb>;

async function personData(db: Db, member: Record<string, unknown>) {
  const memberId = member.id as string;
  const [{ data: analyses }, { data: results }] = await Promise.all([
    db
      .from("analyses")
      .select("report_id, status, summary, findings, hidden_tests, indices, checkin_questions, checkin_answers, updated_at")
      .eq("member_id", memberId)
      .order("updated_at", { ascending: false })
      .limit(3),
    db
      .from("results")
      .select("marker, name, value, unit, flag, collected_at, report_id")
      .eq("member_id", memberId)
      .not("value", "is", null)
      .order("collected_at", { ascending: true })
      .limit(800),
  ]);
  if (!analyses?.length) return null;

  // Per marker: every value with its date, oldest first, so trends are visible.
  const series: Record<string, { name: string; unit: string | null; flag: string | null; values: [string | null, number][] }> = {};
  for (const r of results ?? []) {
    const s = (series[r.marker] ??= { name: r.name, unit: r.unit, flag: r.flag, values: [] });
    s.values.push([r.collected_at, Number(r.value)]);
    s.flag = r.flag;
  }

  const answers = analyses.flatMap((a) =>
    Object.entries((a.checkin_answers ?? {}) as Record<string, string>).map(([id, answer]) => ({
      question: ((a.checkin_questions ?? []) as { id: string; question: string }[]).find((q) => q.id === id)?.question ?? id,
      answer,
    })),
  );

  const birth = (member.birth_date as string | null) ?? null;
  return {
    name: member.name as string,
    relation: member.relation as string,
    sex: member.sex as string | null,
    age: ageFrom(birth, new Date()),
    latest_reading: {
      status: analyses[0].status,
      summary: analyses[0].summary,
      findings: ((analyses[0].findings ?? []) as { title: string; detail: string; severity: string }[]).map((f) => `${f.severity}: ${f.title} — ${f.detail}`),
      hidden_tests: ((analyses[0].hidden_tests ?? []) as { name: string; estimate: string; confidence: string }[]).map((h) => `${h.name}: ${h.estimate} (${h.confidence})`),
      indices: ((analyses[0].indices ?? []) as { name: string; value: number; status: string }[]).map((i) => `${i.name} ${i.value} ${i.status}`),
    },
    markers: Object.values(series).map((s) => ({ name: s.name, unit: s.unit, last_flag: s.flag, values: s.values.slice(-4) })),
    answers,
    report_ids: analyses.map((a) => a.report_id as string),
  };
}

async function save(db: Db, row: { key: string; owner_id: string; member_id: string | null; scope: "member" | "family"; locale: string; out: InsightsOutput; based_on: string[] }) {
  await db.from("insights").upsert(
    {
      key: row.key,
      owner_id: row.owner_id,
      member_id: row.member_id,
      scope: row.scope,
      headline: row.out.headline,
      items: row.out.items.slice(0, 6),
      based_on: row.based_on,
      locale: row.locale,
      model: MODEL,
      status: "ready",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

async function ask(system: string, language: string, payload: unknown, onUsage?: UsageSink) {
  const { response, usage } = await create({
    model: MODEL,
    max_tokens: 8000,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content: `Write the recommendations. Respond in ${language}.\n\n${JSON.stringify(payload)}` }],
  });
  await onUsage?.("insights", usage);
  return parseJson<InsightsOutput>(response);
}

function usageSink(db: Db, ownerId: string): UsageSink {
  return async (kind, usage) => {
    await db.from("ai_usage").insert({ user_id: ownerId, report_id: null, kind, ...usage });
  };
}

/** Personal recommendations for one family member, from all of their reports. */
export async function refreshMemberInsights(ownerId: string, memberId: string) {
  const db = adminDb();
  const [{ data: member }, { data: profile }] = await Promise.all([
    db.from("members").select("*").eq("id", memberId).single(),
    db.from("profiles").select("locale, timezone").eq("id", ownerId).maybeSingle(),
  ]);
  if (!member) return;
  const person = await personData(db, member);
  if (!person) return;
  const locale = profile?.locale ?? "en";
  const sleep = member.is_self ? await sleepSummary(ownerId, profile?.timezone ?? undefined) : null;
  const { report_ids, ...rest } = person;
  const out = await ask(MEMBER_SYSTEM, LANG[locale] ?? "English", { person: rest, sleep_last_30_days: sleep ?? undefined }, usageSink(db, ownerId));
  await save(db, { key: `member:${memberId}`, owner_id: ownerId, member_id: memberId, scope: "member", locale, out, based_on: report_ids });
}

/** Family-level recommendations across everyone with results. Needs at least two people in the family. */
export async function refreshFamilyInsights(ownerId: string) {
  const db = adminDb();
  const [{ data: members }, { data: profile }] = await Promise.all([
    db.from("members").select("*").eq("owner_id", ownerId),
    db.from("profiles").select("locale").eq("id", ownerId).maybeSingle(),
  ]);
  if (!members || members.length < 2) return;
  const people = (await Promise.all(members.map((m) => personData(db, m)))).filter((p): p is NonNullable<typeof p> => !!p);
  if (!people.length) return;
  const locale = profile?.locale ?? "en";
  const without = members
    .filter((m) => !people.some((p) => p.name === m.name))
    .map((m) => ({ name: m.name, relation: m.relation, sex: m.sex, age: ageFrom(m.birth_date ?? null, new Date()), results: "none yet" }));
  const out = await ask(
    FAMILY_SYSTEM,
    LANG[locale] ?? "English",
    { people: people.map(({ report_ids: _ids, ...p }) => p), relatives_without_results: without },
    usageSink(db, ownerId),
  );
  await save(db, { key: `family:${ownerId}`, owner_id: ownerId, member_id: null, scope: "family", locale, out, based_on: people.flatMap((p) => p.report_ids) });
}

/** After a new reading: refresh that person's and the family's recommendations. Never throws. */
export async function refreshAfterAnalysis(ownerId: string, memberId: string) {
  await Promise.allSettled([refreshMemberInsights(ownerId, memberId), refreshFamilyInsights(ownerId)]).then((r) =>
    r.forEach((x) => x.status === "rejected" && console.error("insights failed", x.reason)),
  );
}
