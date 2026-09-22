/**
 * The iteration ledger, against the live database. `plan.md` W8-05.
 *
 * > **W8-05** Test asserting an abandoned test is reachable from the profile.
 *
 * That assertion cannot live in a unit test, because the thing it guards is not
 * a function — it is that **no layer between the database and the screen drops
 * an abandoned window**. A query gaining a `status = 'COMPLETED'` predicate, a
 * mapper filtering nulls, a page slicing to the most recent few: each would
 * pass every existing test and quietly produce the flattering record.
 *
 * So this walks the real path — insert an abandoned test, read it back through
 * the same functions the page calls, and assert it is there and carries its
 * reason. Everything runs inside a transaction that rolls back.
 *
 *   npm run verify-ledger
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { and, eq, sql } = await import("drizzle-orm");
const { db } = await import("@/db");
const { forwardTests, strategies, strategyVersions, users } = await import("@/db/schema");
const { ledgerCounts, ledgerForwardTests } = await import("@/server/queries/ledger");

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

/**
 * A minimal account, for a database that has none.
 *
 * `users.auth_user_id` is NOT NULL and references `auth.users` — a table
 * Supabase owns and our migrations deliberately do not create — so the row has
 * to be placed there first. Only `id` is set: every other column is nullable or
 * defaulted on both Supabase and the CI stub, and naming more of them would
 * couple this fixture to a table we do not control.
 */
async function seedOwner(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]) {
  const [authUser] = await tx.execute<{ id: string }>(
    sql`insert into auth.users (id) values (gen_random_uuid()) returning id`,
  );
  const [owner] = await tx
    .insert(users)
    .values({ authUserId: authUser.id })
    .returning({ id: users.id });
  return owner;
}

const DEFINITION = {
  version: 1,
  instruments: ["NSE:RELIANCE"],
  timeframe: "1d",
  entry: { left: { kind: "PRICE" }, comparator: "ABOVE", right: { kind: "CONSTANT", value: 1 } },
  exit: { left: { kind: "PRICE" }, comparator: "BELOW", right: { kind: "CONSTANT", value: 1 } },
  stopLossPercent: 5,
  positionSizePercent: 25,
  initialCapitalPaise: 10_000_000,
};

class Rollback extends Error {}

/**
 * How many accounts existed before any of this ran.
 *
 * Read outside the transaction on purpose: it is the baseline the rollback is
 * measured against, and on an empty database the fixture account is created
 * inside the transaction, so this is what proves the rollback took it away too.
 */
const [{ count: usersAtStart }] = await db().execute<{ count: number }>(
  sql`select count(*)::int as count from users`,
);

/**
 * Assigned inside the transaction, read after it. Both are needed once the
 * transaction has rolled back, and neither can be resolved before it opens —
 * the account may not exist yet.
 */
let owner: { id: string } | undefined;
let before: Awaited<ReturnType<typeof ledgerCounts>> | undefined;

