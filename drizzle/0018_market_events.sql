-- ---------------------------------------------------------------------------
-- `market_events` — dated facts rules can reference. `plan.md` W16-01,
-- `CLAUDE.md` §7.4 and §9.
--
-- APPEND ONLY with no permitted mutation, in the `adversarial_reports`
-- posture. A revised date is a NEW row with a later `known_on`; the old row
-- stays, because a backtest covering the period when the old date was public
-- must keep seeing what was public then. Updating in place would make every
-- historical evaluation quietly re-read the present.
--
-- ## The two CHECKs
--
--   **Scope matches type.** EARNINGS, EX_DIVIDEND, SPLIT and BONUS are about
--   one instrument and must name it; RBI_POLICY, BUDGET and CPI_IIP are
--   market-wide and must not, because a symbol on a Budget row would invite
--   filtering a market-wide fact down to a watchlist.
--
--   **`known_on` never trails the event.** A date that became public after it
--   happened is a reconstruction; loaders that lack an announcement date set
--   `known_on = event_date`, which under-informs the engine rather than
--   over-informing it — the only acceptable direction of error (W16-04).
--
-- Exchange holidays live in the calendar module, generated from printed bars;
-- expiry days are arithmetic. Neither is stored here — a second copy of
-- either would be a second truth.
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."market_event_type" AS ENUM(
  'EARNINGS', 'EX_DIVIDEND', 'SPLIT', 'BONUS', 'RBI_POLICY', 'BUDGET', 'CPI_IIP'
);--> statement-breakpoint

CREATE TABLE "market_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type" "market_event_type" NOT NULL,
  "symbol" text,
  "event_date" date NOT NULL,
  "known_on" date NOT NULL,
  "confirmed" boolean NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "market_events_scope_matches_type_ck" CHECK (
    coalesce(
      CASE
        WHEN "event_type" IN ('EARNINGS', 'EX_DIVIDEND', 'SPLIT', 'BONUS')
          THEN "symbol" IS NOT NULL AND "symbol" ~ '^[A-Z]+:[A-Z0-9&-]+$'
        ELSE "symbol" IS NULL
      END,
      false
    )
  ),
  CONSTRAINT "market_events_known_before_event_ck" CHECK (
    coalesce("known_on" <= "event_date", false)
  ),
  CONSTRAINT "market_events_source_named_ck" CHECK (
    coalesce(length(btrim("source")) > 0, false)
  )
);--> statement-breakpoint

CREATE INDEX "market_events_type_date_idx" ON "market_events" ("event_type", "event_date");--> statement-breakpoint
CREATE INDEX "market_events_symbol_date_idx" ON "market_events" ("symbol", "event_date");--> statement-breakpoint

CREATE TRIGGER market_events_append_only
  BEFORE UPDATE OR DELETE ON "market_events"
  FOR EACH ROW EXECUTE FUNCTION enforce_append_only();--> statement-breakpoint

REVOKE UPDATE, DELETE ON "market_events" FROM anon, authenticated, service_role;--> statement-breakpoint

-- The soft-delete assertion covers every append-only table; an event row that
-- could be hidden is a backtest input that could be curated after the fact.
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
       'annotations', 'market_events'
     );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Soft-delete is forbidden on append-only tables (CLAUDE.md §8.1). Offending: %',
      offending
      USING ERRCODE = 'restrict_violation';
  END IF;
END;
$$;
