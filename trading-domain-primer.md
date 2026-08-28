# Trading & Markets — Domain Primer for X-Wealth

Everything the team needs to understand about how strategies actually work, so the
engine we build produces numbers that are true rather than merely plausible.

> **On numbers in this document:** tax and fee rates, lot sizes and expiry rules change
> frequently in India — several changed in 2024–25 alone. Every figure here is
> *indicative, for understanding magnitude*. Verify current rates against NSE/BSE
> circulars and your broker's schedule before hardcoding anything.

---

# Part 1 — What a market actually is

Before candles and indicators, understand what's underneath.

### The order book

At any moment, a stock has a list of people wanting to buy and a list wanting to sell.

```
        SELLERS (asks)
        ₹2,451.00  ×  200 shares
        ₹2,450.75  ×  150 shares
        ₹2,450.50  ×  800 shares   ← best ask
------- SPREAD: ₹0.25 -------
        ₹2,450.25  ×  400 shares   ← best bid
        ₹2,450.00  ×  900 shares
        ₹2,449.75  ×  300 shares
        BUYERS (bids)
```

- **Best bid** — highest price anyone will pay right now
- **Best ask** — lowest price anyone will sell at right now
- **Spread** — the gap between them. This is a cost you pay on every round trip.
- **Depth** — how many shares sit at each level

### Two order types that matter

**Market order** — "buy now at whatever price." Guaranteed to fill, not guaranteed at
what price. If you buy 2,000 shares and only 800 sit at ₹2,450.50, you consume that
level, then the next, then the next. Your average fill is worse than the price you saw.
**This is slippage, and it's not an abstraction — it's arithmetic.**

**Limit order** — "buy at ₹2,450.00 or better." Guaranteed price, not guaranteed fill.
If the price never comes back to ₹2,450.00, you never get in — and if your backtest
assumed you did, every number downstream is fiction.

### Why this matters for our engine

The "price" in an OHLCV candle is the **last traded price**. It is not the price you
would have received. A backtest that fills every trade at the closing price of a candle
is assuming infinite liquidity at a single point — which is false for every stock and
catastrophically false for illiquid ones.

**Liquidity is the constraint nobody models and everybody should.** A strategy that
works beautifully on Reliance may be untradeable on a smallcap, because the strategy's
position size is larger than the entire visible depth.

---

# Part 2 — OHLCV and candles

### What a candle is

A candle is an **aggregation of every trade in a time window** into five numbers.

For a 5-minute candle on NIFTY from 10:00 to 10:05:

| | Meaning |
|---|---|
| **O — Open** | Price of the first trade in the window |
| **H — High** | Highest price traded during the window |
| **L — Low** | Lowest price traded during the window |
| **C — Close** | Price of the last trade in the window |
| **V — Volume** | Total shares/contracts traded in the window |

### Timeframes

Same data, different windows: 1-minute, 5-minute, 15-minute, 1-hour, daily, weekly.

- **Intraday strategies** run on 1m–15m candles, close positions same day
- **Positional / swing** strategies run on daily candles, hold days to weeks
- Timeframe determines trade frequency, cost drag, and how much data you need for
  statistical significance

### The critical thing candles hide: the path

**A candle tells you where price went. It does not tell you when, or in what order.**

Consider a 5-minute candle: O=100, H=105, L=95, C=102.

Three completely different things could have happened:

```
Path A:  100 → 105 → 95 → 102     (up first, then down, then recover)
Path B:  100 → 95 → 105 → 102     (down first, then up, then pull back)
Path C:  100 → 102 → 95 → 105 → 102  (choppy)
```

Now suppose your strategy has an entry at 103 and a stop-loss at 96.

- **Path A:** you enter at 103, then get stopped out at 96. **Loss.**
- **Path B:** you'd be stopped at 96 before ever reaching 103 — so no trade at all, or
  depending on logic, you enter at 103 later and finish at 102. **Different outcome.**

**Same candle. Opposite results.**

This is the **intrabar problem**, and it is the single biggest source of false backtest
results in retail trading platforms.

### How to handle it

