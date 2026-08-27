/**
 * Apply pending migrations from `drizzle/`.
 *
 * Uses drizzle-orm's migrator over postgres.js rather than the `drizzle-kit
 * migrate` CLI. Same folder, same `meta/_journal.json`, same bookkeeping table
 * — but the CLI swallows connection errors and exits 0 having done nothing,
 * which is a bad property for the one command that changes your database.
 *
 * Connects with DIRECT_URL (session pooler, 5432). DDL does not belong on the
 * transaction pooler.
 *
 *   node scripts/db-migrate.mjs
 */
import { readdirSync, readFileSync } from "node:fs";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set — fill it in .env.local (session pooler, port 5432).");
  process.exit(1);
}

if (url.includes(":6543/")) {
  console.error(
    "DIRECT_URL points at port 6543 (transaction pooler). Migrations issue DDL and\n" +
      "need the session pooler on 5432, or SET/advisory-lock behaviour is unreliable.",
  );
  process.exit(1);
}

console.log(`connecting: ${url.replace(/:[^:@]+@/, ":****@")}`);

// max: 1 — migrations must run in order on a single connection.
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 30 });

/**
 * Refuse to run if a numbered migration on disk is missing from the journal.
 *
 * `migrate()` reads `meta/_journal.json`, not the folder. A hand-written
 * `.sql` file that nobody added to the journal is therefore skipped in
 * silence — and the run still ends with "✓ migrations applied", because from
 * the migrator's point of view there was nothing pending.
 *
 * That is the same failure this script was written to replace: `drizzle-kit
 * migrate` exiting 0 having done nothing. It bit again on `0009`, which
 * reported success while all seven tables it drops were still standing.
 *
 * Hand-written DDL is not an edge case here — triggers, grants and drops
 * cannot be generated, so `0001` and `0009` are both hand-authored and both
 * have to be journalled by hand. Catching the omission is cheap; discovering
 * it by querying the database afterwards is not.
 */
function assertJournalCoversFolder() {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
  const journalled = new Set(journal.entries.map((e) => e.tag));

  const onDisk = readdirSync("./drizzle")
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ""));

  const missing = onDisk.filter((tag) => !journalled.has(tag));
  if (missing.length > 0) {
    console.error(
      `\n✗ ${missing.length} migration(s) on disk are not in meta/_journal.json:\n` +
        missing.map((m) => `    ${m}.sql`).join("\n") +
        "\n\n  They would be skipped silently. Add an entry for each — idx, version" +
        '\n  "7", a `when` timestamp in ms, the tag, and breakpoints: true.\n',
    );
    process.exit(1);
  }
}

assertJournalCoversFolder();

try {
  const before = await sql`
    select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
  console.log(`public tables before: ${before[0].n}`);

  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

  const after = await sql`
    select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
  const applied = await sql`
    select hash, created_at from drizzle."__drizzle_migrations" order by created_at`;

  console.log(`public tables after:  ${after[0].n}`);
  console.log(`migrations recorded:  ${applied.length}`);
  console.log("\n✓ migrations applied");
} catch (error) {
  console.error("\n✗ migration failed");
  console.error(`  ${error.message}`);
  if (error.position) console.error(`  at character ${error.position}`);
  if (error.detail) console.error(`  detail: ${error.detail}`);
  if (error.hint) console.error(`  hint: ${error.hint}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
