# X-Wealth — Project Context (v2)

> **Read this fully before writing any code.** This replaces all earlier project context.
> Several constraints below will look like missing features or incomplete CRUD. They are
> intentional and load-bearing. Do not "fix" them.
>
> **If you encounter older artifacts** — a Figma file with advisor/investor screens, a PRD
> describing a signals marketplace, groups and subscriptions — those describe a previous
> direction that was abandoned. See §2. This document is the source of truth.

---

# 1. What this is

X-Wealth is an **AI-powered strategy lab for Indian retail traders.**

A user describes a trading idea in plain English. The AI compiles it into an executable
rule set. An adversarial backtest engine attacks it against historical data with realistic
Indian costs. The user then declares a hypothesis, locks the parameters, and runs a
forward test on paper against live market data. Afterwards, an AI post-mortem explains
what happened and why. Every iteration — including every failure — is permanently
recorded.

Once a broker partnership is in place, the user can run the strategy live on their own
Zerodha/Upstox/Dhan account, under their own API credentials, below the 10 orders-per-
second retail threshold.

**The platform charges a subscription for the tooling.** It never holds funds, never
distributes recommendations, and never forms a view on any security.

## The product's actual thesis

Every competing tool lets you tune a strategy until the backtest looks good. That is
statistically invalid — iterate enough variants against the same history and some will
pass by chance alone.

X-Wealth is the tool that **won't let you lie to yourself.** Locked parameters. Forward
tests that must run to completion. Failures on the permanent record. That discipline layer
is the entire differentiator. Every design decision that weakens it weakens the product.

---

# 2. What this is NOT

This project went through two abandoned directions. Both will look attractive if you
reason from first principles about "a strategy platform." Both are dead.

### ✗ Not a signals marketplace with SEBI-registered advisors
Earlier direction: registered Research Analysts publish strategies, retail investors
subscribe to groups, platform takes a cut. Abandoned — it made the platform a distribution
channel for investment recommendations, with all the registration, performance-verification
and revenue-share problems that follow.

### ✗ Not a user-generated strategy marketplace
Users cannot publish strategies to other users. This is **legally prohibited**, not merely
risky: under SEBI's retail algo framework, an algo developed by a retail investor may be
used only by that investor and immediate family (spouse, dependent children, dependent
parents). It cannot be sold, rented, shared or distributed. Not for money, not for free.

**Do not build sharing, publishing, marketplace, copy-trading, leaderboards, or any
feature that lets one user's strategy or signals reach another user.**

### ✗ Not an investment manager
We never hold client funds. We never decide what to buy. Money flows user's bank → user's
broker → exchange, and we are not a node in that chain. Holding funds and exercising
discretion is portfolio management, which requires a SEBI PMS licence and is a different
company.

---

# 3. Legal architecture — why the constraints exist

Read this section. It explains why several features are shaped oddly, and it will stop you
from "improving" the product into an enforcement action.

## The load-bearing distinction: tool vs publication

**A tool** helps a user do something for themselves. They build a strategy, they test it,
they see their own results. Nothing reaches anyone else. We charge for compute, features
and capability. This is software.

**A publication** distributes a recommendation from one party to others. Entry, exit,
stop-loss, delivered to someone who didn't author it. This is research under SEBI's
Research Analyst regulations — regardless of whether a human, a model, or a coin flip
produced it.

**We are a tool. Strategies stay private to their creator. Full stop.**

The moment one user can see another user's strategy or signals, we become a publisher of
investment recommendations, and the entire compliance structure collapses.

## Four facts that shape the build

**1. Freemium does not exempt us.** "Consideration" under the RA regulations means any
form of economic benefit including non-cash benefit. A subscription is consideration.
Therefore: **we charge for the tool, never for access to what a strategy says to buy.**
Same price, same UI — but "₹X/month for unlimited backtests" is software, and "₹X/month to
see the top strategies" is publishing.

**2. "The AI did it" is not a defence.** SEBI's Intermediaries (Amendment) Regulations,
2025 inserted Regulation 16C, in force since 10 February 2025: any regulated person using
AI/ML tools — in-house or third-party — is *solely responsible* for the output.
Consequently: the AI compiles the user's idea; it never authors a view. Every AI
interaction is logged with input, output, and whether the user acted on it. That log is
the evidence of authorship.

