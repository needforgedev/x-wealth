CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "advisors_sebi_registration_no_key";--> statement-breakpoint
ALTER TABLE "advisors" ALTER COLUMN "sebi_registration_no" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_user_id_key" ON "platform_admins" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "advisors_sebi_registration_no_key" ON "advisors" USING btree ("sebi_registration_no") WHERE "advisors"."sebi_registration_no" is not null;--> statement-breakpoint

-- HAND-WRITTEN ADDITION (drizzle-kit does not emit CHECKs).
--
-- An advisor row now exists from sign-up, before KYC. These make the gate real
-- rather than conventional: the registration number is optional only while the
-- record is UNSUBMITTED, and a VERIFIED record must carry the timestamp that
-- says when and by whom. `x-wealth-product.md` §5.4 — the registration gate is
-- enforced, not documented.
ALTER TABLE "advisors"
  ADD CONSTRAINT "advisors_registration_required_once_submitted_ck" CHECK (
    verification_status = 'UNSUBMITTED' OR sebi_registration_no IS NOT NULL
  );
--> statement-breakpoint

ALTER TABLE "advisors"
  ADD CONSTRAINT "advisors_verified_has_timestamp_ck" CHECK (
    verification_status <> 'VERIFIED' OR verified_at IS NOT NULL
  );
