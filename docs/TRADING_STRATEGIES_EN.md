# Trading Strategy Configuration Guide

This document provides detailed information on all trading strategies supported by the open-nof1.ai system and their configuration methods.

## Quick Configuration Guide

### How to Modify Strategy Configuration?

1. **Modify Strategy Type**: Edit the `.env` file, change the `TRADING_STRATEGY` parameter
2. **Modify Execution Cycle**: Edit the `.env` file, change the `TRADING_INTERVAL_MINUTES` parameter
3. **Modify Risk Control Parameters**: Edit the `.env` file, change `MAX_LEVERAGE`, `MAX_POSITIONS` and other parameters
4. **Modify Strategy Core Parameters**: Edit the corresponding strategy file (e.g., `src/strategies/swingTrend.ts`)
5. **View Complete Configuration Reference**: Refer to the "Configuration Items and Code Reference Table" at the end of this document

### Configuration File Location Quick Reference

| Configuration Type | File Location | Description |
|-------------------|---------------|-------------|
| Environment Variables | `.env` | Strategy selection, execution cycle, risk control parameters |
| Strategy Parameters | `src/strategies/*.ts` | Leverage, position size, stop-loss parameters for each strategy |
| Risk Control Parameters | `src/config/riskParams.ts` | System-level risk control parameters |
| Strategy Selection Logic | `src/strategies/index.ts` | Strategy switching logic |
| Trading Loop | `src/scheduler/tradingLoop.ts` | Auto monitoring, stop-loss and take-profit implementation |
| AI Decision Prompts | `src/agents/tradingAgent.ts` | AI trading decision logic |

---

## Strategy File Locations

All strategy implementation files are located in the `src/strategies/` directory:

- `src/strategies/index.ts` - Unified strategy module exports
- `src/strategies/types.ts` - Strategy type definitions
- `src/strategies/ultraShort.ts` - Ultra-short strategy implementation
- `src/strategies/swingTrend.ts` - Swing trend strategy implementation
- `src/strategies/mediumLong.ts` - **Medium-long strategy implementation**
- `src/strategies/conservative.ts` - Conservative strategy implementation
- `src/strategies/balanced.ts` - Balanced strategy implementation
- `src/strategies/aggressive.ts` - Aggressive strategy implementation
- `src/strategies/aggressiveTeam.ts` - Aggressive team strategy implementation
- `src/strategies/rebateFarming.ts` - Rebate farming strategy implementation
- `src/strategies/aiAutonomous.ts` - AI autonomous strategy implementation
- `src/strategies/multiAgentConsensus.ts` - Multi-agent consensus strategy implementation
- `src/strategies/alphaBeta.ts` - **Alpha Beta strategy implementation**
- `src/agents/aggressiveTeamAgents.ts` - Aggressive team members implementation

## Strategy Overview

The system currently supports **11 trading strategies**, suitable for different market environments and risk preferences:

| Strategy Code | Strategy Name | Execution Cycle | Holding Duration | Risk Level | Suitable For |
|--------------|---------------|----------------|-----------------|------------|--------------|
| `ultra-short` | Ultra-Short | 5 minutes | 30 mins - 2 hours | Medium-High | Traders who prefer high-frequency trading and quick in-and-out |
| `swing-trend` | **Swing Trend** | **20 minutes** | **Hours - 3 days** | **Medium-Low** | **Investors seeking medium-term trends and stable growth** |
| `medium-long` | **Medium-Long** | **30 minutes** | **Hours - 24 hours** | **Medium** | **Investors seeking medium-long term stable returns with AI-led decisions** |
| `conservative` | Conservative | 5-15 minutes | Hours - 24 hours | Low | Conservative investors |
| `balanced` | Balanced | 5-15 minutes | Hours - 24 hours | Medium | General investors |
| `aggressive` | Aggressive | 5-15 minutes | Hours - 24 hours | High | Aggressive investors |
| `aggressive-team` | **Aggressive Team** | **15 minutes** | **Hours - 2 days** | **High** | **Team collaboration with oscillation detection, targeting 40-60% monthly returns** |
| `rebate-farming` | Rebate Farming | 5 minutes | 10-60 minutes | Medium | Users with high fee rebates |
| `ai-autonomous` | AI Autonomous | Flexible | AI decides | AI decides | Users who fully trust AI's autonomous decision-making |
| `multi-agent-consensus` | **Multi-Agent Jury** | **5-10 minutes** | **Hours - Days** | **Medium** | **Investors seeking robust decision-making and risk control** |
| `alpha-beta` | **Alpha Beta** | **Flexible** | **AI decides** | **AI decides** | **Zero strategy guidance, AI fully autonomous with forced self-review** |

## Detailed Strategy Descriptions

### Ultra-Short Strategy (`ultra-short`)

**Core Philosophy**: Quick in-and-out, capturing short-term price fluctuations, strict profit-locking rules

#### Strategy Parameters

