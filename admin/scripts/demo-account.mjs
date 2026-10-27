// Creates (or refreshes) the App Review demo account with two finished readings.
// Usage: node scripts/demo-account.mjs <april.pdf> <october.pdf>
// The email and password are written to admin/.env.demo (git-ignored), never printed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(here, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API = "https://admin.labless.dilami.pro";
const DEMO_FILE = path.join(here, "..", ".env.demo");
const [april, october] = process.argv.slice(2);
if (!april || !october) throw new Error("Pass the April and October sample PDFs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (token, route, body) =>
  fetch(`${API}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

let email, password;
if (fs.existsSync(DEMO_FILE)) {
  const env = Object.fromEntries(fs.readFileSync(DEMO_FILE, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  email = env.DEMO_EMAIL;
  password = env.DEMO_PASSWORD;
} else {
  email = "appreview@labless.dilami.pro";
  password = `Lb-${crypto.randomBytes(6).toString("base64url")}-${crypto.randomInt(10, 99)}`;
  const res = await fetch(`${API}/api/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Emma Carter", locale: "en" }),
  });
  if (res.status !== 200) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  fs.writeFileSync(DEMO_FILE, `DEMO_EMAIL=${email}\nDEMO_PASSWORD=${password}\n`);
  console.log("created", email);
}

const client = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: auth, error } = await client.auth.signInWithPassword({ email, password });
if (error) throw error;
const uid = auth.user.id;
const token = auth.session.access_token;

await client
  .from("profiles")
  .update({ full_name: "Emma Carter", locale: "en", onboarded: true, ai_consent_at: new Date().toISOString(), timezone: "America/New_York" })
  .eq("id", uid);

const { data: fam } = await client.from("families").select("id").single();
const { data: existing } = await client.from("members").select("*");
const find = (name) => existing?.find((m) => m.name === name);
async function member(input) {
  const have = find(input.name);
  if (have) return have;
  const { data, error: e } = await client.from("members").insert({ family_id: fam.id, owner_id: uid, ...input }).select().single();
  if (e) throw e;
  return data;
}
const emma = await member({ name: "Emma Carter", relation: "self", sex: "female", birth_date: "1992-03-02", is_self: true, color: "#D2261C", height_cm: 165, weight_kg: 70, waist_cm: 84 });
await member({ name: "Michael", relation: "partner", sex: "male", birth_date: "1990-06-11", color: "#2F5BD3" });
await member({ name: "Lily", relation: "child", sex: "female", birth_date: "2019-05-20", color: "#1F7A4D" });

const { data: reports } = await client.from("reports").select("id, status, collected_at").eq("member_id", emma.id);
async function reading(file, collected) {
  const done = reports?.find((r) => r.collected_at === collected && r.status === "ready");
  if (done) return console.log("already ready", collected);
  const reportId = crypto.randomUUID();
  const filePath = `${uid}/${reportId}/01.pdf`;
  const up = await client.storage.from("reports").upload(filePath, fs.readFileSync(file), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  const ins = await client
    .from("reports")
    .insert({ id: reportId, owner_id: uid, member_id: emma.id, status: "uploaded", collected_at: collected, files: [{ path: filePath, type: "application/pdf" }] });
  if (ins.error) throw ins.error;
  const start = await call(token, "/api/analyze", { reportId });
  if (start.status !== 202) throw new Error(`analyze: ${start.status} ${await start.text()}`);
  const t0 = Date.now();
  for (;;) {
    await sleep(3000);
    const { data } = await client.from("reports").select("status, stage, error").eq("id", reportId).single();
    if (data.status === "ready") return console.log("ready", collected, `${Math.round((Date.now() - t0) / 1000)}s`);
    if (data.status === "failed" || Date.now() - t0 > 300_000) throw new Error(`analysis ${data.status} ${data.stage} ${data.error ?? ""}`);
  }
}
await reading(april, "2026-04-02");
await reading(october, "2026-10-14");
// The analyses above need consent; clear it so the reviewer meets the consent screen before the first upload.
await client.from("profiles").update({ ai_consent_at: null }).eq("id", uid);
console.log("demo account ready:", email, "(password in admin/.env.demo)");
