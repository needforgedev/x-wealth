/**
 * W6-03 — prove the parameter freeze, against the real database.
 *
 *   npm run verify-freeze
 *
 * `x-wealth-product.md` §5.2 requires the freeze to be enforced "at the DB
 * level (constraint or trigger), not in application logic". A test that goes
 * through a server action proves nothing about that — it proves the server
 * action behaves, which was never in doubt. So this connects with raw SQL and
 * attacks the table directly, the way a careless migration, a psql session or a
 * future developer with a "quick fix" would.
 *
 * Every attack below must be refused by Postgres. If any of them succeeds, the
 * central invariant of the product is not actually enforced and a forward test
 * could be edited mid-flight — which would make every published number
 * meaningless without anyone being able to tell.
 *
 * Runs entirely inside a transaction that is rolled back, so it writes nothing
 * to the append-only tables it is testing.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set in .env.local (session pooler, port 5432).");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 30 });

type Attack = { name: string; run: (tx: postgres.TransactionSql, ids: Ids) => Promise<unknown> };
type Ids = { testId: string; otherVersionId: string; openTradeId: string; closedTradeId: string };

/**
 * Each of these is something the product forbids. The trigger must raise; a
 * silent success is the failure.
 */
const ATTACKS: Attack[] = [
  {
    name: "repoint a RUNNING test at a different strategy version",
    run: (tx, ids) =>
      tx`update forward_tests set strategy_version_id = ${ids.otherVersionId} where id = ${ids.testId}`,
  },
  {
    name: "change the capital of a RUNNING test",
    run: (tx, ids) =>
      tx`update forward_tests set initial_capital_paise = 999999 where id = ${ids.testId}`,
  },
  {
    name: "shorten the window of a RUNNING test",
    run: (tx, ids) => tx`update forward_tests set planned_sessions = 1 where id = ${ids.testId}`,
  },
  {
    name: "rewrite the declared hypothesis after the fact",
    run: (tx, ids) =>
      tx`update forward_tests set declared_hypothesis = 'a better story' where id = ${ids.testId}`,
  },
  {
    // `now() + interval`, not `now()`. Postgres freezes `now()` at the start of
    // the transaction, so `set started_at = now()` inside the transaction that
    // inserted the row is a no-op — the trigger sees no change and correctly
    // permits it. That read as a hole in the freeze on the first run; it was a
    // hole in the attack.
    name: "move the start date of a RUNNING test",
    run: (tx, ids) =>
      tx`update forward_tests set started_at = now() - interval '10 days' where id = ${ids.testId}`,
  },
  {
    name: "push out the planned end of a RUNNING test",
    run: (tx, ids) =>
      tx`update forward_tests set planned_end_at = now() + interval '200 days' where id = ${ids.testId}`,
  },
  {
    name: "swap the cost model of a RUNNING test",
    run: (tx, ids) =>
      tx`update forward_tests set cost_model = '{"segment":"FREE"}'::jsonb where id = ${ids.testId}`,
  },
  {
    name: "walk a RUNNING test back to DRAFT",
    run: (tx, ids) => tx`update forward_tests set status = 'DRAFT' where id = ${ids.testId}`,
  },
  {
    name: "delete a forward test outright",
    run: (tx, ids) => tx`delete from forward_tests where id = ${ids.testId}`,
  },
  {
    name: "change the entry price of a recorded trade",
    run: (tx, ids) => tx`update paper_trades set entry_price = 1 where id = ${ids.openTradeId}`,
  },
  {
    name: "change the quantity of a recorded trade",
    run: (tx, ids) => tx`update paper_trades set qty = 1 where id = ${ids.openTradeId}`,
  },
  {
    name: "overwrite the exit of an already-closed trade",
    run: (tx, ids) =>
      tx`update paper_trades set exit_price = 9999 where id = ${ids.closedTradeId}`,
  },
  {
    name: "delete a recorded trade",
    run: (tx, ids) => tx`delete from paper_trades where id = ${ids.openTradeId}`,
  },
  {
    name: "record a gross P&L with no costs beside it",
    run: (tx, ids) =>
      tx`update paper_trades set exit_at = now(), exit_price = 120, gross_pnl_paise = 100000
         where id = ${ids.openTradeId}`,
  },
];

/** The one thing that must be *permitted*: closing an open trade, once. */
const PERMITTED = {
  name: "close an open trade with a complete result",
  run: (tx: postgres.TransactionSql, ids: Ids) =>
    tx`update paper_trades
         set exit_at = now(), exit_price = 120, gross_pnl_paise = 100000,
             costs_breakdown = '{"totalPaise":2000}'::jsonb, net_pnl_paise = 98000
       where id = ${ids.openTradeId}`,
};

let refused = 0;
let allowed = 0;

