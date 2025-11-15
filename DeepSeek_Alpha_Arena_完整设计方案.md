# DeepSeek Alpha Arena 策略 - 完整设计方案

## 文档版本
- **版本号**: v1.0
- **创建日期**: 2025-11-15
- **作者**: AI Strategy Designer
- **基于**: Alpha Arena Season 1 技术分析文档

---

## 一、项目概述

### 1.1 设计目标

复刻 Alpha Arena 的核心设计理念，创建一个**仅使用 DeepSeek 模型**的自主交易策略，特点如下：

- **完全自主决策**：不提供任何策略建议，只提供原始市场数据
- **双重防护机制**：代码级自动保护 + AI 主动决策
- **透明可追溯**：完整记录每次推理过程和交易决策
- **持续学习改进**：通过自我复盘机制不断优化
- **真实市场验证**：在 Gate.io / OKX 等交易所实盘运行

### 1.2 与 Alpha Arena 的对比

| 特性 | Alpha Arena | DeepSeek Alpha Arena (本方案) |
|------|-------------|-------------------------------|
| **模型数量** | 6 个 (GPT-5, Gemini 2.5, Claude 4.5, Grok 4, DeepSeek v3.1, Qwen3-Max) | 1 个 (DeepSeek v3.2-exp) |
| **资金配置** | 每个模型 $10,000 | 可配置 (建议 $1,000 - $10,000) |
| **交易所** | Hyperliquid | Gate.io / OKX |
| **推理频率** | 2-3 分钟 | 可配置 (建议 5-10 分钟) |
| **数据输入** | 多时间框架技术指标 | 多时间框架技术指标 + 历史决策记录 |
| **策略提示词** | 系统提示词 (未公开) + 用户提示词 (公开) | 完全自主提示词 (本方案设计) |
| **风控机制** | 系统硬性风控 + 模型自主决策 | 双重防护 (代码自动监控 + AI 主动决策) |
| **自我改进** | 无明确机制 | 强制自我复盘机制 |
| **可交易资产** | BTC, ETH, SOL, BNB, DOGE, XRP (6种) | BTC, ETH, SOL, BNB, XRP, DOGE, GT, TRUMP, ADA, WLFI (10种) |

---

## 二、策略核心设计

### 2.1 策略名称与定位

**策略名称**: `deepseek-alpha-arena`

**策略代码**: `deepseek-alpha`

**策略定位**: 完全自主的 AI 交易策略，复刻 Alpha Arena 的设计哲学

### 2.2 核心设计理念

```
【不提供建议，只提供数据】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 零策略指导
   - 不提供任何入场条件建议
   - 不提供任何仓位管理建议
   - 不提供任何杠杆选择建议
   - 不提供任何止损止盈建议

2. 数据驱动
   - 提供完整的市场数据 (价格、成交量、技术指标)
   - 提供多时间框架数据 (1m, 3m, 5m, 15m, 30m, 1h, 4h)
   - 提供账户状态 (余额、持仓、历史交易)
   - 提供历史决策记录 (用于自我复盘)

3. 完全自主
   - AI 自主分析市场
   - AI 自主制定策略
   - AI 自主执行交易
   - AI 自主风险管理

4. 双重防护
   - 代码级自动保护 (止损、移动止盈、分批止盈)
   - AI 主动决策 (在自动保护触发前主动操作)
```

### 2.3 Alpha Arena 核心机制复刻

#### 2.3.1 推理循环 (Inference Loop)

