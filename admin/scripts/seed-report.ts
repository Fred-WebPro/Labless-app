// Uploads a lab report file for a given account's self member and runs the real pipeline.
// Usage: npx tsx scripts/seed-report.ts <email> <file>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  const [email, file] = process.argv.slice(2);
  const { adminDb } = await import("../lib/supabase");
  const { runAnalysis } = await import("../lib/analysis/pipeline");
  const db = adminDb();

  // `--rerun <reportId>` re-reads an existing report with the current pipeline.
  if (email === "--rerun") {
    const started = Date.now();
    await runAnalysis(file);
    const { data: report } = await db.from("reports").select("status, error").eq("id", file).single();
    console.log(file, report?.status, report?.error ?? "", `${Math.round((Date.now() - started) / 1000)}s`);
    return;
  }

  const { data: profile } = await db.from("profiles").select("id").eq("email", email.toLowerCase()).single();
  if (!profile) throw new Error("no such account");
  const { data: member } = await db.from("members").select("id").eq("owner_id", profile.id).eq("is_self", true).single();
  if (!member) throw new Error("account has no self member");

  const isPdf = file.toLowerCase().endsWith(".pdf");
  const reportId = crypto.randomUUID();
  const filePath = `${profile.id}/${reportId}/01.${isPdf ? "pdf" : "jpg"}`;
  const type = isPdf ? "application/pdf" : "image/jpeg";
  const { error } = await db.storage.from("reports").upload(filePath, fs.readFileSync(file), { contentType: type });
  if (error) throw error;
  await db.from("reports").insert({ id: reportId, owner_id: profile.id, member_id: member.id, status: "uploaded", files: [{ path: filePath, type }] });
  const started = Date.now();
  await runAnalysis(reportId);
  const { data: report } = await db.from("reports").select("status, error").eq("id", reportId).single();
  console.log(reportId, report?.status, report?.error ?? "", `${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