try {
  // `users`, not `advisors`. The two-persona tables were collapsed into one in
  // migration 0010 (W24), and this script kept naming the old one — so it has
  // been dying on setup, before landing a single attack, since 27 Aug 2026.
  // Nothing caught it because CI runs typecheck, lint, tests, build and
  // `verify_invariants.sql`, and none of the four `verify-*` scripts.
  const [user] = await sql`select id from users limit 1`;
  if (!user) {
    console.error("No user rows — cannot build a forward test to attack.");
    process.exit(1);
  }

  await sql
    .begin(async (tx) => {
      // --- a RUNNING forward test with one open and one closed trade --------
      const [strategy] = await tx`
        insert into strategies (user_id, name, segment, timeframe)
        values (${user.id}, 'freeze verification', 'EQUITY', '1d') returning id`;

      /**
       * `sql.json`, not `JSON.stringify`.
       *
       * postgres.js binds a JS string as text, so `${JSON.stringify(obj)}::jsonb`
       * casts a *string* into jsonb and stores a jsonb string — `"{\"version\":1}"`
       * rather than `{"version": 1}`. That was harmless until `0011` added
       * `strategy_versions_definition_complete`, whose first test is
       * `jsonb_typeof(definition) = 'object'`. It fails, correctly, and the
       * constraint is the only reason anyone found out.
       */
      const definition = sql.json({
        version: 1,
        instruments: ["NSE:RELIANCE"],
        timeframe: "1d",
        entry: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 1 } },
        exit: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 1 } },
        stopLossPercent: 5,
        positionSizePercent: 25,
        initialCapitalPaise: 10_000_000,
      });
      const [v1] = await tx`
        insert into strategy_versions (strategy_id, version_no, definition)
        values (${strategy.id}, 1, ${definition}) returning id`;
      const [v2] = await tx`
        insert into strategy_versions (strategy_id, version_no, definition)
        values (${strategy.id}, 2, ${definition}) returning id`;

      const [test] = await tx`
        insert into forward_tests
          (strategy_version_id, status, declared_hypothesis, initial_capital_paise,
           cost_model, planned_sessions, started_at, planned_end_at)
        values (${v1.id}, 'RUNNING', 'Oversold readings revert within fifteen sessions.',
                50000000, '{"segment":"NSE_EQUITY_DELIVERY"}'::jsonb, 60, now(), now() + interval '90 days')
        returning id`;

      const [openTrade] = await tx`
        insert into paper_trades (forward_test_id, symbol, side, qty, entry_price, entry_at)
        values (${test.id}, 'NSE:RELIANCE', 'BUY', 100, 1300.00, now()) returning id`;

      const [closedTrade] = await tx`
        insert into paper_trades
          (forward_test_id, symbol, side, qty, entry_price, entry_at,
           exit_price, exit_at, gross_pnl_paise, costs_breakdown, net_pnl_paise)
        values (${test.id}, 'NSE:TCS', 'BUY', 50, 2300.00, now(),
                2400.00, now(), 500000, '{"totalPaise":3000}'::jsonb, 497000)
        returning id`;

      const ids: Ids = {
        testId: test.id,
        otherVersionId: v2.id,
        openTradeId: openTrade.id,
        closedTradeId: closedTrade.id,
      };

      console.log("attacking the freeze directly with SQL — every one must be refused\n");

      for (const attack of ATTACKS) {
        // A savepoint per attack: a refused statement aborts the surrounding
        // transaction otherwise, and the remaining attacks would all "fail"
        // for the wrong reason.
        try {
          await tx.savepoint(async (sp) => {
            await attack.run(sp as postgres.TransactionSql, ids);
          });
          allowed++;
          console.log(`  ALLOWED  ${attack.name}   <-- INVARIANT NOT ENFORCED`);
        } catch (error) {
          refused++;
          const message = String((error as Error).message).split("\n")[0];
          console.log(`  refused  ${attack.name}`);
          console.log(`           ${message.slice(0, 96)}`);
        }
      }

      console.log("\nand the one transition that must be permitted:");
      try {
        await tx.savepoint(async (sp) => {
          await PERMITTED.run(sp as postgres.TransactionSql, ids);
        });
        console.log(`  allowed  ${PERMITTED.name}`);
      } catch (error) {
        allowed++; // counts as a failure of a different kind
        console.log(`  REFUSED  ${PERMITTED.name}   <-- a live test could never close a trade`);
        console.log(`           ${String((error as Error).message).split("\n")[0].slice(0, 96)}`);
      }

      throw new Error("ROLLBACK_ON_PURPOSE");
    })
    .catch((error: Error) => {
      if (error.message !== "ROLLBACK_ON_PURPOSE") throw error;
    });

  console.log(`\nrolled back — nothing written to the append-only tables`);
  console.log(
    allowed === 0
      ? `✓ ${refused} of ${ATTACKS.length} attacks refused by the database. §5.2 is enforced where it claims to be.`
      : `✗ ${allowed} attack(s) succeeded. The freeze is not enforced at the database level.`,
  );
} finally {
  await sql.end();
}

process.exit(allowed === 0 ? 0 : 1);