```
每次推理调用 (~5-10 分钟):
┌─────────────────────────────────────────────────────────┐
│                     输入 (Input)                        │
├─────────────────────────────────────────────────────────┤
│ (a) 简洁指令集 (System Prompt)                          │
│     - 告知 AI 它是完全自主的交易员                      │
│     - 说明可用的工具和数据                              │
│     - 强调没有任何策略建议                              │
│                                                         │
│ (b) 实时市场 + 账户状态 (User Prompt)                   │
│     - 当前市场数据 (价格、指标、资金费率)               │
│     - 多时间框架数据 (1m, 3m, 5m, 15m, 30m, 1h, 4h)    │
│     - 账户信息 (余额、净值、可用资金)                   │
│     - 当前持仓 (盈亏、杠杆、持仓时间)                   │
│     - 历史交易记录 (最近10笔)                           │
│     - 历史决策记录 (最近5次)                            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   AI 处理 (Processing)                   │
├─────────────────────────────────────────────────────────┤
│ DeepSeek v3.2-exp 执行:                                 │
│ 1. 自我复盘 (强制)                                      │
│    - 分析最近交易表现                                   │
│    - 识别成功和失败原因                                 │
│    - 制定改进计划                                       │
│                                                         │
│ 2. 市场分析 (自主)                                      │
│    - 多时间框架趋势分析                                 │
│    - 技术指标解读                                       │
│    - 交易机会识别                                       │
│                                                         │
│ 3. 风险管理 (自主)                                      │
│    - 持仓风险评估                                       │
│    - 止损止盈决策                                       │
│    - 仓位分配决策                                       │
│                                                         │
│ 4. 交易决策 (自主)                                      │
│    - 开仓/平仓/持有/观望                                │
│    - 杠杆和仓位大小                                     │
│    - 止盈止损计划                                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    输出 (Output)                         │
├─────────────────────────────────────────────────────────┤
│ 结构化行动输出:                                         │
│ - signal: "buy_to_enter" / "sell_to_enter" /            │
│           "hold" / "close"                              │
│ - coin: "BTC" / "ETH" / etc.                            │
│ - leverage: 1-25                                        │
│ - quantity: 计算好的数量                                │
│ - risk_usd: 风险金额                                    │
│ - confidence: 0.0-1.0                                   │
│ - profit_target: 止盈目标价                             │
│ - stop_loss: 止损价                                     │
│ - invalidation_condition: 失效条件描述                  │
│ - justification: 决策理由                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                 交易执行 (Execution)                     │
├─────────────────────────────────────────────────────────┤
│ Gate.io / OKX 交易执行管道:                             │
│ - 验证参数合法性                                        │
│ - 检查风控限制                                          │
│ - 执行市价单                                            │
│ - 记录交易详情                                          │
│ - 记录 AI 推理过程                                      │
└─────────────────────────────────────────────────────────┘
```

#### 2.3.2 数据输入格式 (复刻 Alpha Arena 格式)

```markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【交易周期 #143】2025-11-15 14:30:00 (北京时间)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

已运行: 1430 分钟
执行周期: 每 10 分钟

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【系统硬性风控底线】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• 单笔亏损 ≤ -30%：系统强制平仓
• 持仓时间 ≥ 36 小时：系统强制平仓
• 最大杠杆：25 倍
• 最大持仓数：5 个
• 可交易币种：BTC, ETH, SOL, BNB, XRP, DOGE, GT, TRUMP, ADA, WLFI

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【当前账户状态】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

总资产: 10258.87 USDT
可用余额: 8308.94 USDT
未实现盈亏: +493.42 USDT
持仓数量: 1 个

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【当前持仓】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

XRP 做多:
  持仓量: 5164.0 张
  杠杆: 8x
  入场价: 2.30
  当前价: 2.39865
  盈亏: +4.3% (+493.42 USDT)
  持仓时间: 3.2 小时

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【市场数据】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

注意：所有价格和指标数据按时间顺序排列（最旧 → 最新）

【BTC】
当前价格: 107982.5
EMA20: 107776.85
MACD: 116.567
RSI(7): 62.558
资金费率: 8.2948e-06

日内序列（3分钟间隔，最旧 → 最新）：
价格: [107726.5, 107741.0, 107859.0, 107891.0, 107946.5, 108108.0, 108002.5, 107921.0, 107902.0, 107982.5]
EMA20: [107540.298, 107556.175, 107584.92, 107617.975, 107644.644, 107695.726, 107721.561, 107740.651, 107755.255, 107776.85]
MACD: [10.802, 21.816, 42.242, 63.667, 77.015, 109.171, 116.049, 116.525, 113.337, 116.567]
RSI(7): [73.026, 71.971, 81.425, 84.429, 77.695, 87.43, 63.124, 59.094, 56.477, 62.558]
RSI(14): [59.393, 59.004, 66.193, 69.057, 66.279, 75.216, 61.864, 59.473, 57.972, 61.28]

更长期上下文（4小时时间框架）：
20周期EMA: 107854.332 vs. 50周期EMA: 110571.164
3周期ATR: 557.797 vs. 14周期ATR: 1145.893
当前成交量: 5.495 vs. 平均成交量: 5047.135
MACD: [-1914.209, -1853.793, -1799.213, -1697.737, -1610.053, -1515.907, -1413.862, -1316.523, -1263.15, -1126.368]
RSI(14): [35.766, 37.705, 37.145, 39.797, 39.275, 39.815, 40.696, 40.804, 38.556, 45.44]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【最近交易记录】（最近10笔）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ETH 做多:
  时间: 2025-11-15 12:00:00
  盈亏: +59.89 USDT
  收益率: +5.2%

BTC 做空:
  时间: 2025-11-15 11:30:00
  盈亏: -123.45 USDT
  收益率: -3.8%

最近10笔交易统计:
  胜率: 60.0%
  盈利交易: 6笔
  亏损交易: 4笔
  净盈亏: +234.56 USDT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【历史决策记录】（最近5次）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

周期 #142 (2025-11-15 14:20:00，10分钟前):
  账户价值: 10100.23 USDT
  持仓数量: 1
  决策内容: 持有 XRP 多单，趋势继续向好

周期 #141 (2025-11-15 14:10:00，20分钟前):
  账户价值: 10050.11 USDT
  持仓数量: 1
  决策内容: 开仓 XRP 多单，多时间框架共振

注意：以上是历史决策记录，仅供参考。请基于当前最新数据独立判断。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【自我复盘要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

在做出交易决策之前，请先进行自我复盘：

1. **回顾最近交易表现**：
   - 分析最近的盈利交易：什么做对了？
   - 分析最近的亏损交易：什么做错了？
   - 当前胜率如何？是否需要调整策略？

2. **评估当前策略有效性**：
   - 当前使用的交易策略是否适应市场环境？
   - 杠杆和仓位管理是否合理？
   - 是否存在重复犯错的模式？

3. **识别改进空间**：
   - 哪些方面可以做得更好？
   - 是否需要调整风险管理方式？
   - 是否需要改变交易频率或持仓时间？

4. **制定改进计划**：
   - 基于复盘结果，本次交易应该如何调整策略？
   - 需要避免哪些之前犯过的错误？
   - 如何提高交易质量？

**复盘输出格式**：
在做出交易决策前，请先输出你的复盘思考，然后再执行交易操作。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【可用工具】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• openPosition: 开仓（做多或做空）
  - 参数: symbol（币种）, side（long/short）, leverage（杠杆）, amountUsdt（金额）
  - 手续费: 约 0.05%

• closePosition: 平仓
  - 参数: symbol（币种）, closePercent（平仓百分比，默认100%）
  - 手续费: 约 0.05%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【开始交易】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请基于以上市场数据和账户信息，完全自主地分析市场并做出交易决策。

记住：
- 没有任何策略建议和限制（除了系统硬性风控底线）
- 完全由你自主决定交易策略
- 完全由你自主决定风险管理
- 完全由你自主决定何时交易

现在请做出你的决策并执行。
```

