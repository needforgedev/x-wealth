-- ---------------------------------------------------------------------------
-- `annotations` — why, recorded beside what. `plan.md` W17, `CLAUDE.md` §7.5, §8.8.
--
-- APPEND ONLY with **no permitted mutation at all**, like `adversarial_reports`:
-- nothing about a contemporaneous reason is decided after it is written.
-- Editing appends a replacement row that names what it supersedes, and the
-- superseded note stays readable — what the author believed before revising
-- is itself part of the record.
--
-- ## Why this ships now, ahead of the module that consumes it (W17-06)
--
-- Execution-gap analysis (W21) attributes the distance between what a
-- strategy signalled and what its author did, and it cannot attribute a skip
-- without a reason recorded when the skip happened. A reason reconstructed
-- after the outcome is known is a story, and stories are kind to their
-- narrators. The layer has to exist before the habits it records do.
--
-- ## Three integrity decisions
--
--   **One successor per note.** A unique index on `supersedes_id` keeps every
--   chain linear; "the current note" is a fact the database enforces, not a
--   merge the reader performs. NULLs are distinct under a unique index, so
--   unsuperseded rows are unlimited.
--
--   **A supersede stays inside its record.** The BEFORE INSERT trigger
--   refuses a replacement that names another user's note or a note about a
--   different target — without it, "editing" would be a way to reach across
--   records the freeze and ownership checks otherwise close.
--
--   **"Other" must say something.** `SKIP_OTHER`, `OVERRIDE_OTHER` and `NOTE`
--   carry no meaning without words, so the CHECK requires text on exactly
--   those values. The named reasons stand alone — forcing prose onto them
--   would train people to type filler, and filler is what W21 would then
--   aggregate.
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."annotation_target_type" AS ENUM(
  'STRATEGY_VERSION', 'FORWARD_TEST', 'PAPER_TRADE'
);--> statement-breakpoint

CREATE TYPE "public"."annotation_reason" AS ENUM(
  'SKIP_NEWS_EVENT', 'SKIP_DID_NOT_TRUST', 'SKIP_ALREADY_EXPOSED',
  'SKIP_INSUFFICIENT_CAPITAL', 'SKIP_MISSED_WINDOW', 'SKIP_OTHER',
  'OVERRIDE_SIZED_UP_CONVICTION', 'OVERRIDE_SIZED_DOWN_UNCERTAINTY',
  'OVERRIDE_EARLY_EXIT_FEAR', 'OVERRIDE_EARLY_EXIT_INFORMATION', 'OVERRIDE_OTHER',
  'NOTE'
);--> statement-breakpoint

CREATE TABLE "annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "target_type" "annotation_target_type" NOT NULL,
  "target_id" uuid NOT NULL,
  "structured_reason" "annotation_reason" NOT NULL,
  "note_text" text NOT NULL,
  "supersedes_id" uuid REFERENCES "annotations"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "annotations_no_self_supersede_ck" CHECK (
    "supersedes_id" IS NULL OR "supersedes_id" <> "id"
  ),
  -- coalesce(..., false): a CHECK passes on NULL, and anything unknown has to
  -- be turned into a rejection explicitly (the 0012 lesson).
  CONSTRAINT "annotations_other_needs_words_ck" CHECK (
    coalesce(
      "structured_reason" NOT IN ('SKIP_OTHER', 'OVERRIDE_OTHER', 'NOTE')
      OR length(btrim("note_text")) > 0,
      false
    )
  )
);--> statement-breakpoint

CREATE INDEX "annotations_target_idx" ON "annotations" ("target_type", "target_id", "created_at");--> statement-breakpoint
CREATE INDEX "annotations_user_idx" ON "annotations" ("user_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "annotations_single_successor_idx" ON "annotations" ("supersedes_id");--> statement-breakpoint

-- A replacement stays inside its record, and every annotation is about a row
-- that exists. Ownership of the *target* is the action's job — walking
-- paper_trade → forward_test → version → strategy → user in a trigger would
-- re-state the application's whole join graph — but the two invariants that
-- make "supersede" safe against raw SQL live here, where they cannot be
-- forgotten.
CREATE OR REPLACE FUNCTION enforce_annotation_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prior annotations%ROWTYPE;
  target_exists boolean;
BEGIN
  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT * INTO prior FROM annotations WHERE id = NEW.supersedes_id;

    IF prior.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'annotations: a note can only be superseded by its own author.'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF prior.target_type IS DISTINCT FROM NEW.target_type
       OR prior.target_id IS DISTINCT FROM NEW.target_id THEN
      RAISE EXCEPTION 'annotations: a replacement note must be about the same record.'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  target_exists := CASE NEW.target_type
    WHEN 'STRATEGY_VERSION' THEN EXISTS (SELECT 1 FROM strategy_versions WHERE id = NEW.target_id)
    WHEN 'FORWARD_TEST'     THEN EXISTS (SELECT 1 FROM forward_tests     WHERE id = NEW.target_id)
    WHEN 'PAPER_TRADE'      THEN EXISTS (SELECT 1 FROM paper_trades      WHERE id = NEW.target_id)
  END;

  IF NOT coalesce(target_exists, false) THEN
    RAISE EXCEPTION 'annotations: % % does not exist.', NEW.target_type, NEW.target_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER annotations_integrity
  BEFORE INSERT ON "annotations"
  FOR EACH ROW EXECUTE FUNCTION enforce_annotation_integrity();--> statement-breakpoint

CREATE TRIGGER annotations_append_only
  BEFORE UPDATE OR DELETE ON "annotations"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();--> statement-breakpoint

REVOKE UPDATE, DELETE ON "annotations" FROM anon, authenticated, service_role;--> statement-breakpoint

-- The soft-delete assertion covers every append-only table, and a note that
-- could be hidden is precisely the one someone would hide (§8.8).
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
       'paper_trades', 'ai_interactions', 'adversarial_reports', 'audit_log',
       'annotations'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Soft-delete is forbidden on append-only tables (CLAUDE.md §8.1). Offending: %',
      offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
