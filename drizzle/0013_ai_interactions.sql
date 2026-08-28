-- ---------------------------------------------------------------------------
-- `ai_interactions` replaces `ai_critiques`. `plan.md` W15-02, decision AD-20.
--
-- ## Why a new table rather than widening the old one
--
-- `ai_critiques` was built for the one AI surface v1 had: a read-only critique
-- of a finished forward test, deferred as optional (`AD-16`). v2 makes the AI
-- the front door — it compiles the idea, sharpens the hypothesis, attacks the
-- backtest, writes the post-mortem and generates the digests (`CLAUDE.md` §7.2,
-- §7.7, §7.11, §7.13). Five context types, not one.
--
-- Widening in place would mean:
--   - making `forward_test_id` nullable, which is the only thing that column
--     was for — a hypothesis call has no forward test, and neither does a
--     compile;
--   - keeping `advisor_acted`, a column named after a persona deleted in 0010;
--   - keeping `findings`, whose stored shape is critique-specific, as the home
--     for compiled JSON and digest content;
--   - keeping the name `ai_critiques` for a table where four of five rows are
--     not critiques.
--
-- The table holds **zero rows** — checked on the live database before writing
-- this. So there is no record to preserve and nothing is being rewritten: the
-- append-only rule protects recorded decisions, and there are none here.
--
-- ## Order matters
--
-- `DROP TABLE` takes its own triggers, indexes and grants with it, including
-- the `REVOKE DELETE` that `0001` applied. What it does not take is the trigger
-- *function*, which would otherwise sit in `public` forever with nothing to
-- fire on. Dropped explicitly, exactly as `0009` did. `enforce_append_only` is
-- shared and stays.
--
-- ## What is deliberately absent from the new table
--
-- **There is no column here that model output could reach a strategy
-- definition through.** `CLAUDE.md` §8.6 makes that a legal boundary rather
-- than a design preference: the moment our model reshapes a strategy we are a
-- co-author of the investment recommendation, and the §3 fact-2 claim that the
-- human authored it stops being true. `resulting_version_id` records what the
-- *user* chose to author after reading the output. It is set by their action,
-- never by the model, and it points at a version the append-only
-- `strategy_versions` table has already accepted on its own terms.
--
-- No score, grade, rating or verdict column, per §8.7 — and no `deleted_at`,
-- per §8.1. The soft-delete assertion below is updated to cover this table.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "ai_critiques";
--> statement-breakpoint

DROP FUNCTION IF EXISTS "enforce_ai_critique_immutability"();
--> statement-breakpoint


-- ===========================================================================
-- 1. The context an interaction happened in
--
-- One value per AI surface in `CLAUDE.md` §7. An enum rather than free text
-- because the CHECKs below branch on it, and a typo'd context would silently
-- escape every one of them.
-- ===========================================================================

CREATE TYPE "ai_interaction_context" AS ENUM (
  'HYPOTHESIS',   -- §7.2  articulating a falsifiable hypothesis
  'COMPILE',      -- §7.3  plain English in, structured rule set out
  'CRITIQUE',     -- §7.11 structured findings on a backtest, never a verdict
  'POST_MORTEM',  -- §7.11 what happened, against the declared hypothesis
  'DIGEST'        -- §7.13 daily and weekly review, silence a valid output
);
--> statement-breakpoint


-- ===========================================================================
-- 2. The table
-- ===========================================================================

CREATE TABLE "ai_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,

  "context_type" "ai_interaction_context" NOT NULL,

  -- Exactly what the model was shown, and exactly what it returned. Both
  -- NOT NULL: an interaction with no recorded input cannot be audited, and one
  -- with no recorded output did not produce anything a user could have seen.
  "input_snapshot" jsonb NOT NULL,
  "output" jsonb NOT NULL,

  -- Which model, under which prompt. Without these a finding cannot be
  -- attributed to a model we have since replaced, and the log stops being
  -- evidence of anything in particular.
  "model_id" text NOT NULL,
  "prompt_version" text NOT NULL,

  -- What the call was about, where that is a thing in this database. Both
  -- nullable; the CHECKs below say when each is required and when it is
  -- forbidden.
  "strategy_version_id" uuid REFERENCES "strategy_versions"("id") ON DELETE RESTRICT,
  "forward_test_id" uuid REFERENCES "forward_tests"("id") ON DELETE RESTRICT,

  -- What the user did next. The evidence half of Reg 16C: model output on one
  -- side, a human decision on the other.
  "user_acted" boolean DEFAULT false NOT NULL,
  "resulting_version_id" uuid REFERENCES "strategy_versions"("id") ON DELETE RESTRICT,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "ai_interactions_user_id_idx"
  ON "ai_interactions" ("user_id", "created_at");
--> statement-breakpoint

CREATE INDEX "ai_interactions_strategy_version_idx"
  ON "ai_interactions" ("strategy_version_id")
  WHERE "strategy_version_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX "ai_interactions_forward_test_idx"
  ON "ai_interactions" ("forward_test_id")
  WHERE "forward_test_id" IS NOT NULL;
