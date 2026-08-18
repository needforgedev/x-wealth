# X-Wealth — Project Context

> Read this fully before writing any code. This file explains what we are building, the
> domain it operates in, and a set of hard invariants that are non-negotiable.
> Several of those invariants will look like missing features or incomplete CRUD.
> They are intentional. Do not "fix" them.

---

## 1. What this is, in one paragraph

X-Wealth is a two-sided platform for the **Indian stock market**. On one side,
SEBI-registered Research Analysts ("advisors") build rule-based trading strategies,
backtest them on historical data, then run them forward on a paper-trading engine with
simulated money. Every test is permanently recorded, including failures. On the other
side, retail investors browse the resulting track records, subscribe to an advisor's
group, and receive trade signals (entry, exit, stop-loss). The platform never gives
advice, never executes trades, and never holds anyone's money. It is infrastructure:
a strategy lab, an immutable performance ledger, and a distribution layer.

The product's entire value proposition is **honest track records**. Every competing
Indian platform sells on backtests, which are trivially gameable. We sell forward-tested
performance with full disclosure of what didn't work. If you ever find yourself building
something that lets a bad result disappear, you have broken the product.

---

## 2. Domain glossary

The team building this may not be familiar with Indian market specifics. Reference:

| Term | Meaning |
|---|---|
| **SEBI** | Securities and Exchange Board of India. The market regulator. |
| **RA** | Research Analyst. SEBI-registered; legally permitted to publish buy/sell recommendations. Our advisors must hold this. |
| **RIA / IA** | Investment Adviser. Registered for *personalised* advice. Different licence. We are not building for this. |
| **RAASB** | Research Analyst Administration and Supervisory Body. Operated by BSE. RAs enlist here and get an enlistment number. |
| **PaRRVA** | Past Risk and Return Verification Agency. Live since 4 May 2026. CARE Ratings is the agency; NSE is the data centre. Independently verifies performance claims by RAs, IAs and algo providers. **We are not PaRRVA and must never behave like it.** |
| **NSE / BSE** | The two Indian stock exchanges. |
| **Nifty 50 / Bank Nifty** | Major Indian equity indices. Bank Nifty is the banking sector index and is heavily traded. |
| **F&O** | Futures and Options (derivatives). |
| **OHLCV** | Open, High, Low, Close, Volume — the standard candle format. Our backtest input. |
| **LTP** | Last Traded Price. |
| **STT** | Securities Transaction Tax. A statutory cost on every trade. |
| **Demat** | Dematerialised securities account, held at CDSL or NSDL under the investor's PAN. Securities live here, not with us. |
| **Intraday** | Positions opened and closed the same session. |
| **Positional / Swing** | Positions held across multiple sessions. |
| **Lot size** | Derivatives trade in fixed lots, not arbitrary quantities. |
| **Circuit limit** | Price bands beyond which a stock cannot trade in a session. Affects fill realism. |
| **Market hours** | 09:15–15:30 IST, Monday–Friday, excluding exchange holidays. **There is no 24/7 trading.** |

---

## 3. The two personas

### Advisor
A SEBI-registered Research Analyst, individual or firm. Comes to the platform to prove a
strategy works and then monetise it. Their identity must be verified against their SEBI
registration before they can publish anything.

### Investor
Retail participant, typically ₹50k–₹10L portfolio, some market literacy. Comes to find a
signal provider who isn't lying to them. Receives signals; acts on them in their own
broker account, entirely outside our system.

---

## 4. The core loop

This is the product. Build in this order and do not reorder.

```
1. Advisor completes SEBI verification          → gated: nothing works until verified
2. Advisor authors a strategy                   → rule-based: indicators, conditions, actions
3. Backtest on historical OHLCV                 → costs mandatory, no lookahead
4. Advisor declares hypothesis + locks params   → immutable from this point
5. Forward paper-trade for a fixed window       → simulated capital, real market data
6. AI produces a critique of the results        → analysis only, never edits the strategy
7. Advisor decides: publish / revise / abandon  → all three outcomes recorded permanently
8. Published strategy appears with FULL record  → including every prior failed attempt
9. Investors subscribe to a group               → tiered, paid or free
10. Signals delivered against the live strategy → entry, exit, stop-loss, rationale
```

### Two things this loop deliberately does NOT do

**The AI does not modify strategies.** It critiques. The advisor decides what to change.
If our model authors part of a strategy, we become a co-author of the investment
recommendation and lose our position as a neutral infrastructure provider. This is a
legal boundary, not a design preference. Implement the AI as read-only analysis that
returns structured findings. Never write model output back into a strategy definition.

