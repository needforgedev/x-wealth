/**
 * Is the forward-test pipeline actually alive?
 *
 *   npm run check-forward-tests
 *
 * Runs last in the evening job, after the loader and the advancer. `plan.md`
 * W6-04, W3-11.
 *
 * ## Why this exists separately from the other two
 *
 * Both of those already exit non-zero when they fail, so a scheduled run
 * surfaces a crash on its own. This checks the case neither of them can see:
 * **everything succeeded and nothing happened.**
 *
 * `advance-forward-tests` replays each test against whatever bars exist. Given
 * no new bars it finds no new sessions, writes nothing, prints "nothing to
 * record" and exits 0 — which is indistinguishable from a strategy that simply
 * did not trade. An expired vendor token, a silent vendor outage, or a
 * scheduler that stopped firing all look exactly like a quiet market.
 *
 * That matters more here than it would elsewhere. A forward test is a claim
 * about a continuous window of time, `forward_tests` and `paper_trades` are
 * append-only with no DELETE path, and a window that stalled unnoticed cannot
 * be repaired — only abandoned and restarted, which costs three months.
 *
 * ## What it deliberately does not alarm on
 *
 * Zero trades on a given evening. A rule-based strategy not firing is the
 * normal case, and `CLAUDE.md` §7.13 is explicit that an alerting system which
 * always finds something teaches people to ignore it. Every check below is a
 * fault, not a fluctuation.
 */
import { config } from "dotenv";
import postgres from "postgres";

import { istDateOf, type IsoDate } from "@/domain/session";
import { UNIVERSE } from "@/server/market-data/universe";

config({ path: ".env.local" });

// --- thresholds -------------------------------------------------------------

/**
 * Calendar days a price series may lag before it counts as stale.
 *
 * The job runs each evening after the close, so on a normal Tuesday the newest
 * bar is the same day. Lag only builds across closures: Friday's bar read on
 * Sunday evening is two days old, and a Diwali-style cluster of Monday and
 * Tuesday holidays takes that to four. Five leaves a day of margin and still
 * catches a genuine outage on its second evening.
 *
 * Measured in calendar days rather than trading sessions on purpose. Sessions
 * would need the holiday calendar, which is still `PLACEHOLDER_CALENDAR_2026`
 * (W1-13) — and a staleness alarm that depends on the thing most likely to be
 * wrong is not an alarm.
 */
const MAX_STALE_DAYS = 5;

/**
 * How far past `planned_end_at` a running test may sit before it is a fault.
 *
 * `planned_end_at` is wall-clock, but the window is counted in sessions that
 * actually printed prices — the calendar says what should have been open, the
 * data says what was. Holidays therefore push a test legitimately past its
 * planned date, and a small overrun is expected.
 *
 * Three weeks is not. That is a completion path that did not fire, and the test
 * is quietly accumulating sessions it was never meant to run.
 */
const MAX_OVERRUN_DAYS = 21;

/**
 * Upstox analytics tokens are valid for a year, and expiry is the highest-
 * consequence silent failure in the whole pipeline: the loader starts failing,
 * the advancer finds no new bars, and every running test freezes in place while
 * still reading as RUNNING.
 *
 * Warn early enough to be ignored twice, fail while there is still time to act.
 */
const TOKEN_WARN_DAYS = 60;
const TOKEN_FAIL_DAYS = 14;

// --- helpers ----------------------------------------------------------------

const DAY_MS = 86_400_000;

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const problems: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  problems.push(message);
  console.log(`  FAIL  ${message}`);
}

function warn(message: string): void {
  warnings.push(message);
  console.log(`  WARN  ${message}`);
}

function ok(message: string): void {
  console.log(`  ok    ${message}`);
}

// --- connect ----------------------------------------------------------------

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set (session pooler, port 5432).");
  process.exit(1);
}

const today = istDateOf(new Date());
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 20, connect_timeout: 30 });

console.log(`forward-test health · ${today} IST\n`);