1. **Use lower-timeframe data to resolve intrabar sequence.** If the strategy runs on
   5-minute candles, simulate the path using 1-minute candles inside each bar. This is
   what a serious engine does.
2. **If you can't, adopt the pessimistic assumption.** Assume the stop was hit before
   the target, always. Your backtests will understate performance — which is the correct
   direction to be wrong in.

**Never adopt the optimistic assumption.** Assuming the target hit first inflates every
result, and the inflation is invisible.

---

# Part 3 — Anatomy of a strategy

A trading strategy is a **complete decision system**, not a buy signal. Six components,
all mandatory:

### 1. Universe
What can be traded. "Nifty 50 stocks." "Bank Nifty options." "Stocks above ₹500 with
20-day average volume over 1 million shares."

*The liquidity filter isn't optional — it's what makes the strategy executable.*

### 2. Entry condition
The rule that triggers a trade.

> *"When the 20-day moving average crosses above the 50-day moving average, and RSI is
> below 70, buy at the open of the next candle."*

Note the "next candle" — see lookahead bias in Part 8.

### 3. Exit condition (target)
When to close a winning trade. Fixed percentage target, indicator reversal, trailing
stop, time-based exit, or a combination.

### 4. Stop-loss
When to close a losing trade. **The single most important component.** Without it,
one trade can end the account.

### 5. Position sizing
How much to buy. See Part 6 — this matters more than the entry signal.

### 6. Timeframe
Which candles the rules evaluate against.

### Additionally, for a complete specification:
- Maximum concurrent positions
- Maximum exposure per instrument and in total
- What happens on gaps, circuit limits, and holidays
- Whether it's long-only, short-only, or both

**If any of these six are missing, the strategy is not testable.** Our strategy builder
must require all of them.

---

# Part 4 — The four decisions

Every trade is four decisions. Retail traders obsess over the first and ignore the
fourth. The fourth matters most.

## Entry

Common approaches:

| Type | Logic | Example |
|---|---|---|
| **Trend-following** | Buy strength, expect continuation | Price above 200-DMA and making new highs |
| **Mean-reversion** | Buy weakness, expect a bounce | RSI below 30 with price at lower Bollinger band |
| **Breakout** | Buy when price escapes a range | Close above the 20-day high on above-average volume |
| **Momentum** | Buy what's already moving fastest | Top decile of 3-month return, rebalanced monthly |

Trend-following and mean-reversion are *opposite* bets. A trend strategy buys the break;
a mean-reversion strategy sells it. Both work — in different market regimes. **Which is
why regime dependence is one of the things our AI critique layer must flag.**

## Stop-loss

Four types:

**Fixed percentage** — exit if price falls 2% below entry. Simple, but ignores the
stock's natural volatility. A 2% stop on a stock that routinely moves 4% a day will get
hit constantly by noise.

**ATR-based** — exit at entry minus 2× Average True Range. ATR measures typical daily
range, so the stop adapts to the instrument's volatility. **Generally the most robust.**

**Structural** — exit below the last swing low, or below a support level. Aligns with
how the chart is actually behaving.

**Trailing** — the stop moves up as price rises, locking in gains. Never moves down.

```
Entry ₹100, trailing stop 5%
Price ₹100 → stop ₹95
Price ₹110 → stop ₹104.50   (moved up)
Price ₹105 → stop ₹104.50   (stays — never moves down)
Price ₹104 → EXIT
```

### The one rule that is never broken
**A stop-loss may never be widened after entry.** Moving a stop further away to avoid
taking a loss is how accounts die. Our engine must enforce this structurally — once a
position is open, the stop can tighten, never loosen.

## Exit / target

**Fixed target** — exit at +6%. Clean, but caps the winners that pay for everything.
**Trailing** — let winners run, exit on reversal. Gives back some profit at the top.
**Signal-based** — exit when the entry condition reverses.
**Time-based** — exit after N days regardless. Essential for intraday (square off before
close) and useful for preventing dead capital.

## Position sizing

Covered in Part 6. It is the answer to "how much," and it is where risk actually lives.

---

# Part 5 — The math that decides everything

This is the section to internalise. Most retail traders — and most people building
trading platforms — get this wrong.