> **Configuration File Location**: `src/strategies/ultraShort.ts`

- **Execution Cycle**: 5 minutes (Configuration location: `.env` file `TRADING_INTERVAL_MINUTES=5`)
- **Recommended Holding Duration**: 30 minutes - 2 hours
- **Leverage Range**: 3-5x (50%-75% of MAX_LEVERAGE)
  - Code: `leverageMin: Math.max(3, Math.ceil(maxLeverage * 0.5))`
  - Code: `leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.75))`
- **Position Size**: 18-25%
  - Code: `positionSizeMin: 18, positionSizeMax: 25`
- **Stop-Loss Range**: -1.5% ~ -2.5%
  - Code: `stopLoss: { low: -2.5, mid: -2, high: -1.5 }`

#### Risk Control Rules (System Enforced)

> **Code Implementation Location**: `src/agents/tradingAgent.ts` → AI Prompts + `src/scheduler/tradingLoop.ts`

1. **Cycle Profit Lock Rule**: Within each 5-minute cycle, if profit is >2% and <4%, immediately close position to lock in profit
   - AI checks profit status and executes lock-in each cycle
2. **30-Minute Rule**: If position held for more than 30 minutes and profit > fee cost, execute conservative close if trailing stop not reached
   - AI includes this rule in prompts and automatically executes
3. **Trailing Stop**:
   - Profit ≥+4% → Move stop to +1.5%
     - Code: `trailingStop.level1: { trigger: 4, stopAt: 1.5 }`
   - Profit ≥+8% → Move stop to +4%
     - Code: `trailingStop.level2: { trigger: 8, stopAt: 4 }`
   - Profit ≥+15% → Move stop to +8%
     - Code: `trailingStop.level3: { trigger: 15, stopAt: 8 }`

#### Applicable Scenarios
- Market with significant volatility and clear short-term trends
- Sufficient time to monitor system operation
- Pursuing rapid capital turnover

#### Configuration Example

> **Configuration File Location**: `.env` file (refer to `.env.example`)

```bash
TRADING_STRATEGY=ultra-short
TRADING_INTERVAL_MINUTES=5
MAX_LEVERAGE=10
```

---

### Swing Trend Strategy (`swing-trend`) **Recommended New Strategy**

**Core Philosophy**: Short-cycle precise entry, patient holding, auto monitoring protection, let profits run

#### Strategy Parameters

> **Configuration File Location**: `src/strategies/swingTrend.ts`

- **Execution Cycle**: **20 minutes** (Configuration location: `.env` file `TRADING_INTERVAL_MINUTES=20`)
- **Recommended Holding Duration**: **Hours - 3 days**
- **Leverage Range**: **2-5x** (Flexibly chosen based on signal strength)
  - Code: `leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.2))`
  - Code: `leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.5))`
- **Position Size**: **20-35%** (Based on signal strength: Normal 20-25%, Good 25-30%, Strong 30-35%)
  - Code: `positionSizeMin: 20, positionSizeMax: 35`
- **Stop-Loss Range**: **-5.5% ~ -9%** (Based on leverage: High leverage -5.5%, Medium leverage -7.5%, Low leverage -9%)
  - Code: `stopLoss: { low: -9, mid: -7.5, high: -5.5 }`

#### Core Advantages
1. **Short-Cycle Precise Entry**: Uses 1-minute, 3-minute, 5-minute, and 15-minute four-timeframe resonance
2. **Auto Monitoring Protection**: Stop-loss and take-profit fully executed by auto monitoring system (checks every 10 seconds)
3. **AI Focuses on Opening**: AI only responsible for finding high-quality opening opportunities, not actively closing positions
4. **Larger Position Size**: Up to 35%, increasing profit potential
5. **Pursuing Trend Profits**: First take-profit target +50%, maximum up to +120%

#### Auto Monitoring Stop-Loss (Auto checks every 10 seconds)

> **Code Implementation Location**: `src/scheduler/tradingLoop.ts` → `stopLossMonitor()`

- **5-7x Leverage**: Auto stop-loss when loss reaches -8%
- **8-12x Leverage**: Auto stop-loss when loss reaches -6%
- **13x+ Leverage**: Auto stop-loss when loss reaches -5%

#### Auto Monitoring Trailing Stop (Auto checks every 10 seconds, 5-level rules)

> **Code Implementation Location**: `src/scheduler/tradingLoop.ts` → `stopLossMonitor()`

- **Stage 1**: Peak profit 4-6%, pullback 1.5% auto close (minimum 2.5%)
- **Stage 2**: Peak profit 6-10%, pullback 2% auto close (minimum 4%)
- **Stage 3**: Peak profit 10-15%, pullback 2.5% auto close (minimum 7.5%)
- **Stage 4**: Peak profit 15-25%, pullback 3% auto close (minimum 12%)
- **Stage 5**: Peak profit 25%+, pullback 5% auto close (minimum 20%)