### 2.4 双重防护机制设计

#### 2.4.1 第一层：代码级自动保护

```typescript
// 自动监控配置 (每10秒检查一次)

// 1. 自动止损
const autoStopLoss = {
  lowLeverage: {  // 1-5倍杠杆
    threshold: -8,  // 亏损8%自动平仓
  },
  midLeverage: {  // 6-10倍杠杆
    threshold: -6,  // 亏损6%自动平仓
  },
  highLeverage: { // 11倍以上杠杆
    threshold: -5,  // 亏损5%自动平仓
  },
};

// 2. 自动移动止盈 (Trailing Stop)
const autoTrailingStop = {
  level1: { 
    trigger: 5,   // 盈利达到5%时
    stopAt: 2,    // 回落到2%时自动平仓
  },
  level2: { 
    trigger: 10,  // 盈利达到10%时
    stopAt: 5,    // 回落到5%时自动平仓
  },
  level3: { 
    trigger: 15,  // 盈利达到15%时
    stopAt: 10,   // 回落到10%时自动平仓
  },
};

// 3. 自动分批止盈
const autoPartialTakeProfit = {
  stage1: { 
    trigger: 20,        // 盈利达到20%时
    closePercent: 30,   // 自动平仓30%
  },
  stage2: { 
    trigger: 30,        // 盈利达到30%时
    closePercent: 30,   // 自动平仓30%
  },
  stage3: { 
    trigger: 40,        // 盈利达到40%时
    closePercent: 100,  // 自动平仓剩余全部
  },
};

// 4. 峰值回撤保护
const peakDrawdownProtection = 50; // 从峰值回撤50%时提醒AI
```

#### 2.4.2 第二层：AI 主动决策

```
AI 拥有完全的主动权：

1. AI 可以在代码自动保护触发**之前**主动止损止盈
2. AI 可以根据市场情况灵活调整，不必等待自动触发
3. AI 可以更早止损（避免更大亏损）
4. AI 可以更早止盈（落袋为安）
5. 代码保护是最后的安全网，AI 有完全的主动权

建议：
- 看到不利信号时主动止损，不要等待自动触发
- 看到获利机会时主动止盈，不要贪心等待
- 主动管理风险才是优秀交易员的标志
```

---

## 三、实现方案

### 3.1 文件结构