### The three numbers

**Win rate** — what fraction of trades are profitable.
**Average win** — mean profit on winning trades.
**Average loss** — mean loss on losing trades.

### Risk–Reward, expressed in R

**R** is the unit of risk on a trade — the distance from entry to stop.

> Entry ₹100, stop ₹95. **R = ₹5.**
> Target ₹115 → that's ₹15 profit = **3R**.
> Stopped out → **−1R**.

Expressing everything in R makes strategies comparable regardless of price or size.

### Expectancy — the only number that matters

```
Expectancy = (Win% × Avg Win) − (Loss% × Avg Loss)
```

This is the average profit per trade. If it's positive, the strategy makes money over
enough trades. If it's negative, it loses — **no matter how good the win rate looks.**

### Worked example: why win rate is a trap

**Strategy A — 70% win rate**
- Wins: 70% × ₹1,000 = ₹700
- Losses: 30% × ₹3,000 = ₹900
- **Expectancy = −₹200 per trade. Loses money.**

**Strategy B — 35% win rate**
- Wins: 35% × ₹5,000 = ₹1,750
- Losses: 65% × ₹1,500 = ₹975
- **Expectancy = +₹775 per trade. Makes money.**

**Strategy A wins twice as often and loses money. Strategy B is wrong two times out of
three and is highly profitable.**

Any advisor marketing "85% accuracy" is either misunderstanding this or exploiting the
fact that their audience does. Our platform must display expectancy, average win,
average loss and R-multiple distribution — **never win rate alone.**

### Breakeven win rate

For a given reward:risk, the win rate you need just to break even:

| Reward : Risk | Breakeven win rate |
|---|---|
| 1 : 1 | 50% |
| 2 : 1 | 33% |
| 3 : 1 | 25% |
| 1 : 2 | 67% |
| 1 : 3 | 75% |

A strategy targeting 1:3 (risking ₹3 to make ₹1) needs to be right 75% of the time
before costs. That's a brutal bar, and it's what most "high accuracy" signal services
are quietly doing.

---

# Part 6 — Position sizing and risk of ruin

### The core principle

**Position size is determined by the stop, not by conviction.**

```
Position size = (Account × Risk per trade %) ÷ (Entry − Stop)
```

**Worked example:**
- Account: ₹10,00,000
- Risk per trade: 1% = ₹10,000
- Entry: ₹500, Stop: ₹480 → risk per share ₹20
- **Position size = ₹10,000 ÷ ₹20 = 500 shares** (₹2,50,000 exposure)

If the stop were tighter — ₹490, risk ₹10 per share — you'd buy 1,000 shares. Same
rupee risk, bigger position. **Tighter stop, larger size; wider stop, smaller size.**

### Why 1–2% per trade

Because losing streaks are longer than intuition suggests. At a 40% win rate, a run of
8 consecutive losses is entirely normal across a few hundred trades.

- At 1% risk: 8 losses = −8%. Recoverable.
- At 10% risk: 8 losses = −57%. Requires +133% to get back.

### The asymmetry of drawdown

| Drawdown | Gain needed to recover |
|---|---|
| −10% | +11% |
| −20% | +25% |
| −33% | +50% |
| −50% | +100% |
| −75% | +300% |
| −90% | +900% |

**This asymmetry is why max drawdown is a more important metric than return.** A
strategy returning 65% annually with a 60% drawdown is not a good strategy — it's a
coin-flip that happened to land well, and no real investor could hold it through the
drawdown.

---

# Part 7 — Indicators

### What they actually are

**Every indicator is a mathematical transformation of OHLCV.** They contain no
information that isn't already in the price and volume data. They reorganise it to make
patterns visible.

| Indicator | What it computes | Type |
|---|---|---|
| **SMA / EMA** | Average price over N periods | Trend, lagging |
| **RSI** | Ratio of recent gains to losses, 0–100 | Momentum oscillator |
| **MACD** | Difference between two EMAs | Trend + momentum |
| **Bollinger Bands** | Moving average ± N standard deviations | Volatility |
| **ATR** | Average true range over N periods | Volatility — **use for stops** |
| **VWAP** | Volume-weighted average price for the session | Intraday reference |
| **ADX** | Trend strength, 0–100 | Regime filter |

