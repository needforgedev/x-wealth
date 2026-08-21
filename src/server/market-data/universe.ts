import { priceFromString, type PriceTicks } from "../../domain/money";
import type { InstrumentKind } from "../../domain/market-data";
import { toSymbol, type Symbol_ } from "../../domain/symbol";
import { UPSTOX_SOURCE } from "./upstox";

/**
 * The instruments we carry price history for.
 *
 * Six, deliberately. Small enough that gate G4 — twenty trades hand-calculated
 * and matched to the paisa — stays a thing a person can actually do, and wide
 * enough to exercise both paths the engine has: a cash equity you can trade and
 * a spot index you cannot.
 *
 * ## Why not the derivatives on these underlyings
 *
 * The original shortlist was index and stock F&O. Backtesting an option means
 * reading contracts that have since expired, and Upstox puts expired-contract
 * history behind the paid Plus plan (`UDAPI1149`) with a reported six-month
 * ceiling even there. Beyond the vendor, `paper_trades` has no strike, no
 * expiry and no underlying, so a derivative could not be recorded even if the
 * data arrived. Both are real work, not a config change — hence spot first.
 */

export type UniverseEntry = {
  readonly symbol: Symbol_;
  readonly name: string;
  readonly kind: InstrumentKind;
  readonly lotSize: number;
  readonly tickSize: PriceTicks;
  readonly vendor: string;
  /** Upstox's own identifier. ISIN-based for equities, so it survives renames. */
  readonly vendorKey: string;
  readonly isin: string | null;
};

/**
 * ₹0.01 — the finest increment actually observed in Upstox's own data for these
 * names.
 *
 * Not read from the instrument master. That file reports `tick_size: 10.0` for
 * RELIANCE, and the unit is undocumented: read as paise it implies ₹0.10, which
 * one-minute candles for the same instrument contradict by quoting to the
 * paisa. Rather than guess a convention, this is set from what the price series
 * demonstrably contains.
 *
 * Erring fine is the safe direction. A tick that is too fine never rejects a
 * price the exchange really printed; one that is too coarse silently declares
 * real prices invalid. Nothing consumes this yet — it starts to matter at
 * W6-05 (fill realism), and the unit question should be settled with Upstox
 * before it does.
 */
const OBSERVED_TICK: PriceTicks = priceFromString("0.01");

/**
 * An index has no tick size, because it has no orders.
 *
 * The column is NOT NULL and positive, so something has to go here; this is the
 * precision the value is quoted at, which is a display fact rather than a
 * trading one. `kind: "INDEX"` is what actually stops anyone treating it as
 * tradeable — see `isTradeable` in `src/domain/market-data.ts`.
 */
const INDEX_QUOTE_PRECISION: PriceTicks = priceFromString("0.01");

export const UNIVERSE: readonly UniverseEntry[] = [
  {
    symbol: toSymbol("NSE:RELIANCE"),
    name: "Reliance Industries",
    kind: "EQUITY",
    lotSize: 1,
    tickSize: OBSERVED_TICK,
    vendor: UPSTOX_SOURCE,
    vendorKey: "NSE_EQ|INE002A01018",
    isin: "INE002A01018",
  },
  {
    symbol: toSymbol("NSE:TCS"),
    name: "Tata Consultancy Services",
    kind: "EQUITY",
    lotSize: 1,
    tickSize: OBSERVED_TICK,
    vendor: UPSTOX_SOURCE,
    vendorKey: "NSE_EQ|INE467B01029",
    isin: "INE467B01029",
  },
  {
    symbol: toSymbol("NSE:NIFTY50"),
    name: "Nifty 50",
    kind: "INDEX",
    lotSize: 1,
    tickSize: INDEX_QUOTE_PRECISION,
    vendor: UPSTOX_SOURCE,
    vendorKey: "NSE_INDEX|Nifty 50",
    isin: null,
  },
  {
    symbol: toSymbol("NSE:BANKNIFTY"),
    name: "Nifty Bank",
    kind: "INDEX",
    lotSize: 1,
    tickSize: INDEX_QUOTE_PRECISION,
    vendor: UPSTOX_SOURCE,
    vendorKey: "NSE_INDEX|Nifty Bank",
    isin: null,
  },
  {
    symbol: toSymbol("NSE:MIDCPNIFTY"),
    name: "Nifty Midcap Select",
    kind: "INDEX",
    lotSize: 1,
    tickSize: INDEX_QUOTE_PRECISION,
    vendor: UPSTOX_SOURCE,
    // Upstox's key for Midcap Select does not match its display name. Taken
    // verbatim from the instrument master; do not "correct" it to MIDCPNIFTY.
    vendorKey: "NSE_INDEX|NIFTY MID SELECT",
    isin: null,
  },
  {
    symbol: toSymbol("BSE:SENSEX"),
    name: "BSE Sensex",
    kind: "INDEX",
    lotSize: 1,
    tickSize: INDEX_QUOTE_PRECISION,
    vendor: UPSTOX_SOURCE,
    vendorKey: "BSE_INDEX|SENSEX",
    isin: null,
  },
];

export function universeEntry(symbol: Symbol_): UniverseEntry {
  const entry = UNIVERSE.find((i) => i.symbol === symbol);
  if (!entry) throw new Error(`${symbol} is not in the loaded universe`);
  return entry;
}
