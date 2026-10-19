// Applies every SQL file in ./migrations in name order, once.
// Reads DATABASE_URL from ./.env (not committed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv(path.join(here, ".env"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Put it in supabase/.env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())`);
await client.query(`alter table public._migrations enable row level security`);

const dir = path.join(here, "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const done = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));

for (const file of files) {
  if (done.has(file) && !process.argv.includes("--force")) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1) on conflict (name) do update set applied_at = now()", [file]);
    await client.query("commit");
    console.log(`apply ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`fail  ${file}: ${err.message}`);
    process.exit(1);
  }
}

await client.end();
