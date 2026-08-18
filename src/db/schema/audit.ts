import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt } from "./_shared";
import { authUsers } from "./auth";

/**
 * APPEND ONLY.
 *
 * Who did what, to which entity, and what changed. Also records every read of
 * a KYC document, since those are PII served through signed URLs (W1-19).
 *
 * PAN, phone, DOB and document contents must never appear in `before` or
 * `after` — the same rule as logs, error messages and analytics events
 * (`x-wealth-product.md` §10). Record that a field changed, not its value.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    actorUserId: uuid("actor_user_id").references(() => authUsers.id),
    /** e.g. `advisor.verified`, `forward_test.abandoned`, `kyc_document.read`. */
    action: text("action").notNull(),
    entityTable: text("entity_table").notNull(),
    entityId: uuid("entity_id"),

    before: jsonb("before"),
    after: jsonb("after"),

    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityTable, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