try {
  await db().transaction(async (tx) => {
    /**
     * An existing account if there is one, a fixture account if there is not.
     *
     * Both the owner lookup and the baseline counts moved inside the
     * transaction so that this runs against an empty database as well as a
     * populated one — which is what lets CI prove it (W5-16). Requiring a
     * pre-existing user meant the ledger could only be verified by hand against
     * the live project, and a guarantee proven only by hand is proven only as
     * recently as someone last remembered to prove it.
     *
     * The baseline is read through `tx` for the same reason the assertions are:
     * both must see the same rows, and a second connection would not see the
     * seed at all.
     */
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    owner = existing ?? (await seedOwner(tx));

    before = await ledgerCounts(owner.id, tx);
    console.log(
      `\nledger for ${existing ? "an existing" : "a seeded"} account · ` +
        `${before.strategies} strategies, ${before.forwardTestsStarted} forward tests ` +
        `(${before.running} live, ${before.completed} completed, ${before.abandoned} abandoned)\n`,
    );

    const [strategy] = await tx
      .insert(strategies)
      .values({
        userId: owner.id,
        name: "ledger verification",
        segment: "EQUITY",
        timeframe: "1d",
      })
      .returning({ id: strategies.id });

    const [version] = await tx
      .insert(strategyVersions)
      .values({ strategyId: strategy.id, versionNo: 1, definition: DEFINITION as never })
      .returning({ id: strategyVersions.id });

    // Three windows on one strategy: one abandoned, one completed, one running.
    // The abandoned one is the point; the others are there so a filter that
    // dropped it would still leave a plausible-looking list.
    const [abandoned] = await tx
      .insert(forwardTests)
      .values({
        strategyVersionId: version.id,
        declaredHypothesis: "I expect four to six trades, most of them small losses.",
        initialCapitalPaise: 10_000_000,
        costModel: {} as never,
        plannedSessions: 60,
        status: "DRAFT",
      })
      .returning({ id: forwardTests.id });

    const [completed] = await tx
      .insert(forwardTests)
      .values({
        strategyVersionId: version.id,
        declaredHypothesis: "I expect the edge to hold through a quiet quarter.",
        initialCapitalPaise: 10_000_000,
        costModel: {} as never,
        plannedSessions: 60,
        status: "DRAFT",
      })
      .returning({ id: forwardTests.id });

    await tx
      .insert(forwardTests)
      .values({
        strategyVersionId: version.id,
        declaredHypothesis: "I expect this one to still be running when it is read.",
        initialCapitalPaise: 10_000_000,
        costModel: {} as never,
        plannedSessions: 60,
        status: "DRAFT",
      });

    // Drive them through the real lifecycle, which the triggers police.
    await tx
      .update(forwardTests)
      .set({ status: "RUNNING", startedAt: new Date(Date.now() - 10 * 86_400_000) })
      .where(eq(forwardTests.strategyVersionId, version.id));

    await tx
      .update(forwardTests)
      .set({
        status: "ABANDONED",
        outcome: "ABANDONED",
        endedAt: new Date(),
        abandonReason: "The entry rule fired far less often than the backtest implied.",
      })
      .where(and(eq(forwardTests.id, abandoned.id)));

    await tx
      .update(forwardTests)
      .set({
        status: "COMPLETED",
        outcome: "COMPLETED",
        endedAt: new Date(),
        finalResults: { netReturnPercent: -4.71, tradeCount: 15 } as never,
      })
      .where(eq(forwardTests.id, completed.id));

    // --- read it back the way the page does --------------------------------

    // Read through the transaction, so the rows above are visible.
    const counts = await ledgerCounts(owner.id, tx);
    const listed = await ledgerForwardTests(owner.id, tx);

    check(
      counts.forwardTestsStarted === before.forwardTestsStarted + 3,
      "every window started is counted",
      `${before.forwardTestsStarted} → ${counts.forwardTestsStarted}`,
    );
    check(
      counts.abandoned === before.abandoned + 1,
      "the abandoned one is counted",
      `${counts.abandoned} abandoned`,
    );
    check(
      counts.completed === before.completed + 1 && counts.running === before.running + 1,
      "completed and running are counted separately",
    );

    const row = listed.find((t) => t.id === abandoned.id);
    check(Boolean(row), "the abandoned test is reachable in the list");
    check(row?.status === "ABANDONED", "it is listed as abandoned, not omitted");
    check(
      Boolean(row?.abandonReason?.includes("far less often")),
      "it carries the reason it was stopped",
    );
    check(
      Boolean(row?.declaredHypothesis?.includes("small losses")),
      "it still carries the hypothesis declared before any result existed",
    );

    // W8-07 — the trap. A running window has two net-return figures and only
    // `standing` may be shown; `metrics` values open positions without paying
    // their exit charges. The ledger must not reach for either.
    const running = listed.find((t) => t.status === "RUNNING");
    check(
      running !== undefined && running.finalResults === null,
      "a running test carries no settled figure (W8-07)",
    );
    const done = listed.find((t) => t.id === completed.id);
    check(
      done?.finalResults !== null && done?.finalResults !== undefined,
      "a completed test reads its settled final_results",
    );

    // W8-04 — the guarantee is the absence of the parameter, so assert the
    // shape of the function rather than trusting the caller.
    check(
      ledgerForwardTests.length === 1 && ledgerCounts.length === 1,
      "the reads take a user id and nothing that could filter",
      `${ledgerForwardTests.length} argument(s)`,
    );

    throw new Rollback();
  });
} catch (error) {
  if (!(error instanceof Rollback)) {
    console.error(`\n✗ could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (!owner || !before) {
  console.error("\n✗ the fixture never opened — nothing was verified");
  process.exit(1);
}

const after = await ledgerCounts(owner.id);
check(
  after.forwardTestsStarted === before.forwardTestsStarted,
  "rolled back — the account's real record is untouched",
  `${after.forwardTestsStarted} forward tests`,
);

/**
 * `ledgerCounts` alone does not prove the rollback on an empty database: it is
 * scoped to one user id, so a fixture account that survived would simply report
 * zero windows and read as a pass. Counting the table catches that.
 */
const [{ count: usersNow }] = await db().execute<{ count: number }>(
  sql`select count(*)::int as count from users`,
);
check(
  usersNow === usersAtStart,
  "rolled back — no fixture account survived",
  `${usersNow} account(s)`,
);

console.log(
  failures === 0
    ? "\n✓ an abandoned window is counted, listed and carries its reason"
    : `\n✗ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
