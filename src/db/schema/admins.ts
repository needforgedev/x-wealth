import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt } from "./_shared";
import { authUsers } from "./auth";

/**
 * Platform ops — the third persona in PRD §3. Verifies registrations, polices
 * disclosure, runs the rails.
 *
 * Membership of this table is the whole authorisation model for admin actions.
 * It deliberately lives in our own schema rather than in a JWT claim: role
 * checks happen server-side in middleware against this table, so there is no
 * claim to forge and no Auth Admin API call needed to grant or revoke access
 * (see W1-22).
 *
 * Rows are created out of band — there is no self-serve path to becoming an
 * admin, and there should never be one.
 */
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    /** Who granted this and why — the audit log records the rest. */
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_admins_user_id_key").on(t.userId)],
);
