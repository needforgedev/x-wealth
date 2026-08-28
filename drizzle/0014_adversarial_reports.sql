-- ---------------------------------------------------------------------------
-- `adversarial_reports` — the attack report. `plan.md` W18-07, `CLAUDE.md` §7.7.
--
-- APPEND ONLY, like every other record of a result. A report saying a backtest
-- should not be believed is precisely the record someone would want to remove,
-- which is why it is written to a table that cannot forget it.
--
-- ## What is stored, and why it is more than §9 sketches
--
-- §9 lists `findings` and `severity_ranking`. Two columns are added on the same
-- reasoning that put `model_id` on `ai_interactions`: without them the row is
-- not reproducible, and a stored result nobody can reproduce is a claim rather
-- than a record.
--
--   `suite_version` — which implementation produced this. The attacks are the
--     product's own opinion about what makes a backtest untrustworthy, and that
--     opinion will change. A finding from `adversarial-1` is not comparable to
--     one from `adversarial-3`.
--   `seed` — the Monte Carlo draws a thousand orderings from a seeded
--     generator. Without the seed, "5% of paths lost money" cannot be checked.
--
--   `attacks_run` / `attacks_skipped` — a suite that found nothing and a suite
--     that failed to execute both produce an empty `findings` array, and they
--     mean opposite things. §7.13's rule that silence must be a legible output
--     rather than an absence applies here too.
--
-- ## What is deliberately absent
--
-- **No score, grade, rating or composite of any kind** (§8.7). Severity is a
-- property of a finding — how badly *this* result is undermined by *this* test
-- — and there is nowhere here to reduce a set of findings to a number about the
-- strategy. The pressure to add one will be constant, because one number is
-- what everyone asks for. `adversarial.test.ts` walks the whole report object
-- asserting no such key exists, and this table has no column for one.
--
-- **No `passed` or `verdict` column.** The suite's job is to break a strategy,
-- not to bless it (§7.7). A boolean saying it survived would be a blessing, and
-- would be read as one.
-- ---------------------------------------------------------------------------

CREATE TABLE "adversarial_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "backtest_run_id" uuid NOT NULL REFERENCES "backtest_runs"("id") ON DELETE RESTRICT,

  "suite_version" text NOT NULL,
  "seed" bigint NOT NULL,

  "findings" jsonb NOT NULL,
  "severity_ranking" jsonb NOT NULL,
  "attacks_run" jsonb NOT NULL,
  "attacks_skipped" jsonb NOT NULL,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "adversarial_reports_run_idx"
  ON "adversarial_reports" ("backtest_run_id", "created_at");
--> statement-breakpoint

-- One report per run, per suite version, per seed.
--
-- The report is a pure function of those three things — the attacks are
-- deterministic and the randomness is seeded. Two rows sharing all three and
-- disagreeing would therefore be a contradiction, not a history, and there
-- would be no principled way to say which one was true.
--
-- This also makes re-running safe: attacking the same run twice is refused
-- rather than quietly appending a duplicate. And it forces a `suite_version`
-- bump when the attacks change, because the old row is in the way — which is
-- the correct pressure. A finding is only meaningful next to the version of
-- the suite that produced it.
CREATE UNIQUE INDEX "adversarial_reports_run_suite_seed_key"
  ON "adversarial_reports" ("backtest_run_id", "suite_version", "seed");
--> statement-breakpoint

-- Arrays, not objects. A `findings` that arrived as `{}` would read as "no
-- findings" downstream while actually meaning "the wrong shape was stored",
-- and the two must not be confusable. `coalesce(..., false)` because a CHECK
-- passes on NULL — the lesson from `0012`.
ALTER TABLE "adversarial_reports"
  ADD CONSTRAINT "adversarial_reports_shapes" CHECK (
    coalesce(
      jsonb_typeof("findings") = 'array'
      AND jsonb_typeof("severity_ranking") = 'array'
      AND jsonb_typeof("attacks_run") = 'array'
      AND jsonb_typeof("attacks_skipped") = 'array',
      false
    )
  );
--> statement-breakpoint

-- A report that ran no attacks at all is not a report. It is a failed run that
-- would otherwise be indistinguishable from a clean one.
ALTER TABLE "adversarial_reports"
  ADD CONSTRAINT "adversarial_reports_ran_something" CHECK (
    coalesce(jsonb_array_length("attacks_run") > 0, false)
  );
--> statement-breakpoint

CREATE TRIGGER adversarial_reports_append_only
  BEFORE UPDATE OR DELETE ON "adversarial_reports"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

-- No permitted mutation at all here, unlike `ai_interactions` — nothing about a
-- report is decided after it is written. So both are revoked, not just DELETE.
REVOKE UPDATE, DELETE ON "adversarial_reports" FROM anon, authenticated, service_role;
--> statement-breakpoint

-- Keep the soft-delete assertion covering every append-only table. A report
-- that could be hidden is the most tempting one to hide.
CREATE OR REPLACE FUNCTION assert_no_soft_delete_columns()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%I.%I', c.relname, a.attname), ', ')
    INTO offending
   FROM pg_attribute a
   JOIN pg_class c     ON c.oid = a.attrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname IN (
       'deleted_at', 'is_archived', 'archived_at', 'visible', 'is_hidden', 'hidden_at'
     )
     AND c.relname IN (
       'strategy_versions', 'backtest_runs', 'forward_tests',
       'paper_trades', 'ai_interactions', 'adversarial_reports', 'audit_log'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Soft-delete is forbidden on append-only tables (CLAUDE.md §8.1). Offending: %',
      offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