### Two things to understand

**Almost all indicators lag.** A 50-day moving average tells you what already happened.
This isn't a flaw — trend-following works *because* trends persist — but it means
indicator-based entries are always late by construction.

**More indicators is worse, not better.** Each additional indicator adds parameters, and
each parameter is a degree of freedom you can tune to fit historical noise. A strategy
with 6 indicators and 15 parameters will fit any history beautifully and predict nothing.

**This is a red flag our AI critique layer should raise explicitly:** high parameter
count relative to trade count is an overfitting signature.

---

# Part 8 — Backtesting: how it works, how it lies

### The simulation loop

```
for each candle in history:
    update indicators using data available UP TO THIS CANDLE ONLY
    if position open:
        check stop-loss hit  → close, record
        check target hit     → close, record
        check exit signal    → close, record
    if no position:
        check entry signal   → open, record
    mark portfolio to market
```

### The four ways backtests lie

## 1. Lookahead bias

Using information that didn't exist at decision time. **The most common and most
destructive error.**

```
❌ WRONG:  if close > sma_20:  buy at close       # you don't know the close until it's over
✅ RIGHT:  if close > sma_20:  buy at next open   # act on the next available price
```

Subtler versions:
- Using a full-day high/low to make an intraday decision
- Using a company's fundamental data before it was actually published
- Using a survivorship-cleaned universe (see below)
- Computing an indicator across the whole series, then testing on a slice of it

**Mitigation: a dedicated test suite.** Feed the engine a series where any lookahead
produces an impossible result, and assert it fails. Intent is not sufficient.

## 2. Survivorship bias

Backtesting on today's Nifty 50 across 10 years tests only companies that *stayed* in
the index. The ones that collapsed and got removed aren't in the data. Results are
systematically inflated.

**Mitigation:** point-in-time index constituents. Harder to source, and non-negotiable.

## 3. Overfitting (curve-fitting)

Tuning parameters until the strategy fits history perfectly. The fit describes the past;
it predicts nothing.

**Signatures to detect and flag:**
- Many parameters relative to trades (rule of thumb: fewer than 1 parameter per 20 trades)
- Oddly specific values — "RSI period 14" is standard, "RSI period 17.3" is fitted
- Performance collapses when a parameter shifts slightly
- Excellent in-sample, poor out-of-sample

**The retry loop is industrialised overfitting.** Iterating a strategy until it passes a
threshold, on the same data, is selection on noise. Run enough variants and some clear
any bar by chance. This is exactly why our forward test locks parameters before the
window opens and records every abandoned attempt.

## 4. Unrealistic execution

- Filling at prices no one could have got
- Ignoring liquidity — buying more than the book could supply
- Ignoring gaps — a stop at ₹95 doesn't fill at ₹95 if the stock opens at ₹88
- Ignoring circuit limits — you can't sell what's locked at the lower circuit
- Ignoring costs (Part 9)

### In-sample vs out-of-sample

Split the data:
- **In-sample (~70%)** — develop and tune here
- **Out-of-sample (~30%)** — test once, at the end

If it works in-sample and fails out-of-sample, it's fitted. **And out-of-sample data can
only be used once.** The moment you tune based on out-of-sample results, it becomes
in-sample and its value is gone.

*Which is precisely why forward testing exists — it's the only truly out-of-sample data,
because it hasn't happened yet.*

---

# Part 9 — Costs (Indian specifics)

**A strategy is a cost-drag problem before it's an alpha problem.** Many strategies that
look profitable gross are unprofitable net, and the shorter the timeframe, the more true
this is.

### The stack

| Cost | Applies to | Rough magnitude |
|---|---|---|
| **Brokerage** | Every order | Flat ₹20/order or 0.03%, whichever lower (discount brokers) |
| **STT** | Statutory | Delivery: both sides; Intraday: sell only; F&O: sell side |
| **Exchange transaction charge** | Every trade | Small % of turnover, varies by segment |
| **SEBI turnover fee** | Every trade | Tiny, but present |
| **Stamp duty** | Buy side | Varies by segment |
| **GST** | On brokerage + exchange charges | 18% |
| **Slippage** | Every trade | Highly variable — often the largest cost |
| **Impact cost** | Large orders | Scales with size vs available depth |