#### Entry Conditions (AI Executed)
- **Must have ALL 4 timeframes (1m, 3m, 5m, 15m) signals strongly consistent**
- **Key indicator resonance (MACD, RSI, EMA direction consistent)**
- **Short-cycle precise capture, quick entry**
- **Prioritize signal quality over quantity**

#### AI Responsibilities
- **Only responsible for opening positions**: Analyze market, find high-quality opening opportunities
- **No active closing**: AI will not and should not actively call close operations
- **Monitor and report**: Analyze position status, explain risk and trend health in reports
- **Trust auto monitoring**: All closings handled automatically by auto monitoring system

#### Applicable Scenarios
- **Pursuing stable returns, reducing manual intervention**
- **Hope for automated profit protection**
- **Can accept holding periods of hours to days**
- **Larger capital scale, emphasizing risk control**

#### Configuration Example (Recommended)

> **Configuration File Location**: `.env` file (refer to `.env.example`)

```bash
# Environment Variable Configuration
TRADING_STRATEGY=swing-trend
TRADING_INTERVAL_MINUTES=20
MAX_LEVERAGE=10  # Strategy actually uses 2-5x, leaving sufficient safety margin
MAX_POSITIONS=3  # Recommend reducing simultaneous positions
INITIAL_BALANCE=2000
```

#### Expected Returns
- **Monthly Target Return**: 20-35%
- **Win Rate Target**: 35-45%
- **Risk-Reward Ratio Target**: ≥2:1
- **Sharpe Ratio**: ≥1.5

#### Comparison with Ultra-Short Strategy

| Dimension | Ultra-Short (ultra-short) | Swing Trend (swing-trend) |
|-----------|--------------------------|---------------------------|
| Execution Cycle | 5 minutes | **20 minutes** |
| Leverage | 3-5x | **2-5x** |
| Position Size | 18-25% | **20-35%** |
| Stop-Loss | -1.5%~-2.5% | **-5.5%~-9%** |
| Entry Timeframes | Multiple timeframes | **1m/3m/5m/15m precise** |
| Holding Duration | 30 mins - 2 hours | **Hours - 3 days** |
| Closing Method | AI actively executes | **Auto monitoring executes** |
| AI Responsibilities | Open + Close | **Only open** |
| Risk Level | Medium-High | **Medium-Low** |
| Suitable Market | Short-term fluctuations | **Medium-term trends** |

---

### Conservative Strategy (`conservative`)

**Core Philosophy**: Capital protection priority, low risk low leverage

> **Configuration File Location**: `src/strategies/conservative.ts`

#### Strategy Parameters
- **Leverage Range**: 3-6x (30%-60% of MAX_LEVERAGE)
  - Code: `leverageMin: Math.max(1, Math.ceil(maxLeverage * 0.3))`
  - Code: `leverageMax: Math.max(2, Math.ceil(maxLeverage * 0.6))`
  - Note: When MAX_LEVERAGE=10, actual is 3-6x
- **Position Size**: 15-22%
  - Code: `positionSizeMin: 15, positionSizeMax: 22`
- **Stop-Loss Range**: -2.5% ~ -3.5%
  - Code: `stopLoss: { low: -3.5, mid: -3, high: -2.5 }`

#### Trailing Stop
- Profit ≥+6% → Move stop to +2%
  - Code: `trailingStop.level1: { trigger: 6, stopAt: 2 }`
- Profit ≥+12% → Move stop to +6%
  - Code: `trailingStop.level2: { trigger: 12, stopAt: 6 }`
- Profit ≥+20% → Move stop to +12%
  - Code: `trailingStop.level3: { trigger: 20, stopAt: 12 }`

---

### Balanced Strategy (`balanced`)

**Core Philosophy**: Risk-reward balance, suitable for most investors

> **Configuration File Location**: `src/strategies/balanced.ts`

#### Strategy Parameters
- **Leverage Range**: 6-9x (60%-85% of MAX_LEVERAGE)
  - Code: `leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.6))`
  - Code: `leverageMax: Math.max(3, Math.ceil(maxLeverage * 0.85))`
  - Note: When MAX_LEVERAGE=10, actual is 6-9x
- **Position Size**: 20-27%
  - Code: `positionSizeMin: 20, positionSizeMax: 27`
- **Stop-Loss Range**: -2% ~ -3%
  - Code: `stopLoss: { low: -3, mid: -2.5, high: -2 }`

#### Trailing Stop
- Profit ≥+8% → Move stop to +3%
  - Code: `trailingStop.level1: { trigger: 8, stopAt: 3 }`
- Profit ≥+15% → Move stop to +8%
  - Code: `trailingStop.level2: { trigger: 15, stopAt: 8 }`
- Profit ≥+25% → Move stop to +15%
  - Code: `trailingStop.level3: { trigger: 25, stopAt: 15 }`

---

### Aggressive Strategy (`aggressive`)

**Core Philosophy**: Pursuing high returns, accepting high risk