```
src/
├── strategies/
│   ├── deepseekAlphaArena.ts          # DeepSeek Alpha Arena 策略主文件
│   ├── types.ts                       # 策略类型定义（已存在，需扩展）
│   └── index.ts                       # 策略导出（需更新）
│
├── agents/
│   └── tradingAgent.ts                # 交易 Agent（需更新以支持新策略）
│
├── scheduler/
│   ├── tradingLoop.ts                 # 交易循环（已存在）
│   ├── stopLossMonitor.ts             # 止损监控（已存在）
│   ├── trailingStopMonitor.ts         # 移动止盈监控（已存在）
│   └── partialProfitMonitor.ts        # 分批止盈监控（已存在）
│
└── database/
    └── schema.ts                      # 数据库 schema（需扩展以记录推理过程）
```

### 3.2 核心代码实现

#### 3.2.1 策略参数配置

```typescript
// src/strategies/deepseekAlphaArena.ts

import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * DeepSeek Alpha Arena 策略配置
 * 
 * 完全复刻 Alpha Arena 的设计理念：
 * - 零策略指导，只提供数据
 * - AI 完全自主决策
 * - 双重防护机制
 * - 强制自我复盘
 */
export function getDeepSeekAlphaArenaStrategy(maxLeverage: number): StrategyParams {
  return {
    // ==================== 策略基本信息 ====================
    name: "DeepSeek Alpha Arena",
    description: "完全自主的 AI 交易策略，复刻 Alpha Arena 设计理念，零策略指导，AI 完全自主决策",
    
    // ==================== 杠杆配置 ====================
    leverageMin: 1,
    leverageMax: maxLeverage,
    leverageRecommend: {
      normal: "完全由 AI 自主决定",
      good: "完全由 AI 自主决定",
      strong: "完全由 AI 自主决定",
    },
    
    // ==================== 仓位配置 ====================
    positionSizeMin: 1,   // 最小仓位：1%
    positionSizeMax: 100, // 最大仓位：100%
    positionSizeRecommend: {
      normal: "完全由 AI 自主决定",
      good: "完全由 AI 自主决定",
      strong: "完全由 AI 自主决定",
    },
    
    // ==================== 止损配置 ====================
    // 代码级自动止损（作为安全网）
    stopLoss: {
      low: -8,    // 低杠杆（1-5倍）：亏损8%时代码自动止损
      mid: -6,    // 中杠杆（6-10倍）：亏损6%时代码自动止损
      high: -5,   // 高杠杆（11倍以上）：亏损5%时代码自动止损
    },
    
    // ==================== 移动止盈配置 ====================
    // 代码级自动移动止盈（作为利润保护网）
    trailingStop: {
      level1: { trigger: 5, stopAt: 2 },    // 盈利5%时，止损线移至+2%
      level2: { trigger: 10, stopAt: 5 },   // 盈利10%时，止损线移至+5%
      level3: { trigger: 15, stopAt: 10 },  // 盈利15%时，止损线移至+10%
    },
    
    // ==================== 分批止盈配置 ====================
    // 代码级自动分批止盈（作为利润锁定机制）
    partialTakeProfit: {
      stage1: { trigger: 20, closePercent: 30 },   // 盈利20%时，自动平仓30%
      stage2: { trigger: 30, closePercent: 30 },   // 盈利30%时，自动平仓30%
      stage3: { trigger: 40, closePercent: 100 },  // 盈利40%时，自动平仓剩余全部
    },
    
    // ==================== 峰值回撤保护 ====================
    peakDrawdownProtection: 50,  // 从峰值回撤50%时提醒AI
    
    // ==================== 波动率调整 ====================
    // 不进行波动率调整，由AI自主判断
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 1.0,
        positionFactor: 1.0
      },
      normalVolatility: { 
        leverageFactor: 1.0,
        positionFactor: 1.0
      },
      lowVolatility: { 
        leverageFactor: 1.0,
        positionFactor: 1.0
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "完全由 AI 根据市场数据自主判断",
    riskTolerance: "完全由 AI 根据市场情况自主决定风险承受度",
    tradingStyle: "完全由 AI 根据市场机会自主决定交易风格和频率",
    
    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,  // 启用代码级保护
    
    // ==================== 双重防护模式 ====================
    allowAiOverrideProtection: true,  // 允许AI主动操作
  };
}
```

#### 3.2.2 提示词生成函数