**3. Below 10 OPS, the user needs no registration.** SEBI's retail algo framework sets a
threshold of 10 orders per second per exchange per client. Below it, a retail trader
running their own strategy on their own account is a regular API user requiring no
registration. Rule-based retail strategies fire a handful of orders per day. **This is the
doorway that makes live execution possible.**

**4. A broker partnership solves three problems simultaneously.** The framework requires
algo providers to operate through a broker in a principal-agent relationship. That single
relationship also resolves real-time market data legality (data arrives through an
authorised integration rather than third-party redistribution) and replaces per-user
API fees with platform-level economics. This is the arrangement Streak, Sensibull and
smallcase operate under.

## The one unresolved question

**Does an AI-generated strategy count as "developed by the retail investor"?**

The framework's permissive treatment applies to algos the investor developed. Our pitch is
that the AI compiles it. If a regulator reads that as *us* developing and distributing
algos, we are an algo provider requiring exchange empanelment rather than a tool.

Working assumption: empanelment will be required, which is a far lower bar than RA
registration and comes bundled with the broker partnership. **Do not build anything that
depends on the opposite answer.**

---

# 4. Domain glossary

| Term | Meaning |
|---|---|
| **SEBI** | Securities and Exchange Board of India. The market regulator. |
| **RA** | Research Analyst. SEBI-registered; may publish recommendations. **We are not one and must not act as one.** |
| **PMS** | Portfolio Management Service. Requires a licence to manage client money. Not us. |
| **OPS** | Orders Per Second. Threshold of 10 separates "API user" from "algo trader". |
| **White box / Black box** | Whether a strategy's logic is disclosed. Black box distribution requires RA registration. Our users' own strategies are white box to them by definition. |
| **NSE / BSE** | The two Indian stock exchanges. |
| **Nifty 50 / Bank Nifty** | Major Indian indices. Bank Nifty is heavily traded. |
| **F&O** | Futures and Options. Trade in fixed lots, not arbitrary quantities. |
| **OHLCV** | Open, High, Low, Close, Volume — the candle format. |
| **LTP** | Last Traded Price. |
| **STT** | Securities Transaction Tax. Statutory cost on every trade. |
| **Demat** | Securities account at CDSL/NSDL under the user's PAN. Securities live here, never with us. |
| **Kite Connect** | Zerodha's broker API. ₹500/month paid tier includes live + historical data. |
| **Circuit limit** | Daily price band beyond which a stock cannot trade. A stop cannot fill in a locked stock. |
| **Market hours** | 09:15–15:30 IST, Mon–Fri, excluding exchange holidays. **No 24/7 trading.** |
| **R** | The unit of risk on a trade — distance from entry to stop. A 3R win = 3× the risked amount. |
| **Expectancy** | (Win% × AvgWin) − (Loss% × AvgLoss). The only performance number that matters. |

---

# 5. The core loop

```
1. RESEARCH    User articulates a falsifiable hypothesis; AI helps sharpen it
2. COMPILE     AI translates the idea into a structured rule set
3. BACKTEST    Adversarial suite attacks it against history, net of all costs
4. LOCK        User declares hypothesis; parameters freeze
5. FORWARD     Paper test on live data for a fixed minimum window
6. POST-MORTEM AI critiques the result; explains gaps
7. DECIDE      Take live / revise / abandon — all three recorded permanently
8. LIVE        (Stage 2) Runs on user's own broker account
9. REVIEW      Ongoing digests, decay alerts, execution-gap analysis
```

## The constraint that makes this valid

**The loop cannot be closed without passing through forward data.**

```
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  ▼                                                  │
RESEARCH → COMPILE → BACKTEST → LOCK → FORWARD → LIVE ┘
                        │                    ▲
                        └─── ✗ BLOCKED ──────┘
              cannot return to tuning without
              completing a forward window
```

If a user can tune → backtest → tune → backtest against the same history, that is
p-hacking. If each iteration passes through data that hadn't happened yet, each is
genuinely out-of-sample.

Enforce this in the state machine, not in documentation. A strategy version in `RUNNING`
cannot be modified — only abandoned and restarted.

---

# 6. Users

**Primary:** Indian retail trader with an existing broker account (Zerodha, Upstox, Dhan,
Fyers), typically ₹1L–₹50L capital, systematically inclined, cannot code. Currently either
trading discretionarily or wrestling with Streak/AlgoTest/TradingView.

