import { date, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { createdAt, price, symbol, timestampTz } from "./_shared";
import { investors } from "./investors";

/**
 * Manually entered holdings. There is no broker integration and no order
 * placement — if one is ever added it is read-only.
 *
 * ## `source_signal_id` was dropped in 0009, against the v1 instruction
 *
 * The comment here used to say **do not drop it**: the column linked an
 * investor's real trade back to the advisor signal that prompted it, and the v1
 * spec called it the single most valuable dataset the platform would generate.
 * That was true of the product it described.
 *
 * v2 has no advisor and no signal to be prompted by — cross-user distribution
 * is what `CLAUDE.md` §8.5 prohibits. The measurement survives and gets sharper:
 * execution-gap analysis (§7.12, W21) compares what a trader's **own** strategy
 * signalled against what they actually did, via `signal_events` and
 * `execution_records`. Same question, one user, no regulatory surface.
 *
 * So this is a deliberate reversal of a load-bearing v1 instruction, not an
 * oversight. Do not restore the column — build W21 instead.
 */
export const portfolioEntries = pgTable(
  "portfolio_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "restrict" }),

    symbol: symbol().notNull(),
    qty: integer("qty").notNull(),
    avgPrice: price("avg_price").notNull(),
    transactionDate: date("transaction_date").notNull(),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("portfolio_entries_investor_id_idx").on(t.investorId),
  ],
);