--> statement-breakpoint


-- ===========================================================================
-- 3. Which contexts may carry a subject
--
-- Two constraints, each of which exists for a stated reason. Contexts not named
-- below — CRITIQUE and COMPILE — are deliberately left unconstrained: W7's
-- shape is not settled, and a constraint encoding a guess about it would be
-- `0011` again, where a CHECK that looked thorough enforced nothing.
--
-- Both are wrapped in `coalesce(..., false)`, which is the lesson from `0012`:
-- a CHECK passes when its expression is NULL, so anything unknown has to be
-- turned into a rejection explicitly.
-- ===========================================================================

-- A hypothesis written against a strategy you have already backtested is a
-- rationalisation, not a hypothesis — `CLAUDE.md` §7.2 is explicit that the
-- workbench must not generate ideas from what already exists, because that is
-- p-hacking at the source. A digest is account-wide by definition. Neither may
-- name a subject, and the database is where that holds rather than the prompt.
ALTER TABLE "ai_interactions"
  ADD CONSTRAINT "ai_interactions_unanchored_contexts" CHECK (
    coalesce(
      "context_type" NOT IN ('HYPOTHESIS', 'DIGEST')
      OR ("strategy_version_id" IS NULL AND "forward_test_id" IS NULL),
      false
    )
  );
--> statement-breakpoint

-- A post-mortem explains what happened against the declared hypothesis
-- (`CLAUDE.md` §5 step 6). Without the test there is nothing to explain, and a
-- post-mortem that is not of anything is prose.
ALTER TABLE "ai_interactions"
  ADD CONSTRAINT "ai_interactions_post_mortem_has_a_test" CHECK (
    coalesce(
      "context_type" <> 'POST_MORTEM' OR "forward_test_id" IS NOT NULL,
      false
    )
  );
--> statement-breakpoint

-- Authoring a version off the back of an interaction *is* acting on it. The two
-- columns cannot disagree about whether the user did something.
ALTER TABLE "ai_interactions"
  ADD CONSTRAINT "ai_interactions_resulting_version_implies_acted" CHECK (
    coalesce("resulting_version_id" IS NULL OR "user_acted", false)
  );
--> statement-breakpoint


-- ===========================================================================
-- 4. Append-only, with the same two permitted mutations `ai_critiques` had
--
-- The record of what a model was shown and what it returned can never change.
-- `user_acted` and `resulting_version_id` are set once, afterwards, by the
-- user's own action — that is the whole point of them, and they are unknowable
-- at insert time.
-- ===========================================================================

CREATE TRIGGER ai_interactions_append_only
  BEFORE DELETE ON "ai_interactions"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_ai_interaction_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.context_type IS DISTINCT FROM OLD.context_type
     OR NEW.input_snapshot IS DISTINCT FROM OLD.input_snapshot
     OR NEW.output IS DISTINCT FROM OLD.output
     OR NEW.model_id IS DISTINCT FROM OLD.model_id
     OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
     OR NEW.strategy_version_id IS DISTINCT FROM OLD.strategy_version_id
     OR NEW.forward_test_id IS DISTINCT FROM OLD.forward_test_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'ai_interactions is append-only: only user_acted and resulting_version_id may be set, once.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.user_acted IS TRUE AND NEW.user_acted IS DISTINCT FROM OLD.user_acted THEN
    RAISE EXCEPTION 'ai_interactions.user_acted is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.resulting_version_id IS NOT NULL
     AND NEW.resulting_version_id IS DISTINCT FROM OLD.resulting_version_id THEN
    RAISE EXCEPTION 'ai_interactions.resulting_version_id is already recorded and cannot be changed.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER ai_interactions_immutable
  BEFORE UPDATE ON "ai_interactions"
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_interaction_immutability();
--> statement-breakpoint

-- UPDATE is not revoked, because the two columns above are a legitimate update.
-- DELETE is, matching `ai_critiques`. The trigger is the real enforcement —
-- `service_role` bypasses RLS but not triggers — and this is the second layer.
REVOKE DELETE ON "ai_interactions" FROM anon, authenticated, service_role;
--> statement-breakpoint


-- ===========================================================================
-- 5. Bring the soft-delete assertion up to date
--
-- `CLAUDE.md` §8.1: no `deleted_at`, no `is_archived`, no `visible` flag that
-- would let a bad run be hidden. The function is re-created rather than edited
-- because Supabase's `postgres` is not superuser, so this is a callable
-- assertion run by CI rather than DDL that refuses the change outright.
--
-- Two corrections in one place: `ai_critiques` becomes `ai_interactions`, and
-- `signals` comes off the list — it was dropped in `0009` and has been a name
-- matching nothing ever since. A guard listing tables that do not exist reads
-- as broader coverage than it has.
-- ===========================================================================

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
       'paper_trades', 'ai_interactions', 'audit_log'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Soft-delete is forbidden on append-only tables (CLAUDE.md §8.1). Offending: %',
      offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