**There is no pass/fail threshold and no "verified" badge.** An earlier version of this
spec had the AI iterate a strategy until it cleared a success threshold, then publish it
with that badge. That is statistically invalid — iterating until something passes is
selection on noise, and publishing only the survivors is cherry-picking. It is also
legally hazardous, because grading performance is PaRRVA's job. We publish the complete
record and let investors judge. Do not add scoring, ranking-by-quality, star ratings,
or any platform-generated verdict on a strategy.

---

## 5. Hard invariants

These are engineering constraints. Encode them in the schema and the API, not in docs.
Anything relying on developer discipline will eventually be violated.

### 5.1 Append-only performance history
- `strategy_versions`, `backtest_runs`, `forward_tests` and `signals` are **append-only**
- No DELETE endpoints on any of these tables
- No UPDATE on any field that affects a recorded result
- Soft-delete is also forbidden — there is no `deleted_at`, no `is_archived`, no
  `visible` flag that would let a bad run be hidden
- Corrections happen by appending a new record that references the old one

### 5.2 Parameter immutability during a forward test
- Once a forward test moves to `RUNNING`, its `strategy_version_id` is frozen
- Any parameter change requires abandoning the current test and starting a new one
- The abandoned test remains permanently visible
- Enforce at the DB level (constraint or trigger), not in application logic

### 5.3 Costs are never optional
Every performance figure — backtest or forward test — must be net of:
brokerage, STT, stamp duty, exchange transaction charges, SEBI turnover fee, GST,
and a stated slippage assumption.

There must be **no code path that produces a gross-return figure.** Do not add a
`include_costs: boolean` parameter. Costs are structural.

### 5.4 Registration gate
- No strategy publication, group creation, signal issuance, or fee collection without
  a verified, currently-valid SEBI registration on the advisor record
- Registration has an expiry; a lapse auto-suspends publishing capability
- Middleware-level check, not per-endpoint

### 5.5 Signals are immutable once published
- No edit, no delete, no backdating
- `published_at` is server-generated, never client-supplied
- Amendments are new signal records linked via `amends_signal_id`

### 5.6 No platform-authored performance claims
The platform reports what happened. It never characterises it. No copy anywhere in the
product that says a strategy is "good", "verified", "high-performing", "top-rated", or
similar. No hardcoded return figures in marketing surfaces. No comparisons to named
funds or benchmarks generated by us.

### 5.7 AI interactions are fully logged
Every AI critique call persists: input snapshot, model output, timestamp, and whether
the advisor subsequently changed anything. This log is the evidence that the human
authored the strategy, not us.

### 5.8 No money, no execution, no custody
- We never hold investor funds or securities
- We never place orders with any broker
- Portfolio tracking is manual entry by the investor, or read-only if a broker
  integration is added later
- Do not add order placement, wallet, or custody features under any framing

---

## 6. Data model

Core entities. Field lists are indicative, not exhaustive.

```
advisors
  id, user_id, sebi_registration_no, raasb_enlistment_no, firm_name, mca_no,
  registration_valid_until, verification_status, verified_at, pan (encrypted)

advisor_documents
  id, advisor_id, doc_type, storage_ref, uploaded_at, review_status

strategies
  id, advisor_id, name, description, segment, instruments[], timeframe,
  created_at, current_version_id

strategy_versions            -- APPEND ONLY
  id, strategy_id, version_no, definition (jsonb), hypothesis_text,
  created_at, parent_version_id

backtest_runs                -- APPEND ONLY
  id, strategy_version_id, period_start, period_end, initial_capital,
  cost_model (jsonb), results (jsonb), created_at

forward_tests                -- APPEND ONLY
  id, strategy_version_id, status, declared_hypothesis, started_at,
  planned_end_at, ended_at, outcome,       -- COMPLETED | ABANDONED
  initial_capital, cost_model (jsonb)
  -- strategy_version_id is FROZEN once status = RUNNING

paper_trades                 -- APPEND ONLY
  id, forward_test_id, symbol, side, qty, entry_price, entry_at,
  exit_price, exit_at, gross_pnl, costs_breakdown (jsonb), net_pnl

ai_critiques                 -- APPEND ONLY
  id, forward_test_id, input_snapshot (jsonb), findings (jsonb),
  created_at, advisor_acted (bool), resulting_version_id

groups
  id, advisor_id, name, description, visibility, segment,
  linked_strategy_id, created_at

pricing_tiers
  id, group_id, name, price_paise, billing_period, signal_quota

subscriptions
  id, investor_id, group_id, tier_id, status, started_at, ends_at

signals                      -- APPEND ONLY, IMMUTABLE
  id, group_id, strategy_id, symbol, side, entry_price, exit_price,
  stop_loss, timeframe, valid_from, valid_until, rationale,
  risk_profile, chart_ref, published_at, amends_signal_id

investors
  id, user_id, experience_level, interests[], risk_ack_at, suitability (jsonb)

portfolio_entries
  id, investor_id, symbol, qty, avg_price, transaction_date,
  source_signal_id (nullable)
```