> **Configuration File Location**: `src/strategies/aggressive.ts`

#### Strategy Parameters
- **Leverage Range**: 9-10x (85%-100% of MAX_LEVERAGE)
  - Code: `leverageMin: Math.max(3, Math.ceil(maxLeverage * 0.85))`
  - Code: `leverageMax: maxLeverage`
  - Note: When MAX_LEVERAGE=10, actual is 9-10x
- **Position Size**: 25-32%
  - Code: `positionSizeMin: 25, positionSizeMax: 32`
- **Stop-Loss Range**: -1.5% ~ -2.5%
  - Code: `stopLoss: { low: -2.5, mid: -2, high: -1.5 }`

#### Trailing Stop
- Profit ≥+10% → Move stop to +4%
  - Code: `trailingStop.level1: { trigger: 10, stopAt: 4 }`
- Profit ≥+18% → Move stop to +10%
  - Code: `trailingStop.level2: { trigger: 18, stopAt: 10 }`
- Profit ≥+30% → Move stop to +18%
  - Code: `trailingStop.level3: { trigger: 30, stopAt: 18 }`

---

### Multi-Agent Jury Strategy (`multi-agent-consensus`)

**Core Philosophy**: Judge and jury deliberation model, main agent independent analysis + three professional agents assistance, pursuing high-quality decisions

> **⚠️ Important Notice: Token Consumption Warning**
> 
> The jury strategy uses a multi-agent collaboration mode (1 main agent + 3 professional agents), requiring multiple AI model calls for each decision.
> 
> **Cost Impact**:
> - Token consumption is approximately **3-4 times** that of single-agent strategies
> - Each decision cycle requires 4 AI model calls (Judge 1 time + Jury 3 times)
> - With 5-minute execution cycle, approximately 288 × 4 = **1152 AI calls per day**
> 
> **Recommendations**:
> - Only use when you have sufficient budget and pursue extremely high decision quality
> - Consider extending execution cycle (e.g., 10 or 15 minutes) to reduce costs
> - Monitor API fees to ensure they remain within acceptable range
> - Users with limited budget should use single-agent strategies (e.g., swing-trend, ai-autonomous)

#### Strategy Parameters

> **Configuration File Location**: `src/strategies/multiAgentConsensus.ts`

- **Execution Cycle**: 5-10 minutes (Configuration location: `.env` file `TRADING_INTERVAL_MINUTES=5`)
- **Recommended Holding Duration**: Hours - Days
- **Leverage Range**: 14-20x (55%-80% of MAX_LEVERAGE)
  - Code: `leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.55))`
  - Code: `leverageMax: Math.max(3, Math.ceil(maxLeverage * 0.80))`
  - Note: When MAX_LEVERAGE=25, actual leverage is 14-20x
- **Position Size**: 18-25%
  - Code: `positionSizeMin: 18, positionSizeMax: 25`
- **Stop-Loss Range**: -6% ~ -8%
  - Code: `stopLoss: { low: -6, mid: -7, high: -8 }`

#### Core Advantages

1. **Multi-Agent Collaborative Decision**: Judge (main agent) + three professional agents (technical analysis, trend analysis, risk assessment)
2. **Deliberation Decision-Making**: Judge analyzes independently first, listens to jury opinions, then makes final judgment
3. **Not Simple Voting**: Weighs persuasiveness of opinions, not simple majority rule
4. **Dual Protection Mechanism**: Code auto-monitoring + AI proactive decision
5. **Reduce Decision Bias**: Multi-perspective analysis reduces single-agent cognitive blind spots

#### Dual Protection Mechanism

The jury strategy adopts the same dual protection mode as the AI autonomous strategy:

**Layer 1: Code-Level Auto Protection** (Every 10 seconds monitoring, safety net)
- **Auto Stop-Loss**:
  - Low leverage (2-10x): Auto close at -6% loss
  - Medium leverage (11-15x): Auto close at -7% loss
  - High leverage (16x+): Auto close at -8% loss
- **Auto Trailing Stop**:
  - At +10% profit, move stop to +4% (lock profit)
  - At +18% profit, move stop to +10% (lock more profit)
  - At +28% profit, move stop to +18% (protect most profit)
- **Auto Partial Take-Profit**:
  - At +25% profit, auto close 40% (lock partial profit)
  - At +35% profit, auto close 40% (continue locking profit)
  - At +45% profit, auto close 100% (take all profit)

**Layer 2: AI Proactive Decision** (Flexible operation rights)
- Judge can proactively stop-loss/take-profit **before** code auto protection triggers
- Judge can flexibly adjust according to market conditions, no need to wait for auto trigger
- Judge can stop-loss earlier (avoid bigger losses)
- Judge can take-profit earlier (secure profit)
- Code protection is the last safety net, judge has full proactive control

#### Jury Members