try {
  // --- 1. market data is arriving -------------------------------------------
  //
  // The upstream check. A stale series is what an expired token, a vendor
  // outage, a network failure and a scheduler that stopped firing all look
  // like from in here, so this one check covers most of the ways the pipeline
  // dies quietly.

  console.log("market data");

  const series = await sql<{ symbol: string; latest: string; bars: number }[]>`
    select symbol, max(date)::text as latest, count(*)::int as bars
    from daily_bars
    group by symbol
    order by symbol`;

  if (series.length === 0) {
    fail("daily_bars is empty — run `npm run load-market-data`");
  } else {
    const loaded = new Map(series.map((row) => [row.symbol, row]));

    for (const entry of UNIVERSE) {
      const row = loaded.get(entry.symbol);

      // A universe member with no bars at all is a different fault from a
      // stale one: the loader never succeeded for it, and every backtest
      // touching that symbol has been silently running on nothing.
      if (!row) {
        fail(`${entry.symbol}: no bars loaded at all`);
        continue;
      }

      const age = daysBetween(row.latest, today);
      const detail = `${entry.symbol}: latest ${row.latest} (${age}d), ${row.bars} bars`;

      if (age > MAX_STALE_DAYS) fail(`${detail} — stale beyond ${MAX_STALE_DAYS}d`);
      else ok(detail);
    }
  }

  // --- 2. running tests are not overdue -------------------------------------

  console.log("\nrunning forward tests");

  const running = await sql<
    {
      id: string;
      name: string;
      version_no: number;
      planned_sessions: number;
      planned_end_at: string | null;
      trades: number;
    }[]
  >`
    select
      ft.id,
      s.name,
      sv.version_no,
      ft.planned_sessions,
      ft.planned_end_at::text,
      (select count(*)::int from paper_trades pt where pt.forward_test_id = ft.id) as trades
    from forward_tests ft
    join strategy_versions sv on sv.id = ft.strategy_version_id
    join strategies s on s.id = sv.strategy_id
    where ft.status = 'RUNNING'
    order by ft.started_at`;

  if (running.length === 0) {
    // Not a fault. It is, however, the state in which this pipeline is
    // unproven — nothing here has been exercised end to end over real time.
    ok("none running");
    warn("no forward test is running — the 60-session clock has not started (W6-15)");
  }

  for (const test of running) {
    const label = `${test.name} v${test.version_no}`;

    if (!test.planned_end_at) {
      fail(`${label}: RUNNING with no planned_end_at`);
      continue;
    }

    const overrun = daysBetween(test.planned_end_at.slice(0, 10), today);
    const detail = `${label}: ${test.trades} trade rows, planned end ${test.planned_end_at.slice(0, 10)}`;

    if (overrun > MAX_OVERRUN_DAYS) {
      fail(`${detail} — ${overrun}d past planned end and still RUNNING`);
    } else {
      ok(detail);
    }
  }

  // --- 3. the vendor token has life left ------------------------------------

  console.log("\nvendor token");

  const expiresOn = process.env.UPSTOX_TOKEN_EXPIRES_ON;

  if (!expiresOn) {
    // Not fatal, but the one failure this check exists to pre-empt is now
    // invisible again.
    warn("UPSTOX_TOKEN_EXPIRES_ON is not set — expiry cannot be warned about");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    fail(`UPSTOX_TOKEN_EXPIRES_ON is not a YYYY-MM-DD date: ${expiresOn}`);
  } else {
    const left = daysBetween(today, expiresOn);

    if (left <= TOKEN_FAIL_DAYS) {
      fail(`Upstox token expires ${expiresOn} — ${left}d left, regenerate now`);
    } else if (left <= TOKEN_WARN_DAYS) {
      warn(`Upstox token expires ${expiresOn} — ${left}d left`);
    } else {
      ok(`Upstox token expires ${expiresOn} — ${left}d left`);
    }
  }
} finally {
  await sql.end();
}

// --- verdict ----------------------------------------------------------------

console.log(
  `\n${problems.length} problem(s), ${warnings.length} warning(s)` +
    `${problems.length === 0 ? " — pipeline healthy" : ""}`,
);

// Warnings do not fail the run. They are things to know, and a check that goes
// red for something nobody intends to act on today stops being read at all.
process.exit(problems.length > 0 ? 1 : 0);
