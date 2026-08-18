# X-Wealth — Execution Plan

**Version:** 1.0 · **Date:** 18 Aug 2026 · **Owner:** J

---

## How to read this

Four tracks run **in parallel**, not in sequence. This is the whole point of the
document. The default failure mode for a regulated fintech build is: spend six months
building, then discover the product can't legally ship, or that nobody on the supply
side wants it.

| Track | What it answers | Runs |
|---|---|---|
| **A — Validation** | Will registered RAs actually use this? | Weeks 1–4 |
| **B — Legal** | Can we legally ship it? | Weeks 1–10 |
| **C — Data** | Can we get the market data the engine needs? | Weeks 1–6 |
| **D — Build** | Making the thing | Weeks 1–34 |

Tracks A, B and C are cheap and fast. Track D is expensive and slow. Never let D get
ahead of a blocking answer from A, B or C.

**Assumptions:** you + one developer, Claude Code as primary build tool, no external
deadline. Adjust week counts proportionally if the team is larger.

---

# TRACK A — Validation

**Weeks 1–4. You own this personally. Do not delegate it.**

This is the highest-information, lowest-cost work available, and it is currently
unstarted. Everything downstream is a bet on an assumption you have not tested.

### Week 1 — Build the list
- Pull the SEBI register of Research Analysts (sebi.gov.in → Intermediaries)
- Cross-reference against BSE RAASB enlistment
- Filter for RAs already running paid signal groups (Telegram, WhatsApp, own site)
- Target list: 40 names, aiming for 15 conversations

### Weeks 2–3 — Interviews
Fifteen conversations, 30 minutes each. Structured, same questions every time so answers
are comparable.

