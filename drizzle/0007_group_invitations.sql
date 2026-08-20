CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "group_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_phone" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_investor_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_accepted_by_investor_id_investors_id_fk" FOREIGN KEY ("accepted_by_investor_id") REFERENCES "public"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_invitations_group_id_idx" ON "group_invitations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invitations_phone_idx" ON "group_invitations" USING btree ("invited_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "group_invitations_pending_key" ON "group_invitations" USING btree ("group_id","invited_phone") WHERE "group_invitations"."status" = 'PENDING';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Hand-written constraints for this migration.
--
-- As in 0006: everything above is drizzle-kit output, and the parts that
-- actually hold the invariants are written here.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. group_invitations — E.164, and a one-way life
-- ===========================================================================

-- Stored with the leading +. `auth.users.phone` has no +, so matching the two
-- goes through `supabasePhone()` — see src/domain/phone.ts.
ALTER TABLE "group_invitations"
  ADD CONSTRAINT "group_invitations_phone_e164_ck"
  CHECK (invited_phone ~ '^\+[1-9][0-9]{7,14}$');
--> statement-breakpoint

-- A terminal invitation says how it ended, and a live one does not pretend to.
ALTER TABLE "group_invitations"
  ADD CONSTRAINT "group_invitations_terminal_state_ck" CHECK (
    (status = 'PENDING'  AND accepted_at IS NULL AND accepted_by_investor_id IS NULL AND revoked_at IS NULL)
    OR
    (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_investor_id IS NOT NULL AND revoked_at IS NULL)
    OR
    (status = 'REVOKED'  AND accepted_at IS NULL AND accepted_by_investor_id IS NULL AND revoked_at IS NOT NULL)
  );
--> statement-breakpoint

/*
 * PENDING -> ACCEPTED | REVOKED, and nothing else, ever.
 *
 * Without this, an invitation could be moved back to PENDING, which is a
 * private group that can be re-entered after the advisor closed the door. The
 * group it points at cannot change either — that would silently redirect an
 * accepted invitation at a different audience.
 */
CREATE OR REPLACE FUNCTION enforce_invitation_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'PENDING' THEN
      RAISE EXCEPTION 'group_invitations: % is final and cannot become %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('ACCEPTED', 'REVOKED') THEN
      RAISE EXCEPTION 'group_invitations: illegal status transition % -> %.', OLD.status, NEW.status
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.invited_phone IS DISTINCT FROM OLD.invited_phone
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'group_invitations: an invitation cannot be repointed after it is issued.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER group_invitations_lifecycle
  BEFORE UPDATE ON "group_invitations"
  FOR EACH ROW EXECUTE FUNCTION enforce_invitation_lifecycle();
--> statement-breakpoint


-- ===========================================================================
-- 2. signals — an amendment chain, not a tree
--
-- `amends_signal_id` has existed since 0000 and nothing wrote to it until now.
-- Two amendments of the same call would leave a reader with two contradictory
-- "current" versions and no rule for choosing. One correction per call, and
-- correcting the correction means amending the amendment.
-- ===========================================================================

CREATE UNIQUE INDEX "signals_one_amendment_per_call_key"
  ON "signals" ("amends_signal_id")
  WHERE "amends_signal_id" IS NOT NULL;
--> statement-breakpoint

-- An amendment stays inside the group and the strategy it corrects. Without
-- this an "amendment" could quietly become an unrelated call wearing the
-- history of the one it points at.
CREATE OR REPLACE FUNCTION enforce_amendment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  original RECORD;
BEGIN
  IF NEW.amends_signal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT group_id, strategy_id, symbol, side INTO original
    FROM signals WHERE id = NEW.amends_signal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signals: cannot amend a call that does not exist.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.group_id    IS DISTINCT FROM original.group_id
     OR NEW.strategy_id IS DISTINCT FROM original.strategy_id
     OR NEW.symbol   IS DISTINCT FROM original.symbol
     OR NEW.side     IS DISTINCT FROM original.side THEN
    RAISE EXCEPTION
      'signals: an amendment must keep the group, strategy, instrument and side of the call it amends.'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER signals_amendment_scope
  BEFORE INSERT ON "signals"
  FOR EACH ROW EXECUTE FUNCTION enforce_amendment_scope();
--> statement-breakpoint

SELECT assert_no_soft_delete_columns();