1. **Technical Analysis Agent**: Analyzes technical indicators (MACD, RSI, Bollinger Bands, etc.)
2. **Trend Analysis Agent**: Analyzes multi-timeframe trends (1m/3m/5m/15m/1h/4h)
3. **Risk Assessment Agent**: Assesses market risks and position risks

#### Workflow

1. **Judge Independent Analysis**: Judge analyzes market independently first, forms preliminary judgment
2. **Consult Jury**: Use `delegate_task` tool to call three professional agents
3. **Collect Opinions**: Gather analysis opinions and suggestions from three agents
4. **Deliberation Decision**: Judge synthesizes all opinions (including own judgment) to make final decision
5. **Execute Decision**: Judge executes open/close/observe operations (only judge can execute trades)

#### Entry Conditions (Judge Executes)

- **Must Obtain Jury Opinions**: At least consult technical analysis, trend analysis, and risk assessment agents
- **Comprehensive Judgment**: Not simple majority vote, but weighing persuasiveness of opinions
- **Signal Strength Grading**:
  - Normal signal: 18-20% position, 14x leverage
  - Good signal: 20-23% position, 17x leverage
  - Strong signal: 23-25% position, 20x leverage
- **Emergency Situations**: When position loss approaches stop-loss line, judge can skip jury and decide directly

#### Applicable Scenarios

**Most Suitable**:
- Pursuing robust decision-making, emphasizing risk control
- Hoping to reduce decision bias through multi-perspective analysis
- Can accept holding periods of hours to days
- Not in a hurry for frequent trading, pursuing high-quality signals
- Hoping for dual protection (code + AI)
- **Sufficient budget to afford 3-4x token costs** (Important)
- No strict limitations on API calls

**Not Suitable**:
- Pursuing extremely high-frequency trading (jury decision takes time)
- Market fluctuates extremely fast, requiring second-level decisions
- Don't like complex decision processes
- **Limited budget, cannot afford 3-4x token costs**
- Users with API call limitations or cost-sensitive

#### Configuration Example

> **Configuration File Location**: `.env` file (refer to `.env.example`)

```bash
# Environment Variable Configuration
TRADING_STRATEGY=multi-agent-consensus
TRADING_INTERVAL_MINUTES=5      # Recommended 5-10 minutes
MAX_LEVERAGE=25                  # Strategy uses 14-20x (55%-80%)
MAX_POSITIONS=3                  # Maximum 3 positions (cautious entry)
INITIAL_BALANCE=2000
```

#### Expected Returns

- **Monthly Target Return**: 20-35%
- **Win Rate Target**: 40-50% (improved through multi-agent decision)
- **Profit-Loss Ratio Target**: ≥2.5:1
- **Sharpe Ratio**: ≥1.8

#### Comparison with Other Strategies

| Comparison Item | Jury Strategy | AI Autonomous | Swing Trend |
|----------------|---------------|---------------|-------------|
| Decision Mode | Judge+Jury Deliberation | AI Fully Autonomous | AI Open+Auto Monitor |
| Leverage Range | 14-20x | 1-Max Leverage | 2-5x |
| Position Size | 18-25% | 1-100% | 20-35% |
| Stop-Loss Method | Dual Protection | Dual Protection | Auto Monitor |
| Decision Time | Longer (needs consultation) | Flexible | Medium |
| Token Consumption | Higher (3-4x) | Medium | Medium |
| Win Rate Target | 40-50% | AI Decides | 35-45% |
| Suitable for Beginners | Yes | No | Yes |

#### Strategy Code Location

- Parameter Configuration: `src/strategies/multiAgentConsensus.ts` → `getMultiAgentConsensusStrategy()`
- Prompt Generation: `src/strategies/multiAgentConsensus.ts` → `generateMultiAgentConsensusPrompt()`
- Dual Protection Config: `enableCodeLevelProtection: true` + `allowAiOverrideProtection: true`
- Code Stop-Loss: `src/scheduler/stopLossMonitor.ts`
- Code Take-Profit: `src/scheduler/trailingStopMonitor.ts`
- Partial Take-Profit: `src/scheduler/partialProfitMonitor.ts`

---

## Strategy Switching Guide

### When to Use Swing Trend Strategy?

**Recommended Use Cases**:
- Hope for automated stop-loss and take-profit, reducing manual intervention
- Pursuing more stable automated trading experience
- Can accept holding periods of hours to days
- Larger capital scale, emphasizing risk control
- Hope AI focuses on opening decisions, not worrying about closing

**Not Recommended Use Cases**:
- Market in consolidation with no clear trend
- You need complete manual control of closing timing
- You cannot accept holding periods of several days

### When to Use Ultra-Short Strategy?

**Recommended Use Cases**:
- Market with frequent volatility and clear short-term trends
- You have sufficient time to monitor the system
- You prefer quick in-and-out trading rhythm
- Smaller capital scale, need rapid accumulation

### Strategy Switching Steps

> **Configuration File Location**: `.env` file (refer to `.env.example`)