**Not building for:** institutions, fund managers, HFT, or anyone wanting managed money.

---

# 7. Modules

| # | Module | Status | Phase |
|---|---|---|---|
| 7.1 | Auth & account | UI exists | 0 |
| 7.2 | Hypothesis workbench | New | 2 |
| 7.3 | Strategy builder | New | 2 |
| 7.4 | Event awareness | New | 2 |
| 7.5 | Annotation layer | New | 2 |
| 7.6 | Backtest engine | New | 2 |
| 7.7 | Adversarial suite | New | 2 |
| 7.8 | Forward test console | New | 3 |
| 7.9 | Portfolio risk | New | 3 |
| 7.10 | Trigger proximity | New | 3 |
| 7.11 | AI critique layer | New | 4 |
| 7.12 | Execution gap analysis | New | 4 |
| 7.13 | Review cadence | New | 4 |
| 7.14 | Iteration ledger | New | 5 |
| 7.15 | Broker integration | New | 6 |

## 7.2 Hypothesis Workbench
AI helps the user articulate a **falsifiable** hypothesis, surfaces prior art, and
challenges the premise. It does not generate ideas from price data — scanning data for
patterns is p-hacking at the source.

Output: a written, timestamped hypothesis. This is the anchor record; the post-mortem is
meaningless without it.

## 7.3 Strategy Builder
Rule-based authoring. Natural language in, structured JSON out. **Six mandatory
components** — a strategy missing any of these cannot be saved:

1. Universe (with liquidity filter)
2. Entry condition
3. Exit condition / target
4. Stop-loss
5. Position sizing rule
6. Timeframe

Plus: max concurrent positions, max exposure, gap/circuit/holiday handling, long/short.

Position size derives from the stop: `size = (capital × risk%) ÷ (entry − stop)`.

## 7.4 Event Awareness
**Not a news feed.** Market events as rule primitives:
```
skip_entries_within(days_before, event_type)
flatten_positions_before(event_type)
no_new_positions_on(EXPIRY_DAY)
size_multiplier_during(event_window, multiplier)
```
Data: exchange holidays, F&O expiries, earnings dates, ex-dividend, splits, bonuses, RBI
policy dates, Budget, CPI/IIP releases.

Earnings dates get revised — store a `confirmed` flag and treat unconfirmed dates as soft,
or backtests inherit a subtle lookahead error.

## 7.5 Annotation Layer
Lets the user record *why* without altering *what*. Structured reason + free text,
attachable to signals, trades, tests, versions.

```
Skip reasons:     news event · didn't trust it · already exposed ·
                  insufficient capital · missed the window · other
Override reasons: sizing up on conviction · sizing down on uncertainty ·
                  early exit on fear · early exit on other information · other
```
Feeds 7.12 directly. Cheap to build; ship early.

## 7.6 Backtest Engine
Historical OHLCV simulation. Mandatory: brokerage, STT, stamp duty, exchange charges, SEBI
turnover fee, GST, slippage. Corporate-action-adjusted data.

**The intrabar problem is the biggest source of false results.** A candle with O=100
H=105 L=95 C=102 could have gone up-then-down or down-then-up. With entry 103 and stop 96,
those paths give opposite outcomes. Resolve using 1-minute data inside each bar. Where
unavailable, **always assume the stop hit before the target** — never the optimistic case.

Requires an adversarial test suite for lookahead bias. Intent is not sufficient.

## 7.7 Adversarial Backtest Suite
The AI's job is to break the strategy, not bless it:
- Walk-forward analysis
- Parameter sensitivity sweep (collapse at RSI-13 vs RSI-15 ⇒ fitted to noise)
- Regime slicing: bull / bear / sideways / high-vol / low-vol
- Monte Carlo on trade order (1,000+ shuffles)
- Cost sensitivity: at what slippage does the edge vanish?
- Out-of-sample holdout — **used exactly once, never re-tuned against**

Output: a written attack report ranked by severity.

## 7.8 Forward Test Console
Hypothesis declared, parameters frozen at DB level on `RUNNING`. Minimum window
configurable (placeholder 60 sessions). Realistic fills: slippage, liquidity caps,
circuit-limit handling, gap-through fills, no fills outside market hours, intraday square-
off before close. Abandonment allowed and permanently recorded.

## 7.9 Portfolio Risk
Per-strategy sizing does not protect against correlated positions. Four strategies all
long midcaps is one position, not four.