```typescript
/**
 * 生成 DeepSeek Alpha Arena 策略的提示词
 * 
 * 完全复刻 Alpha Arena 的提示词格式
 */
export function generateDeepSeekAlphaArenaPrompt(
  params: StrategyParams, 
  context: StrategyPromptContext
): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【DeepSeek Alpha Arena - 完全自主决策模式】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**核心理念**：
你是一个完全自主的AI交易员。本策略不会给你任何交易建议、策略框架或决策指导。
你需要完全依靠自己的分析能力，基于市场数据做出所有交易决策。

这是对 Alpha Arena (nof1.ai) 的完整复刻，你的行为将被记录和分析。

**你拥有的资源**：

1. **完整的市场数据**：
   - 多个时间框架的K线数据（1m, 3m, 5m, 15m, 30m, 1h, 4h）
   - 技术指标（价格、EMA、MACD、RSI、成交量等）
   - 资金费率
   - 订单簿数据
   - 持仓量数据

2. **完整的账户信息**：
   - 账户余额和可用资金
   - 当前持仓状态
   - 历史交易记录（最近10笔）
   - 历史决策记录（最近5次）
   - 收益率和夏普比率

3. **完整的交易工具**：
   - openPosition: 开仓（做多或做空）
   - closePosition: 平仓（部分或全部）
   - 可以使用 1-${params.leverageMax} 倍杠杆
   - 可以同时持有最多 ${context.maxPositions} 个仓位

**双重防护机制**（保护你的交易安全）：

**第一层：代码级自动保护**（每10秒监控，自动执行）

- 自动止损：
  • 低杠杆（1-5倍）：亏损达到 ${params.stopLoss.low}% 自动平仓
  • 中杠杆（6-10倍）：亏损达到 ${params.stopLoss.mid}% 自动平仓
  • 高杠杆（11倍以上）：亏损达到 ${params.stopLoss.high}% 自动平仓

- 自动移动止盈：
  • 盈利达到 ${params.trailingStop.level1.trigger}% 时，止损线移至 +${params.trailingStop.level1.stopAt}%（锁定利润）
  • 盈利达到 ${params.trailingStop.level2.trigger}% 时，止损线移至 +${params.trailingStop.level2.stopAt}%（锁定更多利润）
  • 盈利达到 ${params.trailingStop.level3.trigger}% 时，止损线移至 +${params.trailingStop.level3.stopAt}%（保护大部分利润）

- 自动分批止盈：
  • 盈利达到 ${params.partialTakeProfit.stage1.trigger}% 时，自动平仓 ${params.partialTakeProfit.stage1.closePercent}%（锁定部分利润）
  • 盈利达到 ${params.partialTakeProfit.stage2.trigger}% 时，自动平仓 ${params.partialTakeProfit.stage2.closePercent}%（继续锁定利润）
  • 盈利达到 ${params.partialTakeProfit.stage3.trigger}% 时，自动平仓 ${params.partialTakeProfit.stage3.closePercent}%（获利了结）

**第二层：AI主动决策**（你的灵活操作权）

- 你可以在代码自动保护触发**之前**主动止损止盈
- 你可以根据市场情况灵活调整，不必等待自动触发
- 你可以更早止损（避免更大亏损）
- 你可以更早止盈（落袋为安）
- 代码保护是最后的安全网，你有完全的主动权

**系统硬性底线**（防止极端风险）：

- 单笔交易亏损达到 ${context.extremeStopLossPercent}% 时，系统会强制平仓（防止爆仓）
- 持仓时间超过 ${context.maxHoldingHours} 小时，系统会强制平仓（释放资金）
- 最大杠杆：${params.leverageMax} 倍
- 最大持仓数：${context.maxPositions} 个
- 可交易币种：${context.tradingSymbols.join(", ")}

**强制自我复盘机制**（Alpha Arena 特色）：

每个交易周期，你必须先进行自我复盘，然后再做交易决策：

1. **回顾最近交易表现**：
   - 分析最近的盈利交易：什么做对了？（入场时机、杠杆选择、止盈策略等）
   - 分析最近的亏损交易：什么做错了？（入场过早/过晚、杠杆过高、止损不及时等）
   - 当前胜率如何？是否需要调整策略？

2. **评估当前策略有效性**：
   - 当前使用的交易策略是否适应市场环境？
   - 杠杆和仓位管理是否合理？
   - 是否存在重复犯错的模式？

3. **识别改进空间**：
   - 哪些方面可以做得更好？
   - 是否需要调整风险管理方式？
   - 是否需要改变交易频率或持仓时间？

4. **制定改进计划**：
   - 基于复盘结果，本次交易应该如何调整策略？
   - 需要避免哪些之前犯过的错误？
   - 如何提高交易质量？

**复盘输出格式**（必须遵守）：

\`\`\`
【自我复盘】
- 最近交易回顾：...
- 策略有效性评估：...
- 改进空间识别：...
- 本次改进计划：...

【交易决策】
（然后再执行具体的交易操作）
\`\`\`

**交易成本提醒**：

- 开仓手续费：约 0.05%
- 平仓手续费：约 0.05%
- 往返交易成本：约 0.1%
- 资金费率：根据市场情况变化（每8小时收取一次）

**双向交易机会**：

- 做多（long）：预期价格上涨时开多单
- 做空（short）：预期价格下跌时开空单
- 永续合约做空无需借币，只需关注资金费率

**执行周期**：

- 当前执行周期：每 ${context.intervalMinutes} 分钟执行一次
- 你可以在每个周期做出新的决策
- 你可以持有仓位跨越多个周期

**开始交易**：

现在，请基于下方提供的市场数据和账户信息：
1. **首先进行自我复盘**（强制，必须输出）
2. **然后做出交易决策**（开仓/平仓/持有/观望）

记住：
- 没有任何建议和限制（除了系统硬性风控底线）
- 一切由你自主决定
- 你的所有推理过程都会被记录和分析
- 这是对 Alpha Arena 的完整复刻，展示你的交易能力

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}
```