**Note on `source_signal_id`:** this links an investor's actual trade back to the signal
that prompted it. It is how we measure real-world outcome versus paper outcome — the
single most valuable dataset the platform will generate. Do not drop it.

---

## 7. Modules and current status

The UI for advisor and investor sections already exists, built from a Figma design.
Reuse it. Do not redesign.

| Module | UI | Logic | Notes |
|---|---|---|---|
| Advisor onboarding + SEBI KYC | Built | **Build next** | Highest priority — gates everything |
| Investor onboarding | Built | **Build next** | OTP, profile, experience, interests |
| Strategy builder | Not built | Build | Rule-based, no-code |
| Backtest engine | Not built | Build | Historical OHLCV |
| Forward test console | Not built | Build | The core differentiator |
| AI critique layer | Not built | Build | Read-only analysis |
| Iteration ledger | Not built | Build | Public failure history |
| Signal composer | Built | Build | Fields exist in design |
| Groups + subscriptions | Built | Build | Tiers, join, manage |
| Strategy discovery | Not built | Build | Browse, sort on recorded metrics only |
| Portfolio | Built | Build | Manual entry |
| Advisor dashboard | Built | Build | Members, revenue, drafts, views |

---

## 8. Do NOT build

Claude Code will helpfully suggest several of these. Refuse them.

- **Order execution or broker order placement.** Turns us into a regulated algo provider
  requiring exchange empanelment and broker partnership. Not in scope.
- **Any wallet, fund custody, or money-holding feature.**
- **Leverage, margin, or derivatives position simulation beyond basic F&O paper trades.**
- **Strategy scoring, star ratings, quality badges, or "verified" marks.**
- **Auto-applying AI suggestions to a strategy definition.**
- **Delete or hide functionality on any performance record.**
- **Free-form group chat.** Unmonitored channel where an advisor can say anything.
  Announcements only in v1.
- **Leaderboards ranked by returns.** Ranking by return is a performance claim.
- **Copy-trading with automatic execution.**
- **Anything involving crypto.**
- **Hardcoded return figures anywhere in the product** — including seed data, demo
  content, and marketing copy. Use obviously-fake placeholder values in fixtures.

---

## 9. Blocked decisions

Do not guess at these. Ask before building anything that depends on them.

1. **Market data source and latency.** SEBI restricts sharing real-time price data with
   third parties, and revised rules (effective 1 July 2026) impose a 30-day lag for
   educational use. Whether our forward-test engine can use real-time data is an
   unresolved legal question. **Build the data layer behind an interface so the
   implementation can swap between real-time, delayed, and end-of-day without touching
   the engine.** If forced to end-of-day, intraday strategies are out of scope and only
   positional strategies are supported.
2. **Minimum forward-test window.** Needs statistical justification, not a guess.
   Placeholder: 60 trading sessions. Make it configurable.
3. **PaRRVA data format.** Performance records should be structured for eventual export
   to PaRRVA. Exact schema unconfirmed — keep the results payload flexible.
4. **Revenue model.** Whether we take a percentage of advisor subscription revenue or
   charge advisors a flat SaaS fee is undecided. Build billing so both are possible.

---

## 10. Technical notes

- **Timezone is IST throughout.** Market sessions are 09:15–15:30 IST. Store UTC,
  display IST, and never assume a 24-hour market.
- **Exchange holiday calendar** is required for any date arithmetic on sessions.
- **Money in paise** (integer). No floats for currency, ever.
- **Prices** as fixed-precision decimals, not floats.
- **Lot sizes** apply to derivatives — quantity is not arbitrary.
- **Symbols** need exchange qualification (`NSE:RELIANCE` vs `BSE:RELIANCE`).
- **Corporate actions** (splits, bonuses, dividends) break historical price series.
  Backtests must use adjusted data or explicitly document that they don't.
- **PII** — PAN, phone, DOB, uploaded documents — encrypted at rest, access-logged.
  Never in logs, never in error messages, never in analytics events.

---

## 11. What "done" looks like for the first milestone

A SEBI-registered advisor can:
1. Sign up, submit registration details and documents, get verified
2. Author a rule-based strategy
3. Backtest it against historical data with full costs
4. Declare a hypothesis, lock parameters, start a forward test
5. Watch it run to completion on paper
6. Receive an AI critique of the result
7. See the test — pass or fail — permanently on their profile

No investors, no groups, no money. If that works and advisors want it, everything
downstream is an execution problem. If they don't, nothing downstream matters.