Compute: total capital at risk (sum of open R), aggregate exposure %, sector and index
concentration, correlation between held positions, overlapping symbols, margin headroom.

Circuit breakers, all **default ON**:
```
max_total_exposure_pct          60
max_concurrent_positions        10
max_aggregate_daily_loss_pct     3
max_single_symbol_exposure_pct  15
max_sector_exposure_pct         30
```
Breach → **new entries rejected** across all strategies. Existing positions continue to be
managed by their own stops. Log every rejection with reason.

## 7.10 Trigger Proximity — read-only
`Midcap Bounce · HDFCBANK · 3 of 5 conditions met · RSI 34.2 (needs < 30)`

**No order button. No "enter now." No size adjust. No strategy edit.** This is the feature
most likely to reintroduce discretionary trading — a user who watches proximity and acts
early has abandoned their strategy while believing they're following it. Default this view
OFF.

## 7.11 AI Critique Layer
Read-only analysis. **Never writes back to a strategy definition.**
- Overfitting signals: parameter count vs trade count, sensitivity, oddly specific values
- Sample adequacy: is n large enough to conclude anything?
- Regime dependence
- Liquidity feasibility at stated size
- Drawdown and tail-risk characterisation
- Plain-language explanation

Structured findings, not verdicts. Say *"42 trades is below the threshold for statistical
confidence at this win rate"* — never *"this strategy is weak."*

## 7.12 Execution Gap Analysis
**The most differentiated module.** Distance between what the strategy signalled and what
happened, attributed by cause: slippage, timing delay, skipped signals, size deviation,
early exit, late exit, manual override.

> Strategy returned 11.2%. Followed exactly: 19.4%. Of the 8.2 point gap — 4.1 to skipped
> signals (14 of 61, averaging +2.1R), 2.6 to slippage, 1.1 to early exits, 0.4 to sizing.

Stage 1 data: user marks taken/skipped, or imports broker tradebook. Stage 2: fills from
broker API.

Note: value is *highest* at Stage 1 and shrinks under automation. Design accordingly.

## 7.13 Review Cadence
Daily digest (~16:15 IST), weekly summary, and **strategy decay alerts.**

Decay alerts must distinguish **variance from breakage**, measured against the strategy's
own recorded distribution — drawdown beyond forward-test max, win rate outside CI, average
R degrading beyond expected variance, trade frequency materially changed.

**Silence must be a valid output:**
> "This drawdown is within the expected range for your historical distribution. No change
> indicated."

An alerting system that always finds something teaches users to overfit.

## 7.14 Iteration Ledger
Every version, every abandoned test, every failed window — permanently visible to the
user on their own profile. "12 forward tests run; 3 live, 9 abandoned."

## 7.15 Broker Integration (Stage 2)
User connects their own broker credentials. Orders route to the user's own account.

Constraints that are not negotiable:
- **Daily session logout.** API sessions must terminate before each trading day. Every
  user re-authenticates with 2FA every morning. **True set-and-forget is impossible in
  India.** Design a morning arming ritual: 08:45 push notification, one-tap approval,
  explicit "not armed today" state so nobody assumes coverage they don't have.
- **Static IP.** Brokers whitelist IPs and reject mismatches. Most Indian home connections
  are dynamic — route through our own whitelisted infrastructure.
- **10 OPS ceiling** per client account, enforced by the broker.
- **5-year audit trail** of all API activity.
- **OAuth only.** Open APIs are disallowed.

---

# 8. Hard invariants

Encode these in schema and API. Anything relying on developer discipline will eventually
be violated.

**8.1 Append-only performance history.** `strategy_versions`, `backtest_runs`,
`forward_tests`, `signal_events`, `execution_records` are append-only. **No DELETE
endpoints. No UPDATE on result-affecting fields. No soft-delete** — no `deleted_at`, no
`is_archived`, no `visible` flag. Corrections append a new record referencing the old.

**8.2 Parameter immutability.** Once a forward test is `RUNNING`, its `strategy_version_id`
is frozen. Changes require abandoning and restarting. Enforce with a DB constraint or
trigger.

**8.3 Costs are structural.** No code path produces a gross-only figure. No
`include_costs: boolean` parameter. Display gross and net together so the drag is visible.

**8.4 Stops tighten, never widen.** Once a position is open, the stop may move closer to
price, never further. Enforce at the data layer.