### 3.3 数据库扩展

```typescript
// src/database/schema.ts

// 新增表：AI 推理追踪表（完整记录每次推理过程）
export interface ReasoningTrace {
  id: string;                    // 唯一ID
  iteration: number;             // 周期编号
  timestamp: string;             // 时间戳
  
  // 输入数据
  input_market_data: string;     // 市场数据（JSON）
  input_account_info: string;    // 账户信息（JSON）
  input_positions: string;       // 持仓信息（JSON）
  input_trade_history: string;   // 历史交易（JSON）
  input_decision_history: string;// 历史决策（JSON）
  
  // AI 推理过程
  reasoning_reflection: string;  // 自我复盘内容
  reasoning_analysis: string;    // 市场分析内容
  reasoning_decision: string;    // 决策理由
  
  // 输出行动
  output_signal: string;         // 信号类型
  output_coin: string | null;    // 币种
  output_leverage: number | null;// 杠杆
  output_quantity: number | null;// 数量
  output_risk_usd: number | null;// 风险金额
  output_confidence: number | null; // 置信度
  output_profit_target: number | null;  // 止盈目标
  output_stop_loss: number | null;      // 止损
  output_invalidation: string | null;   // 失效条件
  output_justification: string | null;  // 决策理由
  
  // 执行结果
  execution_status: string;      // 执行状态
  execution_error: string | null;// 执行错误
  
  // 元数据
  tokens_used: number | null;    // Token 消耗
  latency_ms: number | null;     // 响应延迟
}

// 新增表：持仓峰值追踪表（用于峰值回撤保护）
export interface PositionPeak {
  position_id: string;           // 持仓ID
  peak_pnl_percent: number;      // 峰值盈利百分比
  peak_pnl_usd: number;          // 峰值盈利金额
  peak_timestamp: string;        // 达到峰值的时间
  current_pnl_percent: number;   // 当前盈利百分比
  drawdown_percent: number;      // 回撤百分比
  updated_at: string;            // 更新时间
}
```

### 3.4 环境变量配置

```bash
# .env 文件新增配置

# ==================== DeepSeek Alpha Arena 策略配置 ====================

# 策略选择
TRADING_STRATEGY=deepseek-alpha        # 使用 DeepSeek Alpha Arena 策略

# 交易周期（建议 5-10 分钟，对标 Alpha Arena 的 2-3 分钟）
TRADING_INTERVAL_MINUTES=5             # 5分钟执行一次（可选：5, 10, 15, 20）

# 初始资金（建议 $1,000 - $10,000）
INITIAL_BALANCE=10000                  # $10,000（对标 Alpha Arena）

# DeepSeek API 配置
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL_NAME=deepseek-chat            # DeepSeek v3.2
OPENAI_API_KEY=your_deepseek_api_key

# 或使用 OpenRouter 访问 DeepSeek
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# AI_MODEL_NAME=deepseek/deepseek-v3.2-exp
# OPENAI_API_KEY=your_openrouter_api_key

# 交易所配置
EXCHANGE=gate                          # 使用 Gate.io
GATE_USE_TESTNET=true                  # 建议先在测试网运行
GATE_API_KEY=your_gate_api_key
GATE_API_SECRET=your_gate_api_secret

# 风控参数（对标 Alpha Arena）
MAX_LEVERAGE=25                        # 最大杠杆 25 倍
MAX_POSITIONS=5                        # 最大持仓 5 个
MAX_HOLDING_HOURS=36                   # 最大持仓时间 36 小时
EXTREME_STOP_LOSS_PERCENT=-30          # 极端止损 -30%

# Alpha Arena 特色：是否启用强制自我复盘
ENABLE_FORCED_REFLECTION=true          # 启用强制自我复盘

# Alpha Arena 特色：是否记录完整推理过程
ENABLE_REASONING_TRACE=true            # 启用推理追踪

# Alpha Arena 特色：是否启用双重防护模式
ENABLE_DUAL_PROTECTION=true            # 启用双重防护
```

