export type Relation = "self" | "partner" | "child" | "parent" | "sibling" | "grandparent" | "other";
export type Sex = "male" | "female";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  locale: string;
  role: string;
  onboarded: boolean;
  notifications_enabled: boolean;
  banned_at: string | null;
  created_at: string;
};

export type Family = { id: string; owner_id: string; name: string };

export type Member = {
  id: string;
  family_id: string;
  owner_id: string;
  name: string;
  relation: Relation;
  sex: Sex | null;
  birth_date: string | null;
  color: string;
  is_self: boolean;
  photo_path: string | null;
  /** Signed URL for photo_path, added by useMembers. */
  photo_url?: string | null;
  /** Body measurements in metric; used for BMI, body fat and visceral fat indices. */
  height_cm: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
  body_measured_at: string | null;
  created_at: string;
};

export type ReportStatus = "uploaded" | "processing" | "ready" | "failed";

export type Report = {
  id: string;
  owner_id: string;
  member_id: string;
  status: ReportStatus;
  stage: string | null;
  files: { path: string; type: string }[];
  title: string | null;
  lab_name: string | null;
  collected_at: string | null;
  error: string | null;
  processing_ms: number | null;
  created_at: string;
};

export type Severity = "good" | "info" | "watch" | "attention" | "urgent";
export type Confidence = "strong" | "moderate" | "screening" | "test";

export type Finding = { title: string; detail: string; severity: Severity; markers: string[] };
export type HiddenTest = {
  id: string;
  name: string;
  estimate: string;
  confidence: Confidence;
  explanation: string;
  inputs: string[];
  spares: string;
};
export type IndexResult = {
  key: string;
  name: string;
  value: number;
  unit: string;
  status: "optimal" | "normal" | "borderline" | "high" | "low";
  reference: string;
  inputs: string[];
  source: string;
};
export type NextStep = { title: string; detail: string; kind: "test" | "lifestyle" | "doctor" | "recheck"; priority: "high" | "medium" | "low" };
export type CheckinQuestion = { id: string; question: string; why: string; kind: "yes_no" | "choice"; options: string[] };
export type AdviceArea = "nutrition" | "activity" | "sleep" | "stress" | "habits" | "supplements";
export type Advice = { area: AdviceArea; title: string; detail: string };
export type Change = { marker: string; direction: "better" | "worse" | "stable"; note: string };

export type Analysis = {
  report_id: string;
  member_id: string;
  status: "good" | "watch" | "attention" | "urgent" | null;
  summary: string | null;
  findings: Finding[];
  hidden_tests: HiddenTest[];
  indices: IndexResult[];
  next_steps: NextStep[];
  skip_tests: { name: string; reason: string }[];
  doctor_questions: string[];
  checkin_questions: CheckinQuestion[];
  checkin_answers: Record<string, string>;
  red_flags: string[];
  advice?: Advice[];
  changes?: Change[];
  updated_at: string;
};

export type Result = {
  id: number;
  report_id: string;
  member_id: string;
  marker: string;
  name: string;
  category: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  flag: "low" | "high" | "normal" | "critical_low" | "critical_high" | null;
  collected_at: string | null;
  created_at: string;
};

export type InsightItem = {
  kind: "connection" | "experiment" | "timing" | "ask_doctor" | "relax" | "family";
  title: string;
  detail: string;
  why: string;
  horizon: "now" | "weeks" | "next_test";
  readout: string;
  members: string[];
};

export type Insights = {
  key: string;
  scope: "member" | "family";
  member_id: string | null;
  headline: string | null;
  items: InsightItem[];
  updated_at: string;
};

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  data: { route?: string; url?: string } | null;
  read_at: string | null;
  created_at: string;
};
