import { bigint, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt } from "./_shared";
import { backtestRuns } from "./testing";

import type { Attack, Finding, Severity } from "@/domain/adversarial";

/**
 * APPEND ONLY. The attack report — `CLAUDE.md` §7.7, `plan.md` W18-07.
 *
 * A written record of every reason a backtest should not be believed. It is
 * append-only for the same reason an abandoned forward test is: the report
 * saying a result is fragile is exactly the one somebody would want gone, and
 * the product's whole claim is that it cannot be.
 *
 * ## What must never appear here
 *
 * **A score, grade, rating or composite.** §8.7 — we report what happened and
 * never grade it. `severity` is a property of an individual finding, saying how
 * badly *this* result is undermined by *this* test. There is deliberately no
 * column that reduces a set of findings to a number about the strategy, and
 * `adversarial.test.ts` walks the whole report object asserting none appears.
 * The pressure to add one will be constant, because a single number is what
 * everyone asks for and what nobody can defend.
 *
 * **A `passed` flag.** The suite's job is to break a strategy, not to bless it.
 * A boolean saying it survived would be read as a blessing, and §7.7 is explicit
 * that a suite mostly returning "looks fine" has been built wrong.
 */
export const adversarialReports = pgTable(
  "adversarial_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    backtestRunId: uuid("backtest_run_id")
      .notNull()
      .references(() => backtestRuns.id, { onDelete: "restrict" }),

    /**
     * Which implementation produced this. The attacks encode the product's own
     * opinion about what makes a backtest untrustworthy, and that opinion will
     * change — a finding from `adversarial-1` is not comparable to one from a
     * later suite, and without this column nothing would say so.
     */
    suiteVersion: text("suite_version").notNull(),

    /**
     * The Monte Carlo seed. A thousand shuffles drawn from a seeded generator,
     * so the row is reproducible; without it, "5% of orderings lost money" is
     * an assertion nobody can check.
     */
    seed: bigint("seed", { mode: "number" }).notNull(),

    /** Observations with evidence attached. Never verdicts. */
    findings: jsonb("findings").$type<Finding[]>().notNull(),

    /** The ranking itself — attack and severity, most severe first. */
    severityRanking: jsonb("severity_ranking")
      .$type<Array<{ attack: Attack; severity: Severity }>>()
      .notNull(),

    /**
     * A suite that found nothing and a suite that failed to execute both leave
     * `findings` empty, and they mean opposite things. These two columns are
     * what tells them apart — the same requirement §7.13 puts on the digests,
     * that silence be a legible output rather than an absence.
     */
    attacksRun: jsonb("attacks_run").$type<Attack[]>().notNull(),
    attacksSkipped: jsonb("attacks_skipped")
      .$type<Array<{ attack: Attack; reason: string }>>()
      .notNull(),

    createdAt: createdAt(),
  },
  (t) => [
    index("adversarial_reports_run_idx").on(t.backtestRunId, t.createdAt),
    /**
     * The report is a pure function of run, suite version and seed. Two rows
     * sharing all three and disagreeing would be a contradiction rather than a
     * history, with no principled way to say which was true.
     */
    uniqueIndex("adversarial_reports_run_suite_seed_key").on(
      t.backtestRunId,
      t.suiteVersion,
      t.seed,
    ),
  ],
);

export type AdversarialReportRow = typeof adversarialReports.$inferSelect;
