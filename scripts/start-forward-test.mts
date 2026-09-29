/**
 * Start a real, locked forward test from the command line. `plan.md` W6-15.
 *
 *   npx tsx scripts/start-forward-test.mts <strategyVersionId> <sessions> "<hypothesis>"
 *
 * This is the one place the app is driven without the browser, and it exists
 * because W6-15 is a *scheduling* decision, not a feature: the 60-session clock
 * only starts when a genuine, locked test starts, and every day it waits pushes
 * N6 out for no engineering reason.
 *
 * It replicates `startForwardTest` (`src/server/actions/forward-test.ts`) exactly
 * — same next-session opening, same cost model, same engine pin, same freeze —
 * by importing the same helpers and constants rather than re-deriving any of
 * them, so a test started here is indistinguishable from one started in the UI.
 * The window opens on the session *after* the newest loaded bar, so no part of
 * it was knowable when the parameters froze.
 *
 * **It writes a permanent, append-only row.** A forward test can be abandoned
 * but never deleted. Run it deliberately.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const { eq } = await import("drizzle-orm");
const { db } = await import("@/db");
const { forwardTests, strategies, strategyVersions } = await import("@/db/schema");
const { ENGINE_VERSION } = await import("@/domain/backtest");
const { ZERO_BROKERAGE, nseEquityDelivery } = await import("@/domain/costs");
const { SESSION_WINDOW } = await import("@/domain/forward-test");
const { NSE_CALENDAR, addSessions } = await import("@/domain/session");
const { FILL_MODEL } = await import("@/domain/session-step");
const { resolveDefinition } = await import("@/domain/strategy");
const { toSymbol } = await import("@/domain/symbol");
const { liveEndOfDaySource } = await import("@/server/market-data/db-store");

// The action's own value — repeated here from the same source of truth.
const SLIPPAGE_PERCENT = 0.05;

const [versionId, sessionsArg, ...hypothesisParts] = process.argv.slice(2);
const plannedSessions = Number(sessionsArg);
const hypothesis = hypothesisParts.join(" ").trim();

if (!versionId || !Number.isInteger(plannedSessions) || hypothesis.length < 30) {
  console.error(
    'usage: start-forward-test.mts <versionId> <sessions> "<hypothesis (>=30 chars)>"',
  );
  process.exit(1);
}
if (plannedSessions < SESSION_WINDOW.min || plannedSessions > SESSION_WINDOW.max) {
  console.error(`sessions must be between ${SESSION_WINDOW.min} and ${SESSION_WINDOW.max}.`);
  process.exit(1);
}

const [row] = await db()
  .select({
    versionId: strategyVersions.id,
    definition: strategyVersions.definition,
    strategyId: strategies.id,
    strategyName: strategies.name,
    versionNo: strategyVersions.versionNo,
    ownerId: strategies.userId,
  })
  .from(strategyVersions)
  .innerJoin(strategies, eq(strategies.id, strategyVersions.strategyId))
  .where(eq(strategyVersions.id, versionId))
  .limit(1);

if (!row) {
  console.error(`No strategy version ${versionId}.`);
  process.exit(1);
}

const definition = row.definition as never;
const rules = resolveDefinition(definition);
const source = await liveEndOfDaySource();
const latestBar = await source.latestBar(toSymbol(rules.instruments[0]));
if (!latestBar) {
  console.error(`No price history loaded for ${rules.instruments[0]}.`);
  process.exit(1);
}

const opensOn = addSessions(latestBar.date, 1, NSE_CALENDAR);
const estimatedEnd = addSessions(opensOn, plannedSessions - 1, NSE_CALENDAR);

console.log(`\nStrategy : ${row.strategyName} v${row.versionNo}`);
console.log(`Rules    : ${rules.instruments.join(", ")} · entry ${describe(rules.entry)}`);
console.log(`Window   : ${plannedSessions} sessions, opens ${opensOn}, est. end ${estimatedEnd}`);
console.log(`Engine   : ${ENGINE_VERSION} · ${FILL_MODEL}`);
console.log(`Hypothesis: ${hypothesis}\n`);

const forwardTestId = await db().transaction(async (tx) => {
  const [draft] = await tx
    .insert(forwardTests)
    .values({
      strategyVersionId: row.versionId,
      status: "DRAFT",
      declaredHypothesis: hypothesis,
      initialCapitalPaise: rules.initialCapitalPaise,
      costModel: nseEquityDelivery({ brokerage: ZERO_BROKERAGE, slippagePercent: SLIPPAGE_PERCENT }),
      engineVersion: ENGINE_VERSION,
      fillModel: FILL_MODEL,
      plannedSessions,
    })
    .returning({ id: forwardTests.id });

  // The freeze bites from here — the trigger refuses any later change.
  await tx
    .update(forwardTests)
    .set({
      status: "RUNNING",
      startedAt: new Date(`${opensOn}T00:00:00Z`),
      plannedEndAt: new Date(`${estimatedEnd}T00:00:00Z`),
    })
    .where(eq(forwardTests.id, draft.id));

  return draft.id;
});

console.log(`✓ RUNNING — forward test ${forwardTestId}`);
console.log(`  It is now locked and permanent. The evening job will advance it from ${opensOn}.`);
process.exit(0);

function describe(c: { left: { kind: string; period?: number }; comparator: string; right: { kind: string; period?: number } }) {
  const op = (o: { kind: string; period?: number }) =>
    o.period ? `${o.kind}(${o.period})` : o.kind;
  return `${op(c.left)} ${c.comparator} ${op(c.right)}`;
}
