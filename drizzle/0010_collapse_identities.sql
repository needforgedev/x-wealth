-- ---------------------------------------------------------------------------
-- Collapse advisors and investors into one `users` table. `plan.md` W24.
--
-- v2 has one persona (`CLAUDE.md` §6): a retail trader who authors, tests and
-- eventually runs their own strategies. They are both the author and the only
-- consumer of everything they make. The two-sided model is gone with the
-- distribution surface that needed it (0009).
--
-- ## What is dropped rather than carried over
--
-- Everything SEBI-registration-shaped: `sebi_registration_no`,
-- `raasb_enlistment_no`, `firm_name`, `mca_no`, `registration_valid_until`,
-- `verification_status`, `verified_at`, `rejection_reason`, the whole
-- `advisor_documents` table, and `parrva_opted_in_at`.
--
-- None of it is deferred. v2 users are not Research Analysts and must not act
-- as ones — §2 abandons that direction outright — so there is no registration
-- to verify, nothing to gate on it, and PaRRVA verifies claims by RAs, IAs and
-- algo providers, which we are to nobody.
--
-- `interests` goes too. It personalised a discovery feed that no longer exists.
--
-- ## What is carried over
--
-- Contact details, `experience_level`, `risk_ack_at` and `suitability`. The
-- risk acknowledgement especially: it is three points acknowledged separately
-- rather than one blanket agreement, and re-asking for it would be both rude
-- and a worse record than the one already held.
--
-- `plan_tier` is new and required by §9. FREE/PRO is a placeholder — where the
-- boundary actually falls is blocker B-9, and §11.5 says it caps compute rather
-- than features, because backtests are the real COGS.
--
-- ## One row per auth user, not one per person
--
-- The join is a FULL OUTER on `user_id`, so an account that existed on both
-- sides collapses to a single row and an account on one side keeps its data.
-- On this database the advisor and the investor turned out to be two different
-- auth users, which yields two rows — correct, and worth stating because a
-- reader would reasonably assume the demo used one account for both.
-- ---------------------------------------------------------------------------

CREATE TYPE "plan_tier" AS ENUM ('FREE', 'PRO');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- Supabase Auth owns auth.users; we key off it and never migrate it.
  "auth_user_id" uuid NOT NULL UNIQUE REFERENCES "auth"."users"("id") ON DELETE RESTRICT,

  "contact_name" text,
  "contact_email" text,
  "phone" text,

  "experience_level" "experience_level",

  -- Set once, when the three disclosure points are acknowledged separately.
  "risk_ack_at" timestamptz,
  "suitability" jsonb,

  "plan_tier" "plan_tier" DEFAULT 'FREE' NOT NULL,

  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

-- LEAST ignores NULLs in Postgres, so an account that existed on only one side
-- keeps that side's timestamp rather than collapsing to now().
INSERT INTO "users" (
  "auth_user_id", "contact_name", "contact_email",
  "experience_level", "risk_ack_at", "suitability", "created_at"
)
SELECT
  coalesce(a."user_id", i."user_id"),
  coalesce(i."contact_name", a."contact_name"),
  coalesce(i."contact_email", a."contact_email"),
  i."experience_level",
  i."risk_ack_at",
  i."suitability",
  least(a."created_at", i."created_at")
FROM "advisors" a
FULL OUTER JOIN "investors" i ON a."user_id" = i."user_id";

-- --- repoint strategies -----------------------------------------------------

ALTER TABLE "strategies" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT;

UPDATE "strategies" s
SET "user_id" = u."id"
FROM "advisors" a
JOIN "users" u ON u."auth_user_id" = a."user_id"
WHERE s."advisor_id" = a."id";

-- Fails loudly if any strategy failed to find an owner, rather than leaving an
-- orphan that a later NOT NULL would reject with no explanation.
DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned FROM "strategies" WHERE "user_id" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % strategies have no owner in users', orphaned;
  END IF;
END $$;

ALTER TABLE "strategies" ALTER COLUMN "user_id" SET NOT NULL;
DROP INDEX IF EXISTS "strategies_advisor_id_idx";
ALTER TABLE "strategies" DROP COLUMN "advisor_id";
CREATE INDEX "strategies_user_id_idx" ON "strategies" ("user_id");

-- --- repoint portfolio_entries ----------------------------------------------

ALTER TABLE "portfolio_entries" ADD COLUMN "user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT;

UPDATE "portfolio_entries" p
SET "user_id" = u."id"
FROM "investors" i
JOIN "users" u ON u."auth_user_id" = i."user_id"
WHERE p."investor_id" = i."id";

DO $$
DECLARE orphaned int;
BEGIN
  SELECT count(*) INTO orphaned FROM "portfolio_entries" WHERE "user_id" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'MIGRATION ABORTED: % portfolio entries have no owner in users', orphaned;
  END IF;
END $$;

ALTER TABLE "portfolio_entries" ALTER COLUMN "user_id" SET NOT NULL;
DROP INDEX IF EXISTS "portfolio_entries_investor_id_idx";
ALTER TABLE "portfolio_entries" DROP COLUMN "investor_id";
CREATE INDEX "portfolio_entries_user_id_idx" ON "portfolio_entries" ("user_id");

-- --- drop the old personas --------------------------------------------------

DROP TABLE IF EXISTS "advisor_documents";
DROP TABLE IF EXISTS "advisors";
DROP TABLE IF EXISTS "investors";

DROP TYPE IF EXISTS "advisor_document_type";
DROP TYPE IF EXISTS "document_review_status";
DROP TYPE IF EXISTS "verification_status";