**8.5 Strategies are private.** No sharing, no publishing, no cross-user visibility of
strategy logic or signals. This is the single most load-bearing constraint in the product.

**8.6 AI never writes back.** Model output is advisory. It never modifies a strategy
definition, a hypothesis, or a recorded result. Every interaction logged with input,
output, and whether the user acted.

**8.7 No platform-authored performance claims.** No scoring, no star ratings, no quality
badges, no ranking by return, no composite "strategy score." We report what happened; we
never grade it.

**8.8 Annotations never alter facts.** Notes are separate append-only records. Editing
appends with `supersedes_id`. Nothing is overwritten.

**8.9 Portfolio limits block, they don't warn.** A limit that only warns is not a limit.

**8.10 Trigger proximity is read-only.** No action controls of any kind.

**8.11 No custody, no discretion.** We never hold funds. We never form a view on a
security. Orders route to the user's own broker account under their own credentials.

**8.12 Statistical honesty.** Below ~100 trades, surface the inadequacy prominently.

---

# 9. Data model

```
users
  id, email, phone, created_at, plan_tier, risk_ack_at

strategies
  id, user_id, name, description, segment, instruments[], timeframe,
  created_at, current_version_id

strategy_versions                    -- APPEND ONLY
  id, strategy_id, version_no, definition (jsonb), hypothesis_text,
  created_at, parent_version_id

backtest_runs                        -- APPEND ONLY
  id, strategy_version_id, period_start, period_end, initial_capital,
  cost_model (jsonb), results (jsonb), created_at

adversarial_reports                  -- APPEND ONLY
  id, backtest_run_id, findings (jsonb), severity_ranking (jsonb), created_at

forward_tests                        -- APPEND ONLY
  id, strategy_version_id, status, declared_hypothesis, started_at,
  planned_end_at, ended_at, outcome,        -- COMPLETED | ABANDONED
  initial_capital, cost_model (jsonb)
  -- strategy_version_id FROZEN once status = RUNNING

paper_trades                         -- APPEND ONLY
  id, forward_test_id, symbol, side, qty, entry_price, entry_at,
  exit_price, exit_at, gross_pnl, costs_breakdown (jsonb), net_pnl

signal_events                        -- APPEND ONLY
  id, forward_test_id, strategy_version_id, symbol, side,
  signalled_price, signalled_qty, signalled_at, computed_stop, computed_target

execution_records                    -- APPEND ONLY
  id, signal_event_id, actual_price, actual_qty, executed_at,
  source,                            -- MANUAL | BROKER_API | NOT_TAKEN
  broker_order_id

execution_gaps                       -- APPEND ONLY, derived
  id, forward_test_id, period_start, period_end, theoretical_return,
  actual_return, attribution (jsonb), computed_at

ai_interactions                      -- APPEND ONLY
  id, user_id, context_type, input_snapshot (jsonb), output (jsonb),
  created_at, user_acted (bool), resulting_version_id

annotations                          -- APPEND ONLY
  id, user_id, target_type, target_id, structured_reason,
  note_text, supersedes_id, created_at

market_events                        -- APPEND ONLY
  id, event_type, symbol, event_date, source, confirmed, created_at

portfolio_limits
  id, user_id, limit_type, threshold_value, enabled, updated_at

portfolio_snapshots                  -- APPEND ONLY
  id, user_id, captured_at, total_exposure, capital_at_risk,
  concurrent_positions, sector_breakdown (jsonb), margin_used

limit_breaches                       -- APPEND ONLY
  id, user_id, limit_type, threshold, actual_value,
  blocked_signal_event_id, occurred_at

digests                              -- APPEND ONLY
  id, user_id, period_type, period_start, period_end,
  content (jsonb), generated_at, delivered_at

decay_alerts                         -- APPEND ONLY
  id, strategy_id, alert_type, baseline_metric, current_metric,
  significance, ai_assessment, raised_at, acknowledged_at

broker_connections                   -- Stage 2
  id, user_id, broker, credentials_ref (encrypted), static_ip,
  last_authenticated_at, session_expires_at, status
```

---

# 10. Do NOT build

Claude Code will suggest several of these because they're normal for the category. Refuse
them.