> Verify all statutory rates against current NSE/BSE circulars — several changed in the
> 2024 Budget and may have changed since.

### Worked example: why frequency kills

Strategy: 2 trades/day, 250 days/year = **500 round trips**, ₹1,00,000 per trade.

Assume ₹40 brokerage per round trip + statutory charges + 0.05% slippage each way:

```
Brokerage + statutory   ≈ ₹60 per round trip     × 500 = ₹30,000
Slippage 0.10% round trip = ₹100 per round trip  × 500 = ₹50,000
                                          TOTAL  ≈ ₹80,000
```

On a ₹5,00,000 account, that's **16% of capital consumed annually by costs alone.** The
strategy must generate 16% before it earns a single rupee.

**Now compare a positional strategy** at 20 round trips a year: ~₹3,200 in costs, 0.64%
of capital. Same edge, radically different net outcome.

**This is why our engine must show gross and net side by side.** An advisor who sees only
gross returns will build strategies that cannot survive contact with a real broker.

### Slippage modelling

Minimum viable: a configurable basis-point assumption per side, defaulting conservative.

Better: scale slippage with position size relative to average volume — larger orders in
thinner stocks pay more. Even a crude version of this is far better than a flat number,
and it stops advisors building strategies that only work at sizes nobody can trade.

---

# Part 10 — Forward testing / paper trading

### Why it's different from a backtest

A backtest runs on data the strategy author has already seen. Forward testing runs on
data **that does not exist yet.** That's the entire value.

### What forward testing catches that backtesting can't

- **Data snooping.** If you built the strategy by looking at 2020–2024 data, that data
  is contaminated. The next 90 days aren't.
- **Regime change.** A strategy tuned on a bull market meets its first correction.
- **Execution realism.** Real spreads, real gaps, real illiquid moments.
- **Discipline.** Does the advisor actually let it run, or interfere?

### What forward testing still misses

- **Emotional reality.** Paper losses don't feel like real losses.
- **Actual fills.** We're still simulating, however carefully.
- **Market impact.** Our simulated orders don't move the market. Real ones do.

### Fill assumptions our engine must make explicit

| Situation | Assumption |
|---|---|
| Entry signal on candle close | Fill at next candle's open, plus slippage |
| Stop-loss hit intrabar | Fill at stop price, plus slippage — **not better** |
| Gap through the stop | Fill at the open, not the stop price |
| Target hit intrabar | Fill at target — but only if the stop wasn't hit first |
| Both hit in same candle | **Assume the stop hit first**, unless lower-timeframe data resolves it |
| Circuit limit locked | No fill |
| Order exceeds available volume | Partial fill or reject — do not assume full fill |

**Every one of these must be a documented, configurable assumption**, visible to the
advisor and displayed alongside results. An advisor who doesn't know the fill model
doesn't understand their own track record.

---

# Part 11 — Metrics that matter

### Return
- **Absolute return** — total % gain
- **CAGR** — annualised, comparable across periods

### Risk
- **Max drawdown** — largest peak-to-trough decline. **The most important single number.**
- **Drawdown duration** — how long underwater. Often more painful than depth.
- **Volatility** — standard deviation of returns

### Risk-adjusted
- **Sharpe ratio** — return per unit of total volatility
- **Sortino ratio** — return per unit of *downside* volatility. Better, since upside
  volatility isn't risk.
- **Calmar ratio** — CAGR ÷ max drawdown. Very intuitive: return per unit of pain.

### Trade quality
- **Expectancy** — average profit per trade *(the headline number)*
- **Profit factor** — gross profit ÷ gross loss. Above 1.5 is respectable.
- **Average win / average loss** — the R-multiple
- **Win rate** — only meaningful alongside the two above
- **Trade count** — under ~100 trades, conclusions are weak
- **Longest losing streak** — what the advisor and subscriber must actually endure