1. **Close All Positions** (avoid strategy conflicts)
2. **Modify Environment Variables**:
   ```bash
   # Switch to Swing Trend Strategy
   TRADING_STRATEGY=swing-trend
   TRADING_INTERVAL_MINUTES=20
   
   # Or switch to Ultra-Short Strategy
   TRADING_STRATEGY=ultra-short
   TRADING_INTERVAL_MINUTES=5
   
   # Or switch to Multi-Agent Jury Strategy
   TRADING_STRATEGY=multi-agent-consensus
   TRADING_INTERVAL_MINUTES=5
   ```
3. **Restart System**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

---

## Risk Control Comparison

### System Hard Limits (Common to All Strategies)

> **Configuration File Location**:
> - Code Implementation: `src/config/riskParams.ts`
> - Environment Variables: `.env` file

- **Extreme Stop-Loss**: Single loss ≤-30% force close (prevent liquidation)
  - Environment Variable: `EXTREME_STOP_LOSS_PERCENT=-30`
  - Code: `RISK_PARAMS.EXTREME_STOP_LOSS_PERCENT`
- **36-Hour Limit**: Any position held for more than 36 hours force close (release capital)
  - Environment Variable: `MAX_HOLDING_HOURS=36`
  - Code: `RISK_PARAMS.MAX_HOLDING_HOURS`
- **Account Drawdown Protection**: Triggers protection when total account drawdown reaches preset threshold
  - Warning Threshold: `ACCOUNT_DRAWDOWN_WARNING_PERCENT=20`
  - No New Positions: `ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT=30`
  - Force Close: `ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT=50`

### Strategy-Specific Risk Control

| Strategy | Specific Risk Control Rules | Features |
|----------|----------------------------|----------|
| ultra-short | 2% cycle profit lock, 30-minute profit close | System **forcefully executed** |
| swing-trend | Auto monitoring stop-loss (every 10 seconds), Auto monitoring trailing stop (every 10 seconds, 5-level rules) | System **auto executed**, AI doesn't intervene |
| conservative/balanced/aggressive | No specific rules | AI full discretion |

---

## Best Practice Recommendations

### Swing Trend Strategy Best Practices

1. **Wait Patiently for Signals**
   - Wait for all 4 timeframes (1m/3m/5m/15m) to resonate
   - Ensure MACD, RSI, EMA directions are consistent
   - Don't rush to open, quality over quantity

2. **Trust Auto Monitoring**
   - Auto monitoring system checks every 10 seconds
   - Stop-loss and take-profit execute automatically, no AI intervention needed
   - AI focuses on finding high-quality opening opportunities

3. **Reasonable Position Sizing**
   - Normal signals: 20-25% position
   - Good signals: 25-30% position
   - Strong signals: 30-35% position (use cautiously)

4. **Reasonable Leverage Use**
   - Normal signals: 2x leverage (safest)
   - Good signals: 3x leverage (balanced)
   - Strong signals: 5x leverage (maximum, use cautiously)

5. **Control Simultaneous Positions**
   - Recommendation: 1-3 positions (`MAX_POSITIONS=3`)
   - Avoid over-diversification, maintain capital concentration

6. **Understand Automated Protection**
   - Stop-loss: Auto close immediately when stop-loss line touched
   - Take-profit: Auto close immediately when peak pullback target met
   - AI only needs to explain position status in reports

### Ultra-Short Strategy Best Practices

1. **Quick In and Out**
   - Consider locking profit immediately when profit >2%
   - Don't be greedy, small profits are still profits

2. **Strictly Follow Rules**
   - System's 2% profit lock and 30-minute rule are experience summaries
   - Don't try to manually intervene

3. **High-Frequency Monitoring**
   - 5-minute cycle requires more frequent monitoring
   - Ensure system stable operation

---

## Configuration Examples

> **Configuration File Location**:
> - Main Configuration: `.env` file (refer to `.env.example` template)
> - Strategy Implementation: `src/strategies/` directory
> - Risk Control Parameters: `src/config/riskParams.ts`

### Production Environment - Swing Trend Strategy (Recommended)

```bash
# .env file configuration

# Strategy Configuration
TRADING_STRATEGY=swing-trend           # Use Swing Trend Strategy
TRADING_INTERVAL_MINUTES=20            # 20-minute execution cycle

# Risk Control Configuration
MAX_LEVERAGE=10                        # Max leverage 10x (strategy actually uses 2-5x)
MAX_POSITIONS=3                        # Max 3 positions
MAX_HOLDING_HOURS=72                   # Max holding 72 hours (3 days)
INITIAL_BALANCE=2000                   # Initial capital 2000 USDT

# Account Risk Control
ACCOUNT_STOP_LOSS_USDT=1500           # Account stop-loss line
ACCOUNT_TAKE_PROFIT_USDT=3000         # Account take-profit line

# API Configuration
GATE_API_KEY=your_api_key
GATE_API_SECRET=your_api_secret
GATE_USE_TESTNET=false                # Production environment

# AI Configuration
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL_NAME=deepseek/deepseek-v3.2-exp
```