**Legally prohibited or hazardous**
- Sharing, publishing, or any cross-user visibility of strategies or signals
- Copy-trading, leaderboards, strategy marketplace
- Fund custody, wallets, money movement
- Platform-generated strategy scores, ratings, or quality badges
- Ranking strategies by return
- Auto-applying AI suggestions to a strategy definition
- Hardcoded return figures anywhere, including seed data and demo content

**Architecturally corrosive**
- Chart drawing tools or visual level marking — levels belong in rules, not the user's eye
- Manual watchlist editor — the universe filter resolves the tradeable set; a hand-curated
  list is a discretionary override of the user's own rules. A read-only *view* of what the
  filter resolved is fine
- Any action control on the trigger-proximity screen
- Delete or hide functionality on any performance record
- Alerts that fire on ordinary losing periods
- News feed as content (events belong as rule primitives)

**Out of scope**
- HFT or anything approaching 10 OPS
- Crypto
- Discretionary/manual order placement inside our UI
- Options strategies until the P&L model handles time decay properly

---

# 11. Blocked decisions

Do not guess. Ask before building anything that depends on these.

1. **Does an AI-generated strategy count as "developed by the retail investor"?** Blocks
   Stage 2 design. Assume empanelment is required.
2. **Market data source and latency.** Build the data layer behind an interface with
   swappable real-time / delayed / end-of-day implementations. If forced to EOD, intraday
   strategies are out of scope and only positional is supported.
3. **Minimum forward-test window.** Needs statistical justification. Placeholder 60
   sessions, configurable.
4. **Broker partnership terms.** Determines COGS model and data path.
5. **Free vs paid tier boundaries.** Cap compute, not features — backtests are the real
   COGS.

---

# 12. Technical notes

- **IST throughout.** Store UTC, display IST. Sessions 09:15–15:30. Never assume 24h.
- **Exchange holiday calendar** required for all session arithmetic.
- **Money in paise** (integer). No floats for currency, ever.
- **Prices** as fixed-precision decimals.
- **Lot sizes** apply to derivatives — quantity is not arbitrary. SEBI raised minimum
  contract value in late 2024; verify current sizes.
- **Symbols** need exchange qualification: `NSE:RELIANCE` vs `BSE:RELIANCE`.
- **Corporate actions** break raw price series. A 1:5 split reads as an 80% crash to a
  naive backtest. Use adjusted data.
- **Circuit limits** — a stop cannot fill in a locked stock. Model this.
- **Intraday square-off** before close, or the engine reports overnight holds that never
  happened.
- **PII** — PAN, phone, DOB, broker credentials — encrypted at rest, access-logged, never
  in logs or error messages.
- **Statutory rates change.** Verify STT, stamp duty, exchange charges against current
  NSE/BSE circulars before hardcoding.

---

# 13. Competitive context

**Horizon (horizon.trade)** is the closest analogue — US markets, VC-backed, ~4,800 active
traders. Same loop: plain English → strategy → backtest → paper → automated live execution
via broker API. Same legal positioning: technology provider, not adviser; broker holds
funds.

**Where we deliberately differ:**

| | Horizon | X-Wealth |
|---|---|---|
| Post-test iteration | Unlimited, anytime | **Locked parameters, forward window required** |
| Failure record | Not kept | **Permanent iteration ledger** |
| Platform scoring | "Horizon Score" | **None — ever** |
| Marketplace | Opt-in, live | **Prohibited in India** |
| Execution | Set-and-forget | **Daily re-auth required by regulation** |

Horizon's FAQ says users can *"modify parameters, adjust risk management rules,
re-backtest, and redeploy"* at any time. That is the unrestricted retry loop — the
p-hacking machine. **We are the honest version. Do not copy their iteration model to
improve conversion.**

Indian competitors: Streak (Zerodha-owned, no AI signal generation), AlgoTest, Tradetron
(marketplace, regulatory exposure), Sensibull (options), smallcase (curated portfolios).

---

# 14. First milestone

A retail trader can:
1. Sign up and describe a trading idea in plain English
2. Get it compiled into a complete rule set with all six mandatory components
3. Backtest it against historical data, fully net of Indian costs
4. Receive an adversarial report listing why the backtest may be lying
5. Declare a hypothesis, lock parameters, start a forward test
6. Watch it run to completion on paper against live data
7. Get an AI post-mortem
8. See the test — pass or fail — permanently on their record

No broker integration, no live money, no sharing. If that works and traders pay for it,
everything downstream is an execution problem. If they don't, nothing downstream matters.
