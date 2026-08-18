import { date, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { createdAt, price, symbol, timestampTz } from "./_shared";
import { signals } from "./distribution";
import { investors } from "./investors";

/**
 * Manually entered holdings. There is no broker integration and no order
 * placement — if one is ever added it is read-only (`x-wealth-product.md`
 * §5.8).
 *
 * `source_signal_id` links an investor's actual trade back to the signal that
 * prompted it. It is how we measure real-world outcome versus paper outcome,
 * and it is the single most valuable dataset this platform will generate.
 * **Do not drop it** (`x-wealth-product.md` §6).
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

    /** Nullable — an investor may trade without a signal behind it. */
    sourceSignalId: uuid("source_signal_id").references(() => signals.id),

    createdAt: createdAt(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("portfolio_entries_investor_id_idx").on(t.investorId),
    index("portfolio_entries_source_signal_id_idx").on(t.sourceSignalId),
  ],
);