**What to ask — and do not lead the witness:**
1. How do you currently prove your track record to a prospective subscriber?
2. Have you heard of PaRRVA? Have you opted in? Why or why not?
3. Walk me through how you developed your current strategy.
4. Do you forward-test before publishing? For how long?
5. What would make you switch from Telegram to a platform?
6. Would you publish your *failed* strategy attempts publicly? *(Watch the reaction here — this is the product's core premise and it is the most likely thing to be rejected.)*
7. What do you pay for tools today, monthly?
8. Would you give a platform a cut of subscription revenue? What percentage is acceptable?

**What NOT to do:** do not pitch. Do not show the UI. You are gathering, not selling.
The moment you pitch, everyone is polite and the data is worthless.

### Week 4 — Synthesis and decision
Write up findings honestly, including the answers you didn't want.

### ☠️ KILL CRITERIA — TRACK A
Stop or fundamentally rethink if:
- **Fewer than 5 of 15** say they would pay for this
- **More than 10 of 15** refuse to publish failed attempts → the transparency premise is dead and you're building a worse Tradetron
- The dominant answer to "what would make you switch" is *distribution*, not *credibility* → you're building the wrong product; they want an audience, not a lab

**If this track fails, everything below is wasted effort.** That's why it's first.

---

# TRACK B — Legal

**Weeks 1–10. You own the engagement. Budget ₹1.5–3L for a proper opinion.**

### Week 1 — Engage counsel
Securities law specialist, not a generalist. Firms with actual SEBI intermediary
practice. Ask for references from fintech clients.

### Weeks 2–6 — Get written answers to four questions

**Q1 — Market data (BLOCKS the forward-test engine)**
Can a platform serving SEBI-registered RAs use real-time or near-real-time price data
for a paper-trading strategy-validation engine, given the 24 May 2024 circular
restricting real-time data sharing with third parties, as revised effective 1 July 2026
imposing a 30-day lag for educational use? If not real-time, what latency is defensible?

**Q2 — Our regulatory status (BLOCKS launch)**
Does providing an AI critique layer, a strategy builder, and a paper-trading engine to
registered RAs make us (a) a Research Analyst, (b) an algo provider under the retail
algo framework mandatory since 1 April 2026, or (c) neither? Does the answer change if
the AI's output is advisory-only and never auto-applied?

**Q3 — Revenue share (BLOCKS the business model)**
Can an unregistered technology platform take a percentage of a SEBI-registered RA's
subscription fee income? If not, is a flat SaaS licence fee to the RA permissible?

**Q4 — Performance display (BLOCKS the product's core)**
What can we display about a strategy's forward-test performance without making a
"performance claim" requiring PaRRVA verification? Is displaying raw trade logs and
computed metrics, without characterisation, sufficient?

### Weeks 7–10 — Structure
Entity formation, terms of service, advisor agreement, investor agreement, disclosure
language, privacy policy under DPDP Act.

### ☠️ KILL CRITERIA — TRACK B
- **Q2 comes back as "you are an RA or algo provider"** → the entire compliance
  architecture collapses. Either register (12–18 months, significant capital) or stop.
- **Q3 comes back as "no revenue share, no SaaS fee either"** → no viable monetisation.
- **Q4 comes back as "any performance display is a claim"** → the product has no
  differentiator; you're a strategy builder competing with free tools.

**Q1 is not a kill criterion.** If real-time is unavailable, you lose intraday and keep
positional. Smaller product, still viable, arguably healthier.

---

# TRACK C — Data

**Weeks 1–6. Your developer owns this.**

### Weeks 1–2 — Vendor scoping
Historical OHLCV and live/delayed feeds. Candidates to price out: TrueData, Global
Datafeeds, exchange direct licensing, broker APIs (Kite Connect, Dhan, Fyers — note
these are execution APIs, data terms differ). Get written terms on redistribution — most
vendor licences prohibit passing data to your users, which matters for what you display.

### Weeks 3–4 — Historical data acquisition
Minimum viable dataset:
- NSE equities, daily + 1-minute, 5 years
- Nifty 50 and Bank Nifty index data
- Corporate action history (splits, bonuses) — **without this every backtest is wrong**
- Exchange holiday calendar

### Weeks 5–6 — Data layer prototype
Build the abstraction described in `CLAUDE.md` §9. One interface, three swappable
implementations: real-time, delayed, end-of-day. The engine must not know which it's
using.

### Deliverable
A written answer to: *what data can we actually get, at what latency, at what cost,
under what redistribution terms?*

---

# TRACK D — Build

**Weeks 1–34.**

## Phase 0 — Foundation (Weeks 1–4)

Already partly done — advisor and investor UI exist.

- Auth, session management, role split (advisor / investor / admin)
- Database schema per `CLAUDE.md` §6 — **get the append-only constraints in from day one.** Retrofitting immutability is a migration nightmare.
- Admin panel for advisor verification review
- Audit logging infrastructure

**Note:** implement §5.1 (no DELETE endpoints) and §5.2 (parameter freeze) as database
constraints now, before any feature depends on them. If you defer, you will not do it.

## Phase 1 — Advisor onboarding + KYC (Weeks 5–8)

- SEBI registration capture: registration number, RAASB enlistment, PAN, firm name, MCA
- Document upload with type selector
- Verification queue with **manual admin review**
- Registration expiry tracking + auto-suspend on lapse
- Middleware-level publishing gate

**Do not automate verification in v1.** Manual review at low volume is correct, and it
teaches you what edge cases exist before you encode them.

**Milestone:** an advisor can sign up and get verified. Nothing else works yet.

## Phase 2 — Strategy Lab (Weeks 9–16)

**2a — Strategy builder (weeks 9–12)**
- Rule-based authoring: indicator + condition + action
- Instrument selection, timeframe, entry/exit logic, stop-loss, position sizing
- Append-only versioning with parent-child lineage
- Strategy definition stored as structured JSON, not code

**2b — Backtest engine (weeks 13–16)**
- Historical OHLCV execution simulator
- Mandatory cost model: brokerage, STT, stamp duty, exchange charges, SEBI turnover
  fee, GST, slippage assumption
- No-lookahead enforcement — this needs a deliberate test suite, not just intent
- Corporate action adjustment
- Metrics: return, max drawdown, hit rate, avg win/loss, Sharpe, trade count, exposure

**Milestone:** an advisor can author a strategy and get a cost-inclusive backtest.

**⚠️ Highest technical risk in the project sits here.** A subtly wrong backtest engine
produces plausible numbers that are silently false, and everything downstream inherits
the error. Budget time for a reconciliation suite: hand-calculate 20 trades and assert
the engine matches to the paisa.

## Phase 3 — Forward Test Engine (Weeks 17–24)

**This is the differentiator. Everything before it is table stakes.**

- Hypothesis declaration + parameter locking (DB-enforced freeze on `RUNNING`)
- Scheduled strategy evaluation against the data layer
- Paper trade execution with realistic fill assumptions — slippage, liquidity limits,
  circuit-limit handling, no fills outside market hours
- Live equity curve and running metrics
- Session/holiday awareness
- Abandonment flow — permanently recorded, never hidden
- Completion + immutable result record

**Blocked on Track C data answer.** If real-time is unavailable, scope to EOD evaluation
and positional strategies only. Build the engine against the interface either way.

**Milestone:** an advisor can lock a strategy and watch it forward-test to completion.

## Phase 4 — AI Critique (Weeks 25–28)

Read-only analysis. Never writes back to a strategy.

- Overfitting signals: parameter sensitivity, trade count adequacy, indicator complexity
- Sample adequacy: is n large enough to conclude anything?
- Regime dependence: does this only work in one market condition?
- Liquidity feasibility at stated position size
- Drawdown and tail-risk characterisation
- Plain-language strategy explanation for investors
- Full logging per `CLAUDE.md` §5.7

**Design note:** structured findings, not prose verdicts. The AI says "42 trades is
below the threshold for statistical confidence at this win rate" — never "this strategy
is weak."

## Phase 5 — Iteration Ledger + Public Profile (Weeks 29–30)

- Public advisor profile with complete test history
- Published vs abandoned counts, prominently displayed
- Full record per strategy: every version, every test, every outcome
- No filtering, no hiding, no "featured" sort

**Milestone: advisor product is complete.** Ship it here as standalone SaaS. See
"Sequencing decision" below.

## Phase 6 — Investor side (Weeks 31–34+)

- Investor onboarding (UI exists), risk acknowledgement, suitability capture
- Strategy discovery — sortable on recorded metrics only, never on platform scoring
- Groups: create, tiers, join, member management
- Signal composer + delivery (announcements only, no free-form chat)
- Portfolio with manual entry + signal attribution
- Subscription and payments — **blocked on Track B Q3**

## Phase 7 — Beta and launch

- Closed beta: 10 advisors, 100 investors, invite-only
- Instrument everything, especially the guardrail metrics
- Iterate on real usage before opening

---

# Sequencing decision — read this one

**Ship Phase 5 as a standalone product before building Phase 6.**

At the end of Phase 5 you have a complete, sellable advisor tool: strategy lab, honest
forward testing, AI critique, public track record. Charge RAs a flat monthly fee for it.

Why this is the right call:

1. **It de-risks the legal blockers.** Advisor-only tooling sidesteps Track B Q3
   (revenue share) and most of Q4 (performance display to retail) entirely.
2. **It tests the hard assumption first.** Will registered RAs run honest forward tests
   and publish failures? If no, the investor side has nothing to sell.
3. **It generates revenue 4 months earlier.**
4. **The supply side is the constraint.** You can acquire investors quickly. You cannot
   quickly acquire registered RAs willing to be transparent.

The counter-argument is that advisors won't pay for tooling without distribution. That's
a real risk — and it's exactly what Track A question 5 is designed to answer before you
commit either way.

---

# Decision gates

| Gate | When | Pass condition | If fail |
|---|---|---|---|
| **G1** | End W4 | ≥5/15 RAs would pay; ≥5/15 accept publishing failures | Stop. Rethink product. |
| **G2** | End W6 | Historical data secured; live/delayed path identified | Descope to EOD-only |
| **G3** | End W10 | Legal Q2 = "neither RA nor algo provider" | Stop or pursue registration |
| **G4** | End W16 | Backtest engine reconciles to hand-calculation | Do not proceed until fixed |
| **G5** | End W24 | Forward test produces numbers you'd stake reputation on | Do not proceed |
| **G6** | End W30 | ≥3 RAs complete a full forward test unprompted | Product isn't wanted |
| **G7** | Beta | Published:abandoned ratio < 3:1 | Standards are theatre |

**G6 is the one people skip.** Advisors saying they'd use it in an interview and
advisors actually completing a 60-session forward test are entirely different things.

---

# What you own vs delegate

**You, personally, non-delegable:**
- Every one of the 15 advisor interviews
- Legal engagement and reading the opinions yourself
- The decision at each gate

**Developer + Claude Code:**
- All of Track D
- Data vendor technical evaluation

**External:**
- Securities counsel (Track B)
- A quant reviewer for the backtest and forward-test engines — **one week of a
  competent quant's time is the cheapest insurance you will buy on this project**

---

# Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Real-time data legally unavailable | High | Data abstraction layer; EOD fallback |
| We're classified as RA/algo provider | Fatal | Legal opinion before launch; AI stays read-only |
| RAs won't publish failures | Fatal | Track A tests this in week 3 |
| Backtest engine subtly wrong | Fatal (reputational) | Hand-calculation reconciliation; external quant review |
| Zerodha ships this inside Kite | High | Watch continuously; speed is the only defence |
| Advisors bypass fees via CeFCoM | Medium | Flat SaaS model removes exposure entirely |
| Regulation changes mid-build | Medium | Quarterly legal review retainer |
| Adverse selection — worst RAs adopt first | Medium | Manual verification; curate early cohort by hand |

---

# The honest read on where you are

You have built UI for the two easiest parts of the system while the hard part — the
forward-test engine — is unstarted and blocked on an unresolved legal question, and the
core assumption (that registered RAs want this) is untested.

That's a normal place to be, and it's recoverable. But the next four weeks should be
spent almost entirely on Track A and Track B, not on building. Fifteen phone calls and
one legal opinion will tell you more about whether this business exists than three months
of engineering will.

The UI isn't wasted. It's just not the thing that determines whether you have a company.