---

## 四、运行流程

### 4.1 启动流程

```bash
# 1. 克隆项目
git clone <repository-url>
cd open-nof1.ai

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
nano .env  # 编辑配置，使用 deepseek-alpha 策略

# 4. 初始化数据库
npm run db:init

# 5. 启动交易系统
npm run trading:start

# 6. 访问监控界面
open http://localhost:3100
```

### 4.2 监控指标

在 Web 界面上实时监控以下指标：

1. **账户指标**
   - 总资产
   - 可用余额
   - 未实现盈亏
   - 收益率
   - 夏普比率

2. **持仓概览**
   - 当前持仓列表
   - 每个持仓的盈亏
   - 持仓时间
   - 杠杆倍数

3. **交易历史**
   - 最近交易记录
   - 胜率统计
   - 盈亏分布

4. **AI 推理追踪**（Alpha Arena 特色）
   - 每次自我复盘内容
   - 市场分析过程
   - 决策理由
   - 置信度评分
   - Token 消耗和响应延迟

---

## 五、测试与验证

### 5.1 测试网测试（必须）

```bash
# 在 .env 中配置
GATE_USE_TESTNET=true
INITIAL_BALANCE=10000  # 测试网虚拟资金

# 测试目标：
# - 运行至少 7 天
# - 记录所有推理追踪
# - 分析 AI 的行为模式
# - 验证双重防护机制
# - 统计胜率和收益率
```

### 5.2 行为分析（对标 Alpha Arena）

分析 DeepSeek 的交易行为特征：

1. **多空倾向**
   - 做多次数 vs 做空次数
   - 多空比例

2. **持仓时长**
   - 平均持仓时间
   - 最长/最短持仓

3. **交易频率**
   - 每天交易次数
   - 空仓时间占比

4. **风险姿态**
   - 平均杠杆倍数
   - 平均仓位大小

5. **置信度分布**
   - 置信度分数统计
   - 置信度与实际表现的关系

6. **止盈止损习惯**
   - 止损距离统计
   - 止盈目标统计
   - 主动止损 vs 自动止损比例

7. **同时持仓数**
   - 平均持仓数
   - 是否偏好分散或集中

8. **失效条件设置**
   - 常用的失效条件类型
   - 失效条件的有效性

---

## 六、对比分析框架

### 6.1 与 Alpha Arena 其他模型对比

| 指标 | DeepSeek | GPT-5 | Gemini 2.5 Pro | Claude 4.5 | Grok 4 | Qwen3-Max |
|------|----------|-------|----------------|------------|--------|-----------|
| 多空倾向 | TBD | 做空频繁 | 做空频繁 | 几乎不做空 | 做空频繁 | TBD |
| 平均持仓时长 | TBD | 中等 | 短 | 中等 | 最长 | TBD |
| 交易频率 | TBD | 中等 | 最活跃 | 中等 | 最不活跃 | TBD |
| 平均仓位大小 | TBD | 小 | 小 | 中等 | 中等 | 最大 |
| 平均置信度 | TBD | 最低 | 中等 | 中等 | 中等 | 最高 |
| 止损距离 | TBD | 中等 | 紧 | 中等 | 松 | 最紧 |
| 止盈距离 | TBD | 中等 | 紧 | 中等 | 松 | 最紧 |
| 同时持仓数 | TBD | 多 | 多 | 1-2个 | 多 | 1-2个 |

### 6.2 脆弱性分析

记录 DeepSeek 在以下方面的表现：

1. **排序偏差**
   - 是否能正确理解"最旧→最新"的数据顺序
   - 是否会误读时间序列

2. **术语模糊**
   - 对"可用余额"、"自由抵押品"等术语的理解
   - 是否会因术语混淆而犹豫

3. **规则规避**
   - 是否会尝试绕过风控规则
   - 内部推理与外部输出是否一致

4. **自引用混乱**
   - 是否会误读或矛盾自己的止盈止损计划
   - 执行自己制定的计划时是否困难

5. **费用意识**
   - 是否理解交易成本
   - 是否会过度交易导致费用侵蚀利润

---

## 七、预期成果

### 7.1 短期目标（1-2周）

1. ✅ 策略成功部署并在测试网稳定运行
2. ✅ 完整记录所有推理追踪数据
3. ✅ 验证双重防护机制有效性
4. ✅ 生成初步行为分析报告