### Test Environment - Ultra-Short Strategy

```bash
# Strategy Configuration
TRADING_STRATEGY=ultra-short           # Use Ultra-Short Strategy
TRADING_INTERVAL_MINUTES=5             # 5-minute execution cycle

# Risk Control Configuration
MAX_LEVERAGE=10
MAX_POSITIONS=5                        # Ultra-short can hold more positions
MAX_HOLDING_HOURS=36
INITIAL_BALANCE=1000                   # Small capital for test environment

# Test Network
GATE_USE_TESTNET=true                  # Use testnet
```

---

## Frequently Asked Questions

### Q1: Why doesn't the AI actively close positions in the Swing Strategy?
**A**: To achieve more stable and consistent risk control execution. The auto monitoring system checks every 10 seconds and closes positions immediately when conditions are met, which is more timely than the AI's 20-minute execution cycle. AI focuses on finding high-quality opening opportunities, closing is handled by the auto monitoring system, achieving separation of responsibilities and higher efficiency.

### Q2: Will auto monitoring close positions too early?
**A**: Auto monitoring uses 5-level trailing stop rules, dynamically adjusting based on profit peaks. For example, at 10% peak, it only closes on a 2.5% pullback, which both protects profits (minimum 7.5%) and gives trends enough room. This balance is carefully designed.

### Q3: Why does the Swing Strategy use 1m/3m/5m/15m short cycles?
**A**: Although called "swing", entry timing needs to be precise. Short-cycle combinations (1-15 minutes) can capture early signals of trend formation faster, avoiding lag from using longer cycles like 4 hours. Holding time can still reach several days, letting profits fully run.

### Q4: Isn't 20-35% position size too large?
**A**: It depends on signal strength. 30-35% is only used for strong signals (4 timeframes perfectly resonating + technical indicators extremely consistent), normal signals only use 20-25%. Combined with 2-5x low leverage and strict auto monitoring stop-loss, risk is controllable.

### Q5: Can I run multiple strategies simultaneously?
**A**: Not recommended. Each strategy has different risk control rules and execution logic, running simultaneously may cause conflicts. It's recommended to choose one strategy to focus on based on market conditions.

### Q6: How to evaluate strategy effectiveness?
**A**: Focus on these metrics:
- **Win Rate**: Percentage of profitable trades (Swing strategy target 35-45%)
- **Risk-Reward Ratio**: Average profit/Average loss (target ≥2:1)
- **Monthly Return**: Monthly total return (Swing strategy target 20-35%)
- **Sharpe Ratio**: Risk-adjusted return (target ≥1.5)
- **Max Drawdown**: Maximum peak-to-trough decline (control within 20%)
- **Stop-Loss Timeliness**: Auto monitoring response speed (10-second check)

---

## Technical Support

If you have questions or suggestions, please contact through the following methods:

- **GitHub Issues**: [https://github.com/195440/open-nof1.ai/issues](https://github.com/195440/open-nof1.ai/issues)
- **Discussion Forum**: [https://github.com/195440/open-nof1.ai/discussions](https://github.com/195440/open-nof1.ai/discussions)

---

## Technical Implementation

> **Core File Locations**:
> - Strategy Module: `src/strategies/` directory
> - Unified Strategy Exports: `src/strategies/index.ts`
> - Strategy Type Definitions: `src/strategies/types.ts`
> - Trading Agent: `src/agents/tradingAgent.ts`
> - Risk Control Parameters: `src/config/riskParams.ts`
> - Trading Loop: `src/scheduler/tradingLoop.ts`

All strategy implementations follow a unified architectural pattern:

1. **Strategy Parameter Definition**: Each strategy defines complete parameter configurations in its corresponding `.ts` file, including leverage range, position size, stop-loss range, etc.
   - Ultra-Short: `src/strategies/ultraShort.ts` → `getUltraShortStrategy()`
   - Swing Trend: `src/strategies/swingTrend.ts` → `getSwingTrendStrategy()`
   - Conservative: `src/strategies/conservative.ts` → `getConservativeStrategy()`
   - Balanced: `src/strategies/balanced.ts` → `getBalancedStrategy()`
   - Aggressive: `src/strategies/aggressive.ts` → `getAggressiveStrategy()`
   - Rebate Farming: `src/strategies/rebateFarming.ts` → `getRebateFarmingStrategy()`
   - AI Autonomous: `src/strategies/aiAutonomous.ts` → `getAiAutonomousStrategy()`
   - Multi-Agent Jury: `src/strategies/multiAgentConsensus.ts` → `getMultiAgentConsensusStrategy()`

2. **Prompt Generation**: Each strategy file contains a `generateXxxPrompt()` function that generates strategy-specific decision prompts for the AI
   - Ultra-Short: `generateUltraShortPrompt()`
   - Swing Trend: `generateSwingTrendPrompt()`
   - Conservative: `generateConservativePrompt()`
   - Balanced: `generateBalancedPrompt()`
   - Aggressive: `generateAggressivePrompt()`
   - Rebate Farming: `generateRebateFarmingPrompt()`
   - AI Autonomous: `generateAiAutonomousPrompt()`
   - Multi-Agent Jury: `generateMultiAgentConsensusPrompt()`

3. **Unified Exports**: All strategies are exported through `src/strategies/index.ts` for easy system calls

### Strategy Selection Logic

> **Implementation File**: `src/strategies/index.ts`

The system dynamically loads the corresponding strategy based on the `TRADING_STRATEGY` environment variable:

```typescript
// In src/strategies/index.ts
export function getStrategyParams(strategy: TradingStrategy, maxLeverage: number): StrategyParams {
  switch (strategy) {
    case "ultra-short":
      return getUltraShortStrategy(maxLeverage);
    case "swing-trend":
      return getSwingTrendStrategy(maxLeverage);
    case "conservative":
      return getConservativeStrategy(maxLeverage);
    case "balanced":
      return getBalancedStrategy(maxLeverage);
    case "aggressive":
      return getAggressiveStrategy(maxLeverage);
    default:
      return getBalancedStrategy(maxLeverage);
  }
}
```

### Configuration Items and Code Reference Table

| Configuration Item | Environment Variable | Code Location | Description |
|-------------------|---------------------|---------------|-------------|
| Trading Strategy | `TRADING_STRATEGY` | `src/strategies/index.ts` | Strategy selection logic |
| Execution Cycle | `TRADING_INTERVAL_MINUTES` | `src/scheduler/tradingLoop.ts` | Trading loop interval |
| Max Leverage | `MAX_LEVERAGE` | `.env` → Various strategy files | Strategy baseline value |
| Max Positions | `MAX_POSITIONS` | `src/config/riskParams.ts` | Risk control parameter |
| Max Holding Hours | `MAX_HOLDING_HOURS` | `src/config/riskParams.ts` | Risk control parameter |
| Extreme Stop-Loss | `EXTREME_STOP_LOSS_PERCENT` | `src/config/riskParams.ts` | Risk control parameter |
| Initial Balance | `INITIAL_BALANCE` | `src/config/riskParams.ts` | Capital management |
| Account Drawdown Warning | `ACCOUNT_DRAWDOWN_WARNING_PERCENT` | `src/config/riskParams.ts` | Risk control parameter |
| Account Drawdown No New Position | `ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT` | `src/config/riskParams.ts` | Risk control parameter |
| Account Drawdown Force Close | `ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT` | `src/config/riskParams.ts` | Risk control parameter |

## Version History

### v3.0 - November 15, 2025
- **Added Medium-Long Strategy** (`medium-long`)
  - 30-minute execution cycle, 3-10x leverage
  - AI-led decision-making with minimal constraints and maximum freedom
  - Targets medium-long term stable returns (monthly goal 25-50%)
  - Focus on quality over frequency
- **Added Alpha Beta Strategy** (`alpha-beta`)
  - Zero strategy guidance, AI fully autonomous decision-making
  - Forced self-review mechanism (core feature)
  - Dual protection mode (code auto + AI proactive)
  - Learn from history, continuous optimization
- **Total strategies increased from 9 to 11**
- Enhanced strategy documentation with complete descriptions of two new strategies
- Updated strategy switching guide and usage scenarios

### v2.3 - November 11, 2025
- Added Multi-Agent Jury Strategy (`multi-agent-consensus`)
- Judge and jury deliberation decision-making model: main agent + three professional agents collaboration
- Dual protection mechanism: code auto-monitoring + judge proactive decision
- Total number of strategies increased from 7 to 8
- Improved strategy switching guide and best practices

### v2.2 - November 9, 2025
- Annotated configuration file locations and code locations for all strategy parameters
- Added configuration items and code reference table for quick location
- Improved technical implementation section with detailed file descriptions
- Annotated environment variable configuration location (`.env` file)

### v2.1 - November 8, 2025
- Optimized project structure: Unified strategy implementations in `src/strategies/` directory
- Improved all README documentation, added strategy file links
- Updated strategy configuration guide, added technical implementation description

### v2.0 - November 4, 2025
- Swing strategy position adjustment: 12-20% → 20-35%
- Swing strategy timeframe optimization: 15m-4h → 1m/3m/5m/15m precise capture
- Swing strategy stop-loss fine-tuning: -5%~-8% → -5.5%~-9%
- AI responsibility adjustment: AI only responsible for opening, closing handled by auto monitoring system
- Terminology optimization: "code-level" changed to "auto monitoring"

### v1.0 - November 3, 2025
- Initial version release

---

## Copyright Notice

Copyright (C) 2025 195440

This document is licensed under the GNU Affero General Public License v3.0.

