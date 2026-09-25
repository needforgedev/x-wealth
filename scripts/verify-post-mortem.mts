/**
 * W7-13 — does the post-mortem hold up against a real model and a real window?
 *
 *   npm run verify-post-mortem
 *
 * Unit tests prove the gate refuses what it must refuse. This asks the
 * question they cannot: **given a genuinely completed forward test, does the
 * live model return an account that survives `validatePostMortem`?** A gate no
 * real output can pass is a different failure from no gate at all, and only
 * this script can tell the two apart.
 *
 * ## Where the completed test comes from
 *
 * Seeded with its window entirely inside loaded history (the same fixture as
 * `verify-forward-test`), advanced to COMPLETED by the real engine in one
 * pass, inside a transaction that is rolled back. Real trades, real
 * `final_results`, no permanent rows — the append-only ledger never sees the
 * fixture. The interaction log is bound to the same transaction, so the model
 * call is recorded the way production records it and vanishes with the rest.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const { forwardTests, paperTrades, strategies, strategyVersions, users } = await import("@/db/schema");
const { ENGINE_VERSION } = await import("@/domain/backtest");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const {
  POST_MORTEM_PROMPT_VERSION,
  buildPostMortemInput,
  validatePostMortem,
} = await import("@/domain/post-mortem");
const { FILL_MODEL } = await import("@/domain/session-step");
const { describeCondition, describeSizing, resolveDefinition, starterDefinition } =
  await import("@/domain/strategy");
const { interactionLog, runInteraction } = await import("@/server/ai");
const { advanceForwardTest } = await import("@/server/forward-test/advance");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");

if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "OPENROUTER_API_KEY is not set in .env.local, so this would test the stub.\n" +
      "The gate only means something against answers nobody scripted.",
  );
  process.exit(1);
}

const ROLLBACK = "ROLLBACK_ON_PURPOSE";

const definition = {
  ...starterDefinition(),
  universe: { instruments: ["NSE:RELIANCE", "NSE:TCS"], minAvgTurnoverPaise: null },
  sizing: { kind: "CAPITAL_PERCENT" as const, percent: 25 },
};
const costModel = nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: 0.05 });
const OPENED_ON = "2024-01-02";
const PLANNED_SESSIONS = 120;

const source = await liveEndOfDaySource();
let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

const [owner] = await db().select({ id: users.id }).from(users).limit(1);
if (!owner) {
  console.error("No user rows — cannot build a forward test to explain.");
  process.exit(1);
}
const ownerId = owner.id;

try {
  await db().transaction(async (tx) => {
    // --- a real window, run to completion by the real engine ---------------
    const [strategy] = await tx
      .insert(strategies)
      .values({ userId: ownerId, name: "post-mortem verification", segment: "EQUITY", timeframe: "1d" })
      .returning({ id: strategies.id });

    const [version] = await tx
      .insert(strategyVersions)
      .values({ strategyId: strategy.id, versionNo: 1, definition, hypothesisText: "verification" })
      .returning({ id: strategyVersions.id });

    const declaredHypothesis =
      "A 20/50 crossover on large caps produces more winners than losers over the window.";

    const [draft] = await tx
      .insert(forwardTests)
      .values({
        strategyVersionId: version.id,
        status: "DRAFT",
        declaredHypothesis,
        initialCapitalPaise: definition.initialCapitalPaise,
        costModel,
        engineVersion: ENGINE_VERSION,
        fillModel: FILL_MODEL,
        plannedSessions: PLANNED_SESSIONS,
      })
      .returning({ id: forwardTests.id });

    await tx
      .update(forwardTests)
      .set({
        status: "RUNNING",
        startedAt: new Date(`${OPENED_ON}T00:00:00Z`),
        plannedEndAt: new Date("2024-07-01T00:00:00Z"),
      })
      .where(eq(forwardTests.id, draft.id));

    const advanced = await advanceForwardTest({
      tx,
      test: {
        id: draft.id,
        startedAt: new Date(`${OPENED_ON}T00:00:00Z`),
        plannedSessions: PLANNED_SESSIONS,
        initialCapitalPaise: definition.initialCapitalPaise,
        costModel,
        engineVersion: ENGINE_VERSION,
        fillModel: FILL_MODEL,
      },
      definition: definition as never,
      source,
      recorded: [],
    });

    if (advanced.status !== "ADVANCED" || !advanced.completed) {
      throw new Error(`fixture window did not complete: ${JSON.stringify(advanced)}`);
    }

    const [test] = await tx.select().from(forwardTests).where(eq(forwardTests.id, draft.id));
    const trades = await tx
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.forwardTestId, draft.id))
      .orderBy(paperTrades.entryAt);

    console.log(
      `window completed: ${advanced.sessionsElapsed} sessions, ${trades.length} trades, ` +
        `net ${advanced.netReturnPercent >= 0 ? "+" : ""}${advanced.netReturnPercent.toFixed(2)}%\n`,
    );

    // --- the facts, exactly as the action assembles them -------------------
    const rules = resolveDefinition(definition);
    const results = test.finalResults as {
      netReturnPercent: number;
      maxDrawdownPercent: number;
      hitRatePercent: number;
      avgWinPaise: number;
      avgLossPaise: number;
      tradeCount: number;
      exposurePercent: number;
      sampleAdequate?: boolean;
    };

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const facts = {
      hypothesis: { declared: declaredHypothesis, declaredOn: iso(test.createdAt) },
      window: {
        startedOn: OPENED_ON,
        endedOn: iso(test.endedAt!),
        plannedSessions: PLANNED_SESSIONS,
        initialCapitalPaise: test.initialCapitalPaise,
      },
      rules: {
        entry: describeCondition(rules.entry),
        exit: describeCondition(rules.exit),
        stopLoss: `${rules.stopLossPercent}% below entry`,
        sizing: describeSizing(rules.sizing),
        instruments: rules.instruments,
        timeframe: "DAILY",
      },
      outcome: {
        netReturnPercent: results.netReturnPercent,
        tradeCount: results.tradeCount,
        hitRatePercent: results.hitRatePercent,
        maxDrawdownPercent: results.maxDrawdownPercent,
        avgWinPaise: results.avgWinPaise,
        avgLossPaise: results.avgLossPaise,
        exposurePercent: results.exposurePercent,
        sampleAdequate: results.sampleAdequate ?? false,
      },
      trades: trades.map((t) => ({
        symbol: t.symbol,
        entryDate: iso(t.entryAt),
        entryPrice: t.entryPrice,
        exitDate: t.exitAt ? iso(t.exitAt) : null,
        exitPrice: t.exitPrice,
        netPnlPaise: t.netPnlPaise,
      })),
      costs: { segment: costModel.segment, slippagePercent: costModel.slippagePercent },
      backtest: null,
    };

    // --- the live model, logged into the same rolled-back transaction ------
    const logged = await runInteraction({
      userId: ownerId,
      contextType: "POST_MORTEM",
      promptVersion: POST_MORTEM_PROMPT_VERSION,
      input: buildPostMortemInput(facts),
      subject: { forwardTestId: draft.id, strategyVersionId: version.id },
      log: interactionLog(tx),
    });

    console.log(`model: ${logged.modelId}\n`);

    const gated = validatePostMortem(logged.output, { tradeCount: results.tradeCount });
    check(gated.status === "VALID", "the live answer passes the no-verdict gate");
    if (gated.status !== "VALID") {
      for (const issue of gated.issues) console.log(`         ${issue.path}: ${issue.message}`);
      throw new Error(ROLLBACK);
    }

    const view = gated.view;
    check(
      ["SUPPORTED", "NOT_SUPPORTED", "UNTESTED"].includes(view.status),
      "hypothesis status is one of the three honest answers",
      view.status,
    );
    check(view.findings.length >= 1, "at least one evidenced finding", `${view.findings.length}`);

    console.log(`\n  hypothesis · ${view.status}`);
    console.log(`  ${view.observed}\n`);
    for (const f of view.findings) {
      console.log(`  – ${f.observation}`);
      console.log(`    (${f.evidence})`);
    }
    console.log(`\n  ${view.summary}`);
    for (const q of view.unanswered) console.log(`  unanswered: ${q}`);
    console.log();

    throw new Error(ROLLBACK);
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
}

const [remaining] = await db()
  .select({ id: forwardTests.id })
  .from(forwardTests)
  .limit(1);
console.log(
  `rolled back — forward_tests holds ${remaining ? "only pre-existing" : "no"} rows, nothing written`,
);

console.log(
  failures === 0
    ? "✓ the post-mortem reads a real record, and the gate accepts what the model wrote"
    : `✗ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
