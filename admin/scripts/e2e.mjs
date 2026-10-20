// End-to-end check of every backend call the app makes, against the deployed API.
// Creates throwaway accounts, runs the full flow, then deletes everything it created.
// Usage: node scripts/e2e.mjs [path/to/report.pdf|jpg]
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
const API = process.env.E2E_API ?? "https://labless-admin.vercel.app";
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const created = [];

async function newUser(name, locale) {
  const email = `qa+${crypto.randomBytes(5).toString("hex")}@labless.test`;
  const password = crypto.randomBytes(12).toString("base64url");
  const res = await fetch(`${API}/api/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name, locale }),
  });
  ok(res.status === 200, `signup ${name}`, String(res.status));
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  ok(!error && !!data.session, `sign in ${name}`, error?.message);
  created.push(data.user.id);
  return { client, user: data.user, token: data.session.access_token, email, password };
}

const call = (token, route, body, method = "POST") =>
  fetch(`${API}${route}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

async function waitReport(client, id, timeoutMs = 280_000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const { data } = await client.from("reports").select("status, stage, error, processing_ms").eq("id", id).single();
    if (data?.stage !== last) {
      console.log(`      stage: ${data?.status}/${data?.stage}`);
      last = data?.stage;
    }
    if (data?.status === "ready" || data?.status === "failed") return { ...data, waited: Date.now() - start };
    await sleep(1500);
  }
  return { status: "timeout" };
}

try {
  // ---------- Signup validation ----------
  const bad = await call(null, "/api/signup", { email: "nope", password: "12345678" });
  ok(bad.status === 400, "signup rejects invalid email");
  const weak = await call(null, "/api/signup", { email: "qa+weak@labless.test", password: "123" });
  ok(weak.status === 400, "signup rejects short password");

  const a = await newUser("QA Anna", "ru");
  const dup = await call(null, "/api/signup", { email: a.email, password: "longenough1" });
  ok(dup.status === 409, "signup rejects taken email", String(dup.status));

  // ---------- Bootstrap trigger ----------
  const { data: profile } = await a.client.from("profiles").select("*").eq("id", a.user.id).single();
  ok(profile?.full_name === "QA Anna" && profile?.locale === "ru", "profile created with name and locale");
  const { data: fams } = await a.client.from("families").select("*");
  ok(fams?.length === 1, "family created automatically");
  const familyId = fams[0].id;

  // ---------- Profile column guard ----------
  const { error: roleErr } = await a.client.from("profiles").update({ role: "admin" }).eq("id", a.user.id);
  ok(!!roleErr, "client can't promote itself to admin");
  const { error: upErr } = await a.client.from("profiles").update({ onboarded: true, platform: "ios", last_seen_at: new Date().toISOString() }).eq("id", a.user.id);
  ok(!upErr, "client updates allowed profile fields", upErr?.message);

  // ---------- Members ----------
  const { data: self, error: selfErr } = await a.client
    .from("members")
    .insert({ family_id: familyId, owner_id: a.user.id, name: "Anna", relation: "self", sex: "male", birth_date: "2001-04-12", is_self: true, color: "#D2261C" })
    .select()
    .single();
  ok(!selfErr && self, "create self member", selfErr?.message);
  const { data: kid } = await a.client
    .from("members")
    .insert({ family_id: familyId, owner_id: a.user.id, name: "Kid", relation: "child", sex: "female", birth_date: "2018-02-01", color: "#2F5BD3" })
    .select()
    .single();
  ok(!!kid, "create child member");
  const { error: editErr } = await a.client.from("members").update({ name: "Kiddo", color: "#1F7A4D" }).eq("id", kid.id);
  ok(!editErr, "edit member");
  const { error: badRel } = await a.client.from("members").insert({ family_id: familyId, owner_id: a.user.id, name: "X", relation: "boss" });
  ok(!!badRel, "invalid relation rejected");

  // ---------- Isolation between accounts ----------
  const b = await newUser("QA Boris", "en");
  const { data: bSees } = await b.client.from("members").select("*");
  ok((bSees ?? []).length === 0, "another account sees none of these members");
  const { error: steal } = await b.client.from("members").insert({ family_id: familyId, owner_id: b.user.id, name: "Intruder" });
  ok(!!steal, "can't add a member to someone else's family");
  const { error: steal2 } = await b.client.from("reports").insert({ owner_id: b.user.id, member_id: self.id, files: [] });
  ok(!!steal2, "can't create a report for someone else's member");

  // ---------- Upload + analysis ----------
  const sample = process.argv[2];
  if (sample && fs.existsSync(sample)) {
    const isPdf = sample.toLowerCase().endsWith(".pdf");
    const reportId = crypto.randomUUID();
    const filePath = `${a.user.id}/${reportId}/01.${isPdf ? "pdf" : "jpg"}`;
    const { error: upFile } = await a.client.storage.from("reports").upload(filePath, fs.readFileSync(sample), { contentType: isPdf ? "application/pdf" : "image/jpeg" });
    ok(!upFile, "upload report file", upFile?.message);
    const { error: otherFolder } = await b.client.storage.from("reports").upload(`${a.user.id}/${reportId}/x.jpg`, Buffer.from("x"), { contentType: "image/jpeg" });
    ok(!!otherFolder, "can't upload into another user's folder");

    const { error: insErr } = await a.client.from("reports").insert({ id: reportId, owner_id: a.user.id, member_id: self.id, status: "uploaded", files: [{ path: filePath, type: isPdf ? "application/pdf" : "image/jpeg" }] });
    ok(!insErr, "create report row", insErr?.message);

    const noAuth = await call(null, "/api/analyze", { reportId });
    ok(noAuth.status === 401, "analyze requires sign-in");
    const wrongUser = await call(b.token, "/api/analyze", { reportId });
    ok(wrongUser.status === 404, "analyze refuses another user's report");

    const start = await call(a.token, "/api/analyze", { reportId });
    ok(start.status === 202, "analyze accepted", String(start.status));
    const done = await waitReport(a.client, reportId);
    ok(done.status === "ready", "analysis finished", `${done.status} ${done.error ?? ""} in ${Math.round((done.waited ?? 0) / 1000)}s`);

    const { data: analysis } = await a.client.from("analyses").select("*").eq("report_id", reportId).maybeSingle();
    const { data: results } = await a.client.from("results").select("*").eq("report_id", reportId);
    ok(!!analysis?.summary, "analysis has a summary", analysis?.summary?.slice(0, 80));
    ok((results ?? []).length >= 10, "results extracted", String(results?.length));
    ok(Array.isArray(analysis?.findings) && analysis.findings.length > 0, "findings present", String(analysis?.findings?.length));
    ok(Array.isArray(analysis?.indices) && analysis.indices.some((i) => i.key === "homa_ir"), "HOMA-IR computed in code", JSON.stringify(analysis?.indices?.find((i) => i.key === "homa_ir")?.value));
    ok(Array.isArray(analysis?.hidden_tests), "hidden tests present", String(analysis?.hidden_tests?.length));
    console.log("      findings:", analysis?.findings?.map((f) => f.title).join(" | "));
    console.log("      hidden:", analysis?.hidden_tests?.map((h) => `${h.name}=${h.estimate}`).join(" | "));
    console.log("      questions:", analysis?.checkin_questions?.map((q) => q.question).join(" | "));
    ok(Array.isArray(analysis?.advice) && analysis.advice.length > 0, "health advice present", String(analysis?.advice?.length));
    ok(Array.isArray(analysis?.changes) && analysis.changes.length === 0, "no changes without earlier reports", String(analysis?.changes?.length));
    console.log("      advice:", analysis?.advice?.map((a) => `[${a.area}] ${a.title}`).join(" | "));
    const { data: usage } = await admin.from("ai_usage").select("kind, cost_usd, speed").eq("report_id", reportId);
    const cost = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
    ok((usage ?? []).length >= 2 && cost > 0, "AI cost recorded for the report", `${usage?.length} calls, $${cost.toFixed(4)}, ${usage?.map((u) => u.speed).join("/")}`);
    const isRu = /[а-яё]/i.test(analysis?.summary ?? "");
    ok(isRu, "reading written in the profile language (ru)");

    const { error: tamper } = await a.client.from("reports").update({ status: "ready", error: "x" }).eq("id", reportId);
    ok(!!tamper, "client can't overwrite processing fields");

    // Check-in refinement
    const q = analysis?.checkin_questions?.[0];
    if (q) {
      const answer = (q.options?.length ? q.options : ["Да"])[0];
      const res = await call(a.token, "/api/checkin", { reportId, answers: { [q.id]: answer } });
      ok(res.status === 202, "check-in accepted", String(res.status));
      const again = await waitReport(a.client, reportId);
      ok(again.status === "ready", "refined reading ready", `${again.status} in ${Math.round((again.waited ?? 0) / 1000)}s`);
      const { data: refined } = await a.client.from("analyses").select("checkin_answers, checkin_questions").eq("report_id", reportId).single();
      ok(refined?.checkin_answers?.[q.id] === answer, "answer stored");
      ok(refined?.checkin_questions?.some((x) => x.id === q.id), "answered question kept");
    } else {
      console.log("      (no check-in questions generated)");
    }
    const badCheckin = await call(a.token, "/api/checkin", { reportId, answers: { not_a_question: "yes" } });
    ok(badCheckin.status === 400, "check-in ignores unknown questions");

    // Delete report: storage + row
    await a.client.storage.from("reports").remove([filePath]);
    const { error: delRep } = await a.client.from("reports").delete().eq("id", reportId);
    ok(!delRep, "delete report");
    const { data: gone } = await a.client.from("results").select("id").eq("report_id", reportId);
    ok((gone ?? []).length === 0, "results deleted with the report");
  } else {
    console.log("SKIP  analysis (pass a report file to test it)");
  }

  // ---------- Ban ----------
  await admin.from("profiles").update({ banned_at: new Date().toISOString() }).eq("id", b.user.id);
  const bFamily = (await b.client.from("families").select("id").single()).data;
  const { error: bannedInsert } = await b.client.from("members").insert({ family_id: bFamily.id, owner_id: b.user.id, name: "X", relation: "other" });
  ok(!!bannedInsert, "banned account can't add family members");
  const bannedAnalyze = await call(b.token, "/api/analyze", { reportId: crypto.randomUUID() });
  ok(bannedAnalyze.status === 403, "banned account can't start an analysis", String(bannedAnalyze.status));
  await admin.auth.admin.updateUserById(b.user.id, { ban_duration: "876000h" });
  const banClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: banLogin } = await banClient.auth.signInWithPassword({ email: b.email, password: b.password });
  ok(!!banLogin && /banned/i.test(banLogin.message), "banned account can't sign in", banLogin?.message);

  // ---------- Events, push tokens, inbox ----------
  const { error: evErr } = await a.client.from("events").insert({ user_id: a.user.id, name: "app_open", platform: "ios" });
  ok(!evErr, "track event", evErr?.message);
  const { data: evRead } = await a.client.from("events").select("*");
  ok((evRead ?? []).length === 0, "events are write-only for the client");
  const { error: tokErr } = await a.client.from("push_tokens").upsert({ token: `ExponentPushToken[qa-${a.user.id.slice(0, 8)}]`, user_id: a.user.id, platform: "ios" });
  ok(!tokErr, "store push token", tokErr?.message);

  const { data: inboxRow } = await admin.from("inbox").insert({ user_id: a.user.id, title: "QA", body: "Inbox test", data: { route: "/upload" } }).select().single();
  const { data: myInbox } = await a.client.from("inbox").select("*");
  ok(myInbox?.length === 1, "inbox visible to the user");
  const { data: bInbox } = await b.client.from("inbox").select("*");
  ok((bInbox ?? []).length === 0, "inbox hidden from other users");
  const { error: readErr } = await a.client.from("inbox").update({ read_at: new Date().toISOString() }).eq("id", inboxRow.id);
  ok(!readErr, "mark notification as read");
  const { error: editInbox } = await a.client.from("inbox").update({ title: "hacked" }).eq("id", inboxRow.id);
  ok(!!editInbox, "client can't edit notification text");

  // ---------- Admin aggregates ----------
  const { data: totals, error: totErr } = await admin.rpc("admin_totals");
  ok(!totErr && totals?.length === 1, "admin totals function", totErr?.message);
  const { error: anonRpc } = await a.client.rpc("admin_totals");
  ok(!!anonRpc, "admin functions blocked for app users");

  // ---------- Delete member, then the account ----------
  const { error: delKid } = await a.client.from("members").delete().eq("id", kid.id);
  ok(!delKid, "delete member");
  const noAuthDel = await call(null, "/api/account", null, "DELETE");
  ok(noAuthDel.status === 401, "account deletion requires sign-in");
  const del = await call(a.token, "/api/account", null, "DELETE");
  ok(del.status === 200, "delete account", String(del.status));
  const { data: left } = await admin.from("profiles").select("id").eq("id", a.user.id);
  ok((left ?? []).length === 0, "profile removed with the account");
  const { data: leftMembers } = await admin.from("members").select("id").eq("owner_id", a.user.id);
  ok((leftMembers ?? []).length === 0, "family members removed with the account");
} catch (err) {
  failures++;
  console.error("ERROR", err);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
  process.exit(failures ? 1 : 0);
}
