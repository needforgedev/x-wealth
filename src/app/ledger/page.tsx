import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import type { RunResults } from "@/db/schema";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { currentIdentity } from "@/server/identity";
import { ledgerCounts, ledgerForwardTests, type LedgerForwardTest } from "@/server/queries/ledger";

export const dynamic = "force-dynamic";

/**
 * The iteration ledger. `CLAUDE.md` §7.14, `plan.md` W8-01/02/05/06.
 *
 * > Every version, every abandoned test, every failed window — permanently
 * > visible to the user on their own profile.
 *
 * ## Why the counts lead
 *
 * Because the denominator is the product. *"12 forward tests run; 3 live, 9
 * abandoned"* says something a return figure cannot: that this person tests
 * ideas and most of them do not survive. A page that led with the best result
 * would be describing the same history and telling the opposite story.
 *
 * The abandoned count is therefore printed at the same size as the completed
 * one, not smaller and not in a muted colour. It is not a failure tally.
 *
 * ## What is not here, and never will be
 *
 * **No filter, no sort, no "hide abandoned".** §8.7 and `W8-04`. The queries
 * behind this take a user id and nothing else — there is no parameter that
 * could be set to produce a flattering subset, which is a stronger guarantee
 * than a UI that merely declines to offer the control.
 *
 * **No aggregate.** No overall win rate, no total return across strategies, no
 * "your best strategy". Every one of those is a platform-authored performance
 * claim about a person, and §8.7 forbids them. We report what happened.
 *
 * **No figure for a running test.** `W8-07`: a running window has two
 * net-return numbers and only `standing` may be shown, which needs a replay per
 * test. More to the point, a percentage in a list of outcomes reads as an
 * outcome, and a running test does not have one yet.
 *
 * **Private** (§8.5). Nobody but this user ever sees this page.
 */
export default async function LedgerPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));
  const user = identity.user;

  const [counts, tests] = await Promise.all([
    ledgerCounts(user.id),
    ledgerForwardTests(user.id),
  ]);

  return (
    <AppShell>
      <AppBar backHref="/home" />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Your record</h1>
        <p className="mt-[4px] text-[13px] text-muted">
          Everything you have tested, including the tests you stopped. Nothing here can be edited,
          reordered or removed, and nobody else can see it.
        </p>

        {/* The headline §7.14 asks for, in its own words. */}
        <p className="mt-6 rounded-[8px] border border-line p-5 text-[16px] leading-[1.5] text-ink">
          {counts.forwardTestsStarted === 0 ? (
            <>
              <span className="font-semibold">No forward tests yet.</span> A backtest is a statement
              about data that was already known when you wrote the rules. The record starts when you
              lock parameters and open a window on sessions that have not happened.
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums">
                {counts.forwardTestsStarted}{" "}
                {counts.forwardTestsStarted === 1 ? "forward test" : "forward tests"} run
              </span>
              ;{" "}
              <span className="tabular-nums">
                {counts.running} live, {counts.completed} completed, {counts.abandoned} abandoned
              </span>
              .
            </>
          )}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Count label="Strategies" value={counts.strategies} />
          <Count label="Versions" value={counts.versions} />
          <Count label="Backtests" value={counts.backtests} />
        </dl>

        {/*
          Not a warning, and not framed as one. A high backtest-to-lock ratio is
          the p-hacking signal `B-11` exists over, and the honest thing is to
          show the user their own number rather than to grade them on it.
        */}
        {counts.backtests > 0 && counts.forwardTestsStarted === 0 && (
          <p className="mt-4 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            {counts.backtests} {counts.backtests === 1 ? "backtest" : "backtests"} and no forward
            test yet. Backtesting against the same history until something passes is how a result
            gets selected rather than found — the window is what makes an answer count.
          </p>
        )}

        <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Every forward test
        </h2>

        {tests.length === 0 ? (
          <p className="mt-3 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
            Nothing here yet. When you lock a strategy and open a window, it appears — and stays,
            whatever it turns out to say.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {tests.map((test) => (
              <li key={test.id}>
                <Link
                  href={`/forward-tests/${test.id}`}
                  className="block rounded-[8px] border border-line p-4"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold text-ink">{test.strategyName}</span>
                    <span className="text-[12px] text-muted">v{test.versionNo}</span>
                    <StatusTag status={test.status} />
                    <span className="ml-auto text-[12px] tabular-nums text-muted">
                      {(test.startedAt ?? test.createdAt).toISOString().slice(0, 10)}
                    </span>
                  </div>

                  {/* The sentence declared before any result existed. It is the
                      thing the outcome has to be read against. */}
                  <p className="mt-2 text-[13px] text-ink">{test.declaredHypothesis}</p>

                  <p className="mt-2 text-[13px] text-muted">{describeOutcome(test)}</p>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-8 rounded-[6px] bg-surface-alt p-4 text-[13px] text-muted">
          An abandoned test is not a failure to be tidied away. It is the denominator: three
          completed windows mean one thing beside nine abandoned ones and something entirely
          different beside none.
        </p>
      </div>
    </AppShell>
  );
}

/**
 * What happened, in a sentence.
 *
 * A running test gets no number — see the note on the page and `W8-07`. An
 * abandoned one names its reason if the user gave it, because "abandoned" with
 * no reason is the version of this record that teaches nothing.
 */
function describeOutcome(test: LedgerForwardTest): string {
  if (test.status === "RUNNING" || test.status === "DRAFT") {
    return `Running · ${test.plannedSessions}-session window${
      test.startedAt ? `, opened ${test.startedAt.toISOString().slice(0, 10)}` : ", not yet opened"
    }. Figures are on the console.`;
  }

  const results = test.finalResults as RunResults | null;
  const net =
    results && typeof results.netReturnPercent === "number"
      ? `${results.netReturnPercent >= 0 ? "+" : ""}${results.netReturnPercent.toFixed(2)}% net over ${
          results.tradeCount ?? 0
        } ${results.tradeCount === 1 ? "trade" : "trades"}`
      : null;

  if (test.status === "ABANDONED") {
    const reason = test.abandonReason?.trim();
    return [
      `Abandoned${test.endedAt ? ` on ${test.endedAt.toISOString().slice(0, 10)}` : ""}`,
      reason ? `— ${reason}` : "— no reason recorded",
      net ? `· ${net} at the point it stopped` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Completed${test.endedAt ? ` on ${test.endedAt.toISOString().slice(0, 10)}` : ""}`,
    net ? `· ${net}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function StatusTag({ status }: { status: string }) {
  const label =
    status === "RUNNING" || status === "DRAFT"
      ? "Running"
      : status === "COMPLETED"
        ? "Completed"
        : "Abandoned";

  /**
   * Abandoned is not styled as an error.
   *
   * Red would read as "something went wrong", and stopping a test that is not
   * working is the product behaving correctly. It gets the same neutral
   * treatment as completed, which is the whole argument of this page.
   */
  const tone =
    status === "RUNNING" || status === "DRAFT"
      ? "border-brand text-brand"
      : "border-field-line-strong text-muted";

  return (
    <span
      className={`rounded-[3px] border px-[7px] py-[2px] text-[11px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[6px] border border-line p-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-[20px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
