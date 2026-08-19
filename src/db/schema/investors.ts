import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, experienceLevel, timestampTz } from "./_shared";
import { authUsers } from "./auth";

/**
 * Retail participant. Acts on signals in their own broker account, entirely
 * outside this system — we never hold funds or securities and never place an
 * order (`x-wealth-product.md` §5.8).
 */
export const investors = pgTable(
  "investors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),

    /** Collected on Complete Profile. Null until then, as for advisors. */
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),

    experienceLevel: experienceLevel("experience_level"),
    interests: text("interests").array(),

    /**
     * Mandatory risk-disclosure acknowledgement (PRD §5.9). Null means the
     * investor has not acknowledged and cannot subscribe.
     */
    riskAckAt: timestampTz("risk_ack_at"),
    suitability: jsonb("suitability"),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("investors_user_id_key").on(t.userId)],
);
