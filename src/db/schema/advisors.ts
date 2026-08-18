import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  advisorDocumentType,
  createdAt,
  documentReviewStatus,
  timestampTz,
  verificationStatus,
} from "./_shared";
import { authUsers } from "./auth";

/**
 * A SEBI-registered Research Analyst.
 *
 * `verification_status` and `registration_valid_until` together drive the
 * registration gate (`x-wealth-product.md` §5.4): no strategy publication, no
 * group creation, no signal issuance and no fee collection without a verified,
 * currently-valid registration. The gate is checked in middleware, not
 * per-endpoint, and a lapse auto-suspends publishing.
 */
export const advisors = pgTable(
  "advisors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),

    sebiRegistrationNo: text("sebi_registration_no").notNull(),
    raasbEnlistmentNo: text("raasb_enlistment_no"),
    firmName: text("firm_name"),
    mcaNo: text("mca_no"),

    /**
     * Encrypted at rest via pgcrypto — never selected into logs, error messages
     * or analytics events (`x-wealth-product.md` §10). Stored as ciphertext
     * bytes in a text column; the application never writes plaintext here.
     */
    panEncrypted: text("pan_encrypted"),

    registrationValidUntil: timestampTz("registration_valid_until"),
    verificationStatus: verificationStatus("verification_status").notNull().default("UNSUBMITTED"),
    verifiedAt: timestampTz("verified_at"),
    /** Admin who approved. Manual review is deliberate in v1 (W2-03). */
    verifiedByUserId: uuid("verified_by_user_id").references(() => authUsers.id),

    /**
     * PaRRVA verification is prospective-only — it runs from the opt-in date
     * forward. Advisors must be pushed to opt in before their first forward
     * test or the record is worthless for marketing (PRD §7).
     */
    parrvaOptedInAt: timestampTz("parrva_opted_in_at"),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("advisors_user_id_key").on(t.userId),
    uniqueIndex("advisors_sebi_registration_no_key").on(t.sebiRegistrationNo),
    index("advisors_verification_status_idx").on(t.verificationStatus),
  ],
);

/**
 * KYC documents. `storage_ref` points at a private Supabase Storage object —
 * served only through short-lived signed URLs, with every read written to the
 * audit log (W1-19).
 */
export const advisorDocuments = pgTable(
  "advisor_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    advisorId: uuid("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "restrict" }),

    docType: advisorDocumentType("doc_type").notNull(),
    storageRef: text("storage_ref").notNull(),
    uploadedAt: timestampTz("uploaded_at").notNull().defaultNow(),

    reviewStatus: documentReviewStatus("review_status").notNull().default("PENDING"),
    reviewedAt: timestampTz("reviewed_at"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => authUsers.id),
    reviewNote: text("review_note"),
  },
  (t) => [index("advisor_documents_advisor_id_idx").on(t.advisorId)],
);