### 7.2 中期目标（1个月）

1. ✅ 完成 DeepSeek 完整行为画像
2. ✅ 对比分析与 Alpha Arena 其他模型的差异
3. ✅ 识别 DeepSeek 的独特优势和缺陷
4. ✅ 优化提示词以提升性能

### 7.3 长期目标（3个月）

1. ✅ 发布 DeepSeek Alpha Arena 测试报告
2. ✅ 开源完整实现代码和数据
3. ✅ 为 AI 交易领域提供有价值的研究数据
4. ✅ 探索 Season 2 改进方向

---

## 八、风险声明

### 8.1 交易风险

- 加密货币交易具有高风险，可能导致全部资金损失
- 务必先在测试网充分测试
- 仅投资您能承受损失的资金
- AI 决策不保证盈利

### 8.2 技术风险

- AI 模型可能出现意外行为
- 网络延迟可能影响交易执行
- 交易所 API 可能出现故障
- 代码可能存在 bug

### 8.3 合规风险

- 请确保您的所在地允许加密货币交易
- 请遵守当地法律法规
- 本项目仅供研究和教育目的

---

## 九、参与贡献

### 9.1 如何贡献

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/deepseek-alpha-arena`)
3. 提交更改 (`git commit -m 'feat: 添加 DeepSeek Alpha Arena 策略'`)
4. 推送到分支 (`git push origin feature/deepseek-alpha-arena`)
5. 开启 Pull Request

### 9.2 贡献方向

- 提示词优化
- 行为分析工具
- 可视化界面改进
- 数据分析脚本
- 文档完善

---

## 十、路线图

### Phase 1: 基础实现（Week 1-2）

- [x] 策略参数配置
- [x] 提示词设计
- [ ] 代码实现
- [ ] 测试网部署
- [ ] 基础监控

### Phase 2: 数据收集（Week 3-4）

- [ ] 运行至少 7 天
- [ ] 记录所有推理追踪
- [ ] 收集交易数据
- [ ] 初步行为分析

### Phase 3: 分析优化（Week 5-6）

- [ ] 深度行为分析
- [ ] 对比 Alpha Arena 数据
- [ ] 识别优势和缺陷
- [ ] 提示词优化

### Phase 4: 发布报告（Week 7-8）

- [ ] 撰写完整报告
- [ ] 开源代码和数据
- [ ] 社区分享
- [ ] 收集反馈

### Phase 5: Season 2 规划（Week 9-12）

- [ ] 引入更多特征
- [ ] 改进框架设计
- [ ] 增加统计严谨性
- [ ] 探索多模型对比

---

## 十一、参考资料

1. **Alpha Arena 技术文章**
   - URL: https://nof1.ai/blog/TechPost1
   - 本地文档: `./Alpha_Arena_技术分析.md`

2. **当前项目文档**
   - README: `./README_ZH.md`
   - 策略文档: `./docs/TRADING_STRATEGIES_ZH.md`

3. **DeepSeek 文档**
   - API 文档: https://platform.deepseek.com/api-docs/
   - 模型性能: https://github.com/deepseek-ai/DeepSeek-V3

4. **Gate.io API 文档**
   - API 参考: https://www.gate.io/docs/developers/apiv4/
   - 测试网: https://testnet.gate.com

---

## 十二、联系方式

### 技术支持

- GitHub Issues: [提交问题](https://github.com/195440/open-nof1.ai/issues)
- Telegram 群: [加入讨论](https://t.me/+E7av1nVEk5E1ZjY9)

### 商业合作

- Email: [待补充]

---

## 附录 A：完整提示词示例

参见 `./prompts/deepseek_alpha_arena_full_example.md`

## 附录 B：数据库 Schema

参见 `./database/schema_deepseek_alpha_arena.sql`

## 附录 C：行为分析工具

参见 `./scripts/analyze_deepseek_behavior.ts`

---

**文档版本**: v1.0  
**最后更新**: 2025-11-15  
**状态**: 待评审  

---

## 评审检查清单

请在评审时检查以下方面：

- [ ] 策略设计是否完整复刻了 Alpha Arena 的核心机制？
- [ ] 提示词设计是否足够简洁且不提供任何策略建议？
- [ ] 双重防护机制是否设计合理？
- [ ] 自我复盘机制是否可行？
- [ ] 数据库设计是否能完整记录推理过程？
- [ ] 实现方案是否技术可行？
- [ ] 测试计划是否充分？
- [ ] 风险声明是否完整？
- [ ] 文档是否清晰易懂？
- [ ] 是否还有遗漏的重要方面？

---

**期待您的反馈！** 🚀

