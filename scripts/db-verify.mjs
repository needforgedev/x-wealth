/**
 * Run `drizzle/verify_invariants.sql` against a live database and report.
 *
 * CI uses psql for this (see .github/workflows/ci.yml). This exists because a
 * working psql is not a given on every machine, and because it also prints an
 * inventory of what actually landed — tables, triggers, constraints — which is
 * what you want to see the first time you point it at a real project.
 *
 *   node scripts/db-verify.mjs            # inventory + verify
 *   node scripts/db-verify.mjs --inventory-only
 *
 * Connects with DIRECT_URL. The suite runs inside a transaction that rolls
 * back, so it is safe against a populated database.
 */
import { readFileSync } from "node:fs";

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set. Fill it in .env.local (Dashboard → Connect → Session pooler).");
  process.exit(1);
}

const inventoryOnly = process.argv.includes("--inventory-only");
const redacted = url.replace(/:[^:@]+@/, ":****@");

const sql = postgres(url, { ssl: "require", prepare: false, max: 1, idle_timeout: 10 });

/** psql meta-commands (\echo) are not SQL; strip them for the driver. */
function stripMeta(text) {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("\\"))
    .join("\n");
}

let failed = false;

try {
  console.log(`connected: ${redacted}`);
  const [{ version }] = await sql`select version()`;
  console.log(`server:    ${version.split(" on ")[0]}`);

  const [{ current_user: user, current_database: db }] =
    await sql`select current_user, current_database()`;
  console.log(`user:      ${user} · db: ${db}\n`);

  // --- inventory ----------------------------------------------------------
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`;
  const triggers = await sql`
    select tgname, relname from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
    order by relname, tgname`;
  const checks = await sql`
    select conname from pg_constraint
    where contype = 'c' and connamespace = 'public'::regnamespace`;
  const enums = await sql`
    select typname from pg_type where typtype = 'e' and typnamespace = 'public'::regnamespace`;

  console.log(`tables: ${tables.length} · enums: ${enums.length} · triggers: ${triggers.length} · check constraints: ${checks.length}`);
  if (tables.length) console.log(`  ${tables.map((t) => t.table_name).join(", ")}`);
  if (triggers.length) {
    console.log("  triggers:");
    for (const t of triggers) console.log(`    ${t.relname}.${t.tgname}`);
  }

  if (inventoryOnly) {
    await sql.end({ timeout: 5 });
    process.exit(0);
  }

  if (tables.length === 0) {
    console.log("\nNothing to verify — no tables. Run `npm run db:migrate` first.");
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  // --- the full suite, as the connecting role ------------------------------
  const suite = stripMeta(readFileSync("drizzle/verify_invariants.sql", "utf8"));
  try {
    await sql.unsafe(suite);
    console.log(`\n✓ invariants hold as ${user}`);
  } catch (error) {
    failed = true;
    console.log(`\n✗ INVARIANTS FAILED as ${user}`);
    console.log(`  ${String(error.message).split("\n")[0]}`);
  }

  // --- the same claim, under service_role ----------------------------------
  //
  // service_role bypasses RLS, so this is the run that matters. It cannot be
  // the whole suite: on Supabase service_role has no INSERT on `auth.users`,
  // so it cannot create its own fixtures and the suite dies on setup rather
  // than on an invariant.
  //
  // Instead the fixtures are created by the connecting role, then `SET LOCAL
  // ROLE` switches inside the transaction and the mutations are attempted from
  // there. Each attempt sits in its own savepoint, because one error aborts a
  // Postgres transaction and everything after it would fail for the wrong
  // reason. The whole thing rolls back.
  const F = "ffffffff-0000-0000-0000-0000000000ff";
  const mutations = [
    ["UPDATE strategy_versions", `update strategy_versions set definition = '{"x":1}'::jsonb`],
    ["DELETE strategy_versions", `delete from strategy_versions`],
    ["UPDATE backtest_runs", `update backtest_runs set results = '{"x":1}'::jsonb`],
    ["DELETE forward_tests", `delete from forward_tests`],
    ["UPDATE a frozen forward test", `update forward_tests set declared_hypothesis = 'reworded'`],
    ["DELETE paper_trades", `delete from paper_trades`],
    ["UPDATE paper_trades entry", `update paper_trades set entry_price = 1.0`],
  ];

  class Rollback extends Error {}
  const outcomes = [];

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`
        insert into auth.users(id) values ('${F}') on conflict do nothing;
        insert into users(id, auth_user_id, contact_name)
          values ('${F}', '${F}', 'service-role check');
        insert into strategies(id, user_id, name, segment, timeframe)
          values ('${F}', '${F}', 'check', 'EQUITY', '1d');
        insert into strategy_versions(id, strategy_id, version_no, definition)
          values ('${F}', '${F}', 1, '{"version": 1, "instruments": ["NSE:RELIANCE"], "timeframe": "1d", "entry": {"left": {"kind": "PRICE"}, "comparator": "ABOVE", "right": {"kind": "CONSTANT", "value": 1}}, "exit": {"left": {"kind": "PRICE"}, "comparator": "BELOW", "right": {"kind": "CONSTANT", "value": 1}}, "stopLossPercent": 5, "positionSizePercent": 25, "initialCapitalPaise": 10000000}'::jsonb);
        insert into backtest_runs(id, strategy_version_id, period_start, period_end,
                                  initial_capital_paise, cost_model, results, methodology)
          values ('${F}', '${F}', '2020-01-01', '2024-01-01', 10000000,
                  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);
        insert into forward_tests(id, strategy_version_id, declared_hypothesis,
                                  initial_capital_paise, cost_model, planned_sessions,
                                  status, started_at)
          values ('${F}', '${F}', 'h', 10000000, '{}'::jsonb, 60, 'RUNNING', now());
        insert into paper_trades(id, forward_test_id, symbol, side, qty, entry_price, entry_at)
          values ('${F}', '${F}', 'NSE:RELIANCE', 'BUY', 10, 2500.0000, now());
      `);

      await tx.unsafe("set local role service_role");
      const [{ current_user: actingAs }] = await tx`select current_user`;
      outcomes.push(["__role", actingAs]);

      for (const [label, stmt] of mutations) {
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(stmt);
          });
          outcomes.push([label, false]); // succeeded — invariant broken
        } catch {
          outcomes.push([label, true]); // rejected — as required
        }
      }

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      failed = true;
      console.log(`\n✗ service_role check could not run: ${String(error.message).split("\n")[0]}`);
    }
  }

  const acting = outcomes.find(([k]) => k === "__role")?.[1];
  if (acting) {
    console.log(`\nacting as: ${acting}`);
    if (acting !== "service_role") {
      failed = true;
      console.log("✗ SET LOCAL ROLE did not take effect — this check proves nothing");
    }
    for (const [label, blocked] of outcomes.filter(([k]) => k !== "__role")) {
      console.log(`  ${blocked ? "blocked  " : "✗ ALLOWED"} ${label}`);
      if (!blocked) failed = true;
    }
    const allBlocked = outcomes.filter(([k]) => k !== "__role").every(([, b]) => b);
    if (allBlocked && acting === "service_role") {
      console.log("✓ append-only holds under service_role — triggers, not RLS, are doing it");
    }
  }

  // The function returns void and RAISEs on violation, so "no exception" is
  // the pass condition. Do not test its return value — void is not null.
  try {
    await sql`select assert_no_soft_delete_columns()`;
    console.log("✓ no soft-delete columns on append-only tables");
  } catch (error) {
    failed = true;
    console.log(`✗ soft-delete check failed: ${String(error.message).split("\n")[0]}`);
  }
} catch (error) {
  failed = true;
  console.error("\nERROR:", error.message);
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(failed ? 1 : 0);