### Exposure
- **Time in market** — 15% annual return with 20% exposure is far better than the same
  return fully invested
- **Max concurrent positions**
- **Concentration** — did three trades produce all the profit? *(If so, the strategy is
  a lottery ticket, not an edge.)*

### What we display, and what we don't

Display the full set. Never display win rate alone. Never rank strategies by return.
Never compute a composite "quality score" — that's a performance claim, and it's
PaRRVA's job, not ours.

---

# Part 12 — Indian market specifics

### Sessions
- **Pre-open:** 09:00–09:15 (order collection and price discovery)
- **Regular:** 09:15–15:30
- **Post-close:** 15:40–16:00
- Monday–Friday, excluding exchange holidays. **No 24/7 trading.**

### Circuit limits
Individual stocks have daily price bands (2%, 5%, 10%, 20%). At the limit, trading is
restricted. **A stop-loss cannot execute in a locked stock** — your engine must model
this or it will report exits that were impossible.

Index-level circuit breakers halt the entire market at 10%, 15% and 20% moves.

### Settlement
T+1 for equities. Optional T+0 exists for select scrips. Affects when capital is
actually available for redeployment — relevant for high-turnover strategies.

### Derivatives
- Trade in **fixed lots**, not arbitrary quantities
- SEBI raised minimum contract value substantially in late 2024 — **verify current lot
  sizes, they've changed**
- Weekly and monthly expiries; SEBI reduced the number of weekly expiries in 2024
- Options have time decay — an options strategy needs a fundamentally different P&L
  model than equities
- Margin requirements apply and change intraday

### Corporate actions
Splits, bonuses, dividends and demergers all break raw price history. A 1:5 split makes
a ₹2,500 stock show as ₹500 overnight — which a naive backtest reads as an 80% crash.

**Use adjusted price series, or every long-horizon backtest is wrong.** This is not
optional, and it's a common silent failure.

### Intraday vs delivery
Different margin, different STT treatment, different risk. Intraday positions are
auto-squared-off by the broker near close if not exited. Our engine must square off
intraday strategies before close, or it will report overnight holds that never happened.

---

# Part 13 — What this means for our engine

Concrete requirements that follow from everything above:

1. **Intrabar resolution.** Use 1-minute data to sequence events within higher-timeframe
   candles. Where unavailable, assume stop-before-target. Document the assumption and
   display it.

2. **Costs are structural, never optional.** No code path produces a gross-only figure.
   Display gross and net together so the drag is visible.

3. **Lookahead test suite.** Not a code review — an automated suite with adversarial
   fixtures that fail loudly if any rule peeks forward.

4. **Corporate-action-adjusted data.** Or the backtest is wrong and nobody will notice.

5. **Liquidity constraints.** Cap position size relative to average traded volume.
   Reject or partially fill orders that exceed available depth.

6. **Circuit and gap handling.** Model locked stocks and gap-through fills honestly.

7. **Mandatory strategy completeness.** The builder must require all six components from
   Part 3. No strategy without a stop-loss and a sizing rule can be saved.

8. **Stops tighten, never widen.** Enforce at the data layer.

9. **Full metric set, no composite score.** Expectancy, drawdown, R-distribution, trade
   count, exposure — all displayed. No rating, no ranking by return.

10. **Statistical significance warnings.** Below ~100 trades, surface it prominently.
    An AI critique that says "42 trades is insufficient to distinguish this from luck"
    is doing exactly the job we built it for.

---

# Where to go deeper

- **Ernest Chan, *Quantitative Trading*** — backtesting pitfalls, honestly treated
- **Marcos López de Prado, *Advances in Financial Machine Learning*** — the definitive
  treatment of overfitting and why most published strategies are false discoveries
- **Van Tharp, *Trade Your Way to Financial Freedom*** — position sizing and expectancy;
  ignore the self-help packaging, the R-multiple framework is genuinely good
- **NSE and BSE circulars** — for anything involving current rates, lot sizes or rules.
  Primary sources only.
- **Zerodha Varsity** — free, and the best plain-language introduction to Indian market
  mechanics available
