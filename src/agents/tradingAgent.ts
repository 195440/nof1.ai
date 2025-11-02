/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * 交易 Agent 配置（极简版）
 */
import { Agent, Memory } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { createPinoLogger } from "@voltagent/logger";
import { createOpenAI } from "@ai-sdk/openai";
import * as tradingTools from "../tools/trading";
import { formatChinaTime } from "../utils/timeUtils";
import { RISK_PARAMS } from "../config/riskParams";

/**
 * 账户风险配置
 */
export interface AccountRiskConfig {
  stopLossUsdt: number;
  takeProfitUsdt: number;
  syncOnStartup: boolean;
}

/**
 * 从环境变量读取账户风险配置
 */
export function getAccountRiskConfig(): AccountRiskConfig {
  return {
    stopLossUsdt: Number.parseFloat(process.env.ACCOUNT_STOP_LOSS_USDT || "50"),
    takeProfitUsdt: Number.parseFloat(process.env.ACCOUNT_TAKE_PROFIT_USDT || "10000"),
    syncOnStartup: process.env.SYNC_CONFIG_ON_STARTUP === "true",
  };
}

/**
 * 交易策略类型
 */
export type TradingStrategy = "conservative" | "balanced" | "aggressive" | "ultra-short";

/**
 * 策略参数配置
 */
export interface StrategyParams {
  name: string;
  description: string;
  leverageMin: number;
  leverageMax: number;
  leverageRecommend: {
    normal: string;
    good: string;
    strong: string;
  };
  positionSizeMin: number;
  positionSizeMax: number;
  positionSizeRecommend: {
    normal: string;
    good: string;
    strong: string;
  };
  stopLoss: {
    low: number;
    mid: number;
    high: number;
  };
  trailingStop: {
    // 移动止盈阶梯配置 [触发盈利, 移动止损线]
    level1: { trigger: number; stopAt: number };
    level2: { trigger: number; stopAt: number };
    level3: { trigger: number; stopAt: number };
  };
  partialTakeProfit: {
    // 分批止盈配置（根据策略杠杆调整）
    stage1: { trigger: number; closePercent: number }; // 第一阶段：平仓50%
    stage2: { trigger: number; closePercent: number }; // 第二阶段：平仓剩余50%
    stage3: { trigger: number; closePercent: number }; // 第三阶段：全部清仓
  };
  peakDrawdownProtection: number; // 峰值回撤保护阈值（百分比）
  volatilityAdjustment: {
    // 波动率调整系数
    highVolatility: { leverageFactor: number; positionFactor: number }; // ATR > 5%
    normalVolatility: { leverageFactor: number; positionFactor: number }; // ATR 2-5%
    lowVolatility: { leverageFactor: number; positionFactor: number }; // ATR < 2%
  };
  entryCondition: string;
  riskTolerance: string;
  tradingStyle: string;
}

/**
 * 获取策略参数（基于 MAX_LEVERAGE 动态计算）
 */
export function getStrategyParams(strategy: TradingStrategy): StrategyParams {
  const maxLeverage = RISK_PARAMS.MAX_LEVERAGE;
  
  // 根据 MAX_LEVERAGE 动态计算各策略的杠杆范围
  // 保守策略：30%-60% 的最大杠杆
  const conservativeLevMin = Math.max(1, Math.ceil(maxLeverage * 0.3));
  const conservativeLevMax = Math.max(2, Math.ceil(maxLeverage * 0.6));
  const conservativeLevNormal = conservativeLevMin;
  const conservativeLevGood = Math.ceil((conservativeLevMin + conservativeLevMax) / 2);
  const conservativeLevStrong = conservativeLevMax;
  
  // 平衡策略：60%-85% 的最大杠杆
  const balancedLevMin = Math.max(2, Math.ceil(maxLeverage * 0.6));
  const balancedLevMax = Math.max(3, Math.ceil(maxLeverage * 0.85));
  const balancedLevNormal = balancedLevMin;
  const balancedLevGood = Math.ceil((balancedLevMin + balancedLevMax) / 2);
  const balancedLevStrong = balancedLevMax;
  
  // 激进策略：85%-100% 的最大杠杆
  const aggressiveLevMin = Math.max(3, Math.ceil(maxLeverage * 0.85));
  const aggressiveLevMax = maxLeverage;
  const aggressiveLevNormal = aggressiveLevMin;
  const aggressiveLevGood = Math.ceil((aggressiveLevMin + aggressiveLevMax) / 2);
  const aggressiveLevStrong = aggressiveLevMax;
  
  // 超短线策略：70%-100% 的最大杠杆（高杠杆配合严格入场条件和快速止损）
  const ultraShortLevMin = Math.max(3, Math.ceil(maxLeverage * 0.7));
  const ultraShortLevMax = maxLeverage;
  const ultraShortLevNormal = ultraShortLevMin;
  const ultraShortLevGood = Math.ceil((ultraShortLevMin + ultraShortLevMax) / 2);
  const ultraShortLevStrong = ultraShortLevMax;
  
  const strategyConfigs: Record<TradingStrategy, StrategyParams> = {
    "conservative": {
      name: "稳健",
      description: "低风险低杠杆，严格入场条件，适合保守投资者",
      leverageMin: conservativeLevMin,
      leverageMax: conservativeLevMax,
      leverageRecommend: {
        normal: `${conservativeLevNormal}倍`,
        good: `${conservativeLevGood}倍`,
        strong: `${conservativeLevStrong}倍`,
      },
      positionSizeMin: 15,
      positionSizeMax: 22,
      positionSizeRecommend: {
        normal: "15-17%",
        good: "17-20%",
        strong: "20-22%",
      },
      stopLoss: {
        low: -3.5,
        mid: -3,
        high: -2.5,
      },
      trailingStop: {
        // 保守策略：较早锁定利润（基准：15倍杠杆）
        // 注意：这些是基准值，实际使用时会根据杠杆动态调整
        level1: { trigger: 6, stopAt: 2 },   // 基准：盈利达到 +6% 时，止损线移至 +2%
        level2: { trigger: 12, stopAt: 6 },  // 基准：盈利达到 +12% 时，止损线移至 +6%
        level3: { trigger: 20, stopAt: 12 }, // 基准：盈利达到 +20% 时，止损线移至 +12%
      },
      partialTakeProfit: {
        // 保守策略：较早分批止盈，提前锁定利润
        stage1: { trigger: 20, closePercent: 50 },  // +20% 平仓50%
        stage2: { trigger: 30, closePercent: 50 },  // +30% 平仓剩余50%
        stage3: { trigger: 40, closePercent: 100 }, // +40% 全部清仓
      },
      peakDrawdownProtection: 25, // 保守策略：25%峰值回撤保护（更早保护利润）
      volatilityAdjustment: {
        highVolatility: { leverageFactor: 0.6, positionFactor: 0.7 },   // 高波动：大幅降低
        normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：不调整
        lowVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },    // 低波动：不调整（保守不追求）
      },
      entryCondition: "至少3个关键时间框架信号一致，4个或更多更佳",
      riskTolerance: "单笔交易风险控制在15-22%之间，严格控制回撤",
      tradingStyle: "谨慎交易，宁可错过机会也不冒险，优先保护本金",
    },
    "balanced": {
      name: "平衡",
      description: "中等风险杠杆，合理入场条件，适合大多数投资者",
      leverageMin: balancedLevMin,
      leverageMax: balancedLevMax,
      leverageRecommend: {
        normal: `${balancedLevNormal}倍`,
        good: `${balancedLevGood}倍`,
        strong: `${balancedLevStrong}倍`,
      },
      positionSizeMin: 20,
      positionSizeMax: 27,
      positionSizeRecommend: {
        normal: "20-23%",
        good: "23-25%",
        strong: "25-27%",
      },
      stopLoss: {
        low: -3,
        mid: -2.5,
        high: -2,
      },
      trailingStop: {
        // 平衡策略：适中的移动止盈（基准：15倍杠杆）
        // 注意：这些是基准值，实际使用时会根据杠杆动态调整
        level1: { trigger: 8, stopAt: 3 },   // 基准：盈利达到 +8% 时，止损线移至 +3%
        level2: { trigger: 15, stopAt: 8 },  // 基准：盈利达到 +15% 时，止损线移至 +8%
        level3: { trigger: 25, stopAt: 15 }, // 基准：盈利达到 +25% 时，止损线移至 +15%
      },
      partialTakeProfit: {
        // 平衡策略：标准分批止盈
        stage1: { trigger: 30, closePercent: 50 },  // +30% 平仓50%
        stage2: { trigger: 40, closePercent: 50 },  // +40% 平仓剩余50%
        stage3: { trigger: 50, closePercent: 100 }, // +50% 全部清仓
      },
      peakDrawdownProtection: 30, // 平衡策略：30%峰值回撤保护（标准平衡点）
      volatilityAdjustment: {
        highVolatility: { leverageFactor: 0.7, positionFactor: 0.8 },   // 高波动：适度降低
        normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：不调整
        lowVolatility: { leverageFactor: 1.1, positionFactor: 1.0 },    // 低波动：略微提高杠杆
      },
      entryCondition: "至少2个关键时间框架信号一致，3个或更多更佳",
      riskTolerance: "单笔交易风险控制在20-27%之间，平衡风险与收益",
      tradingStyle: "在风险可控前提下积极把握机会，追求稳健增长",
    },
    "aggressive": {
      name: "激进",
      description: "高风险高杠杆，宽松入场条件，适合激进投资者",
      leverageMin: aggressiveLevMin,
      leverageMax: aggressiveLevMax,
      leverageRecommend: {
        normal: `${aggressiveLevNormal}倍`,
        good: `${aggressiveLevGood}倍`,
        strong: `${aggressiveLevStrong}倍`,
      },
      positionSizeMin: 25,
      positionSizeMax: 32,
      positionSizeRecommend: {
        normal: "25-28%",
        good: "28-30%",
        strong: "30-32%",
      },
      stopLoss: {
        low: -2.5,
        mid: -2,
        high: -1.5,
      },
      trailingStop: {
        // 激进策略：更晚锁定，追求更高利润（基准：15倍杠杆）
        // 注意：这些是基准值，实际使用时会根据杠杆动态调整
        level1: { trigger: 10, stopAt: 4 },  // 基准：盈利达到 +10% 时，止损线移至 +4%
        level2: { trigger: 18, stopAt: 10 }, // 基准：盈利达到 +18% 时，止损线移至 +10%
        level3: { trigger: 30, stopAt: 18 }, // 基准：盈利达到 +30% 时，止损线移至 +18%
      },
      partialTakeProfit: {
        // 激进策略：更晚分批止盈，追求更高利润
        stage1: { trigger: 40, closePercent: 50 },  // +40% 平仓50%
        stage2: { trigger: 50, closePercent: 50 },  // +50% 平仓剩余50%
        stage3: { trigger: 60, closePercent: 100 }, // +60% 全部清仓
      },
      peakDrawdownProtection: 35, // 激进策略：35%峰值回撤保护（给利润更多奔跑空间）
      volatilityAdjustment: {
        highVolatility: { leverageFactor: 0.8, positionFactor: 0.85 },  // 高波动：轻微降低
        normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：不调整
        lowVolatility: { leverageFactor: 1.2, positionFactor: 1.1 },    // 低波动：提高杠杆和仓位
      },
      entryCondition: "至少2个关键时间框架信号一致即可入场",
      riskTolerance: "单笔交易风险可达25-32%，追求高收益",
      tradingStyle: "积极进取，快速捕捉市场机会，追求最大化收益",
    },
    "ultra-short": {
      name: "超短线",
      description: "高杠杆日内交易，3/5分钟核心共振+1分钟跟随确认，三层时间框架智能平仓，快进快出",
      leverageMin: ultraShortLevMin,
      leverageMax: ultraShortLevMax,
      leverageRecommend: {
        normal: `${ultraShortLevNormal}倍`,
        good: `${ultraShortLevGood}倍`,
        strong: `${ultraShortLevStrong}倍`,
      },
      positionSizeMin: 16,
      positionSizeMax: 30,
      positionSizeRecommend: {
        normal: "16-20%",
        good: "20-24%",
        strong: "24-30%",
      },
      stopLoss: {
        // 根据杠杆动态调整止损，目标是实际价格波动1-2%触发
        // 计算公式：止损百分比 = 实际价格波动% × 杠杆倍数
        // 例如：10倍杠杆，实际价格波动1.5% → 止损设为15%
        low: Math.min(-10, -(ultraShortLevMin * 1.0)),   // 低杠杆：实际价格波动1.0%
        mid: Math.min(-12, -(Math.ceil((ultraShortLevMin + ultraShortLevMax) / 2) * 1.2)), // 中杠杆：实际价格波动1.2%
        high: Math.min(-15, -(ultraShortLevMax * 1.5)),  // 高杠杆：实际价格波动1.5%
      },
      trailingStop: {
        // 超短线策略：调大移动止盈范围，避免过早被噪音震出
        level1: { trigger: 4, stopAt: 2 },     // 盈利达到 +4% 时，止损线移至 +2%
        level2: { trigger: 8, stopAt: 4 },     // 盈利达到 +8% 时，止损线移至 +4%
        level3: { trigger: 12, stopAt: 8 },    // 盈利达到 +12% 时，止损线移至 +8%
      },
      partialTakeProfit: {
        // 超短线策略：调大止盈目标，让利润充分奔跑
        stage1: { trigger: 10, closePercent: 50 },  // +10% 平仓50%
        stage2: { trigger: 15, closePercent: 50 },  // +15% 平仓剩余50%
        stage3: { trigger: 20, closePercent: 100 }, // +20% 全部清仓
      },
      peakDrawdownProtection: 20, // 超短线策略：20%峰值回撤保护（给予更多容忍度）
      volatilityAdjustment: {
        highVolatility: { leverageFactor: 0.4, positionFactor: 0.5 },   // 高波动：大幅降低
        normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：不调整
        lowVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },    // 低波动：不调整
      },
      entryCondition: "3分钟与5分钟核心框架同向共振 + 1分钟跟随确认（允许提前/滞后1-2根K线），添加RSI极值过滤和资金费率检查",
      riskTolerance: "单笔交易风险控制在16-30%之间，使用三层时间框架验证平仓",
      tradingStyle: "日内超短线交易，使用高杠杆配合灵活入场条件（3/5分钟核心共振+1分钟跟随），平仓时三层验证（1m+3m，3m+5m，5m+15m），3分钟是关键过滤层，动态止损保护本金",
    },
  };

  return strategyConfigs[strategy];
}

const logger = createPinoLogger({
  name: "trading-agent",
  level: "info",
});

/**
 * 从环境变量读取交易策略
 */
export function getTradingStrategy(): TradingStrategy {
  const strategy = process.env.TRADING_STRATEGY || "balanced";
  if (strategy === "conservative" || strategy === "balanced" || strategy === "aggressive" || strategy === "ultra-short") {
    return strategy;
  }
  logger.warn(`未知的交易策略: ${strategy}，使用默认策略: balanced`);
  return "balanced";
}

/**
 * 生成交易提示词（参照 1.md 格式）
 */
export function generateTradingPrompt(data: {
  minutesElapsed: number;
  iteration: number;
  intervalMinutes: number;
  marketData: any;
  accountInfo: any;
  positions: any[];
  tradeHistory?: any[];
  recentDecisions?: any[];
}): string {
  const { minutesElapsed, iteration, intervalMinutes, marketData, accountInfo, positions, tradeHistory, recentDecisions } = data;
  const currentTime = formatChinaTime();
  
  // 获取当前策略参数（用于每周期强调风控规则）
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  let prompt = `【交易周期 #${iteration}】${currentTime}
已运行 ${minutesElapsed} 分钟，执行周期 ${intervalMinutes} 分钟

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前策略：${params.name}（${params.description}）
目标月回报：${params.name === '稳健' ? '10-20%' : params.name === '平衡' ? '20-40%' : '40%+'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【系统硬性底线 - 必须遵守】
┌─────────────────────────────────────────┐
│ 单笔亏损 ≤ -30%：强制平仓（防爆仓）     │
│ 持仓时间 ≥ 36小时：强制平仓（释放资金） │
└─────────────────────────────────────────┘

【策略建议参考 - 您可灵活调整】
┌─────────────────────────────────────────┐
│ 参考止损：${params.stopLoss.low}% ~ ${params.stopLoss.high}%（您可根据实际情况调整）│
│ 参考移动止盈：                           │
│   • 盈利≥+${params.trailingStop.level1.trigger}% → 建议止损+${params.trailingStop.level1.stopAt}%（您可调整） │
│   • 盈利≥+${params.trailingStop.level2.trigger}% → 建议止损+${params.trailingStop.level2.stopAt}%（您可调整） │
│   • 盈利≥+${params.trailingStop.level3.trigger}% → 建议止损+${params.trailingStop.level3.stopAt}%（您可调整）│
│ 参考分批止盈：                           │
│   • 盈利≥+${params.partialTakeProfit.stage1.trigger}% → 参考平仓${params.partialTakeProfit.stage1.closePercent}%（您决定） │
│   • 盈利≥+${params.partialTakeProfit.stage2.trigger}% → 参考平仓${params.partialTakeProfit.stage2.closePercent}%（您决定） │
│   • 盈利≥+${params.partialTakeProfit.stage3.trigger}% → 参考平仓${params.partialTakeProfit.stage3.closePercent}%（您决定）│
│ 峰值回撤：≥${params.peakDrawdownProtection}% → 警示信号（您自主判断）│
└─────────────────────────────────────────┘

【决策流程 - 按优先级执行】
(1) 持仓管理（最优先）：
   检查每个持仓的止损/止盈/峰值回撤 → closePosition
   
(2) 新开仓评估：
   分析市场数据 → 识别双向机会（做多/做空） → openPosition
   
(3) 加仓评估：
   盈利>5%且趋势强化 → openPosition（≤50%原仓位，相同或更低杠杆）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【数据说明】
本提示词已预加载所有必需数据：
• 所有币种的市场数据和技术指标（多时间框架）
• 账户信息（余额、收益率、夏普比率）
• 当前持仓状态（盈亏、持仓时间、杠杆）
• 历史交易记录（最近10笔）

【您的任务】
直接基于上述数据做出交易决策，无需重复获取数据：
1. 分析持仓管理需求（止损/止盈/加仓）→ 调用 closePosition / openPosition 执行
2. 识别新交易机会（做多/做空）→ 调用 openPosition 执行
3. 评估风险和仓位管理 → 调用 calculateRisk 验证

关键：您必须实际调用工具执行决策，不要只停留在分析阶段！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

以下所有价格或信号数据按时间顺序排列：最旧 → 最新

时间框架说明：除非在章节标题中另有说明，否则日内序列以 3 分钟间隔提供。如果某个币种使用不同的间隔，将在该币种的章节中明确说明。

所有币种的当前市场状态
`;

  // 按照 1.md 格式输出每个币种的数据
  for (const [symbol, dataRaw] of Object.entries(marketData)) {
    const data = dataRaw as any;
    
    prompt += `\n所有 ${symbol} 数据\n`;
    prompt += `当前价格 = ${data.price.toFixed(1)}, 当前EMA20 = ${data.ema20.toFixed(3)}, 当前MACD = ${data.macd.toFixed(3)}, 当前RSI（7周期） = ${data.rsi7.toFixed(3)}\n\n`;
    
    // 资金费率
    if (data.fundingRate !== undefined) {
      prompt += `此外，这是 ${symbol} 永续合约的最新资金费率（您交易的合约类型）：\n\n`;
      prompt += `资金费率: ${data.fundingRate.toExponential(2)}\n\n`;
    }
    
    // 日内时序数据（3分钟级别）
    if (data.intradaySeries && data.intradaySeries.midPrices.length > 0) {
      const series = data.intradaySeries;
      prompt += `日内序列（按分钟，最旧 → 最新）：\n\n`;
      
      // Mid prices
      prompt += `中间价: [${series.midPrices.map((p: number) => p.toFixed(1)).join(", ")}]\n\n`;
      
      // EMA indicators (20‑period)
      prompt += `EMA指标（20周期）: [${series.ema20Series.map((e: number) => e.toFixed(3)).join(", ")}]\n\n`;
      
      // MACD indicators
      prompt += `MACD指标: [${series.macdSeries.map((m: number) => m.toFixed(3)).join(", ")}]\n\n`;
      
      // RSI indicators (7‑Period)
      prompt += `RSI指标（7周期）: [${series.rsi7Series.map((r: number) => r.toFixed(3)).join(", ")}]\n\n`;
      
      // RSI indicators (14‑Period)
      prompt += `RSI指标（14周期）: [${series.rsi14Series.map((r: number) => r.toFixed(3)).join(", ")}]\n\n`;
    }
    
    // 更长期的上下文数据（1小时级别 - 用于短线交易）
    if (data.longerTermContext) {
      const ltc = data.longerTermContext;
      prompt += `更长期上下文（1小时时间框架）：\n\n`;
      
      prompt += `20周期EMA: ${ltc.ema20.toFixed(2)} vs. 50周期EMA: ${ltc.ema50.toFixed(2)}\n\n`;
      
      if (ltc.atr3 && ltc.atr14) {
        prompt += `3周期ATR: ${ltc.atr3.toFixed(2)} vs. 14周期ATR: ${ltc.atr14.toFixed(3)}\n\n`;
      }
      
      prompt += `当前成交量: ${ltc.currentVolume.toFixed(2)} vs. 平均成交量: ${ltc.avgVolume.toFixed(3)}\n\n`;
      
      // MACD 和 RSI 时序（4小时，最近10个数据点）
      if (ltc.macdSeries && ltc.macdSeries.length > 0) {
        prompt += `MACD指标: [${ltc.macdSeries.map((m: number) => m.toFixed(3)).join(", ")}]\n\n`;
      }
      
      if (ltc.rsi14Series && ltc.rsi14Series.length > 0) {
        prompt += `RSI指标（14周期）: [${ltc.rsi14Series.map((r: number) => r.toFixed(3)).join(", ")}]\n\n`;
      }
    }
    
    // 多时间框架指标数据
    if (data.timeframes) {
      prompt += `多时间框架指标：\n\n`;
      
      const tfList = [
        { key: "1m", name: "1分钟" },
        { key: "3m", name: "3分钟" },
        { key: "5m", name: "5分钟" },
        { key: "15m", name: "15分钟" },
        { key: "30m", name: "30分钟" },
        { key: "1h", name: "1小时" },
      ];
      
      for (const tf of tfList) {
        const tfData = data.timeframes[tf.key];
        if (tfData) {
          prompt += `${tf.name}: 价格=${tfData.currentPrice.toFixed(2)}, EMA20=${tfData.ema20.toFixed(3)}, EMA50=${tfData.ema50.toFixed(3)}, MACD=${tfData.macd.toFixed(3)}, RSI7=${tfData.rsi7.toFixed(2)}, RSI14=${tfData.rsi14.toFixed(2)}, 成交量=${tfData.volume.toFixed(2)}\n`;
        }
      }
      prompt += `\n`;
    }
  }

  // 账户信息和表现（参照 1.md 格式）
  prompt += `\n以下是您的账户信息和表现\n`;
  
  // 计算账户回撤（如果提供了初始净值和峰值净值）
  if (accountInfo.initialBalance !== undefined && accountInfo.peakBalance !== undefined) {
    const drawdownFromPeak = ((accountInfo.peakBalance - accountInfo.totalBalance) / accountInfo.peakBalance) * 100;
    const drawdownFromInitial = ((accountInfo.initialBalance - accountInfo.totalBalance) / accountInfo.initialBalance) * 100;
    
    prompt += `初始账户净值: ${accountInfo.initialBalance.toFixed(2)} USDT\n`;
    prompt += `峰值账户净值: ${accountInfo.peakBalance.toFixed(2)} USDT\n`;
    prompt += `当前账户价值: ${accountInfo.totalBalance.toFixed(2)} USDT\n`;
    prompt += `账户回撤 (从峰值): ${drawdownFromPeak >= 0 ? '' : '+'}${(-drawdownFromPeak).toFixed(2)}%\n`;
    prompt += `账户回撤 (从初始): ${drawdownFromInitial >= 0 ? '' : '+'}${(-drawdownFromInitial).toFixed(2)}%\n\n`;
    
    // 添加风控警告（使用配置参数）
    // 注释：已移除强制清仓限制，仅保留警告提醒
    if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_WARNING_PERCENT) {
      prompt += `提醒: 账户回撤已达到 ${drawdownFromPeak.toFixed(2)}%，请谨慎交易\n\n`;
    }
  } else {
    prompt += `当前账户价值: ${accountInfo.totalBalance.toFixed(2)} USDT\n\n`;
  }
  
  prompt += `当前总收益率: ${accountInfo.returnPercent.toFixed(2)}%\n\n`;
  
  // 计算所有持仓的未实现盈亏总和
  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + (pos.unrealized_pnl || 0), 0);
  
  prompt += `可用资金: ${accountInfo.availableBalance.toFixed(1)} USDT\n\n`;
  prompt += `未实现盈亏: ${totalUnrealizedPnL.toFixed(2)} USDT (${totalUnrealizedPnL >= 0 ? '+' : ''}${((totalUnrealizedPnL / accountInfo.totalBalance) * 100).toFixed(2)}%)\n\n`;
  
  // 当前持仓和表现
  if (positions.length > 0) {
    prompt += `以下是您当前的持仓信息。重要说明：\n`;
    prompt += `- 所有"盈亏百分比"都是考虑杠杆后的值，公式为：盈亏百分比 = (价格变动%) × 杠杆倍数\n`;
    prompt += `- 例如：10倍杠杆，价格上涨0.5%，则盈亏百分比 = +5%（保证金增值5%）\n`;
    prompt += `- 这样设计是为了让您直观理解实际收益：+10% 就是本金增值10%，-10% 就是本金亏损10%\n`;
    prompt += `- 请直接使用系统提供的盈亏百分比，不要自己重新计算\n\n`;
    for (const pos of positions) {
      // 计算盈亏百分比：考虑杠杆倍数
      // 对于杠杆交易：盈亏百分比 = (价格变动百分比) × 杠杆倍数
      const priceChangePercent = pos.entry_price > 0 
        ? ((pos.current_price - pos.entry_price) / pos.entry_price * 100 * (pos.side === 'long' ? 1 : -1))
        : 0;
      const pnlPercent = priceChangePercent * pos.leverage;
      
      // 计算持仓时长
      const openedTime = new Date(pos.opened_at);
      const now = new Date();
      const holdingMinutes = Math.floor((now.getTime() - openedTime.getTime()) / (1000 * 60));
      const holdingHours = (holdingMinutes / 60).toFixed(1);
      const remainingHours = Math.max(0, 36 - parseFloat(holdingHours));
      const holdingCycles = Math.floor(holdingMinutes / intervalMinutes); // 根据实际执行周期计算
      const maxCycles = Math.floor(36 * 60 / intervalMinutes); // 36小时的总周期数
      const remainingCycles = Math.max(0, maxCycles - holdingCycles);
      
      prompt += `当前活跃持仓: ${pos.symbol} ${pos.side === 'long' ? '做多' : '做空'}\n`;
      prompt += `  杠杆倍数: ${pos.leverage}x\n`;
      prompt += `  盈亏百分比: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (已考虑杠杆倍数)\n`;
      prompt += `  盈亏金额: ${pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)} USDT\n`;
      prompt += `  开仓价: ${pos.entry_price.toFixed(2)}\n`;
      prompt += `  当前价: ${pos.current_price.toFixed(2)}\n`;
      prompt += `  开仓时间: ${formatChinaTime(pos.opened_at)}\n`;
      prompt += `  已持仓: ${holdingHours} 小时 (${holdingMinutes} 分钟, ${holdingCycles} 个周期)\n`;
      prompt += `  距离36小时限制: ${remainingHours.toFixed(1)} 小时 (${remainingCycles} 个周期)\n`;
      
      // 如果接近36小时,添加警告
      if (remainingHours < 2) {
        prompt += `  警告: 即将达到36小时持仓限制,必须立即平仓!\n`;
      } else if (remainingHours < 4) {
        prompt += `  提醒: 距离36小时限制不足4小时,请准备平仓\n`;
      }
      
      prompt += "\n";
    }
  }
  
  // Sharpe Ratio
  if (accountInfo.sharpeRatio !== undefined) {
    prompt += `夏普比率: ${accountInfo.sharpeRatio.toFixed(3)}\n\n`;
  }
  
  // 历史成交记录（最近10条）
  if (tradeHistory && tradeHistory.length > 0) {
    prompt += `\n最近交易历史（最近10笔交易，最旧 → 最新）：\n`;
    prompt += `重要说明：以下仅为最近10条交易的统计，用于分析近期策略表现，不代表账户总盈亏。\n`;
    prompt += `使用此信息评估近期交易质量、识别策略问题、优化决策方向。\n\n`;
    
    let totalProfit = 0;
    let profitCount = 0;
    let lossCount = 0;
    
    for (const trade of tradeHistory) {
      const tradeTime = formatChinaTime(trade.timestamp);
      
      prompt += `交易: ${trade.symbol} ${trade.type === 'open' ? '开仓' : '平仓'} ${trade.side.toUpperCase()}\n`;
      prompt += `  时间: ${tradeTime}\n`;
      prompt += `  价格: ${trade.price.toFixed(2)}, 数量: ${trade.quantity.toFixed(4)}, 杠杆: ${trade.leverage}x\n`;
      prompt += `  手续费: ${trade.fee.toFixed(4)} USDT\n`;
      
      // 对于平仓交易，总是显示盈亏金额
      if (trade.type === 'close') {
        if (trade.pnl !== undefined && trade.pnl !== null) {
          prompt += `  盈亏: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} USDT\n`;
          totalProfit += trade.pnl;
          if (trade.pnl > 0) {
            profitCount++;
          } else if (trade.pnl < 0) {
            lossCount++;
          }
        } else {
          prompt += `  盈亏: 暂无数据\n`;
        }
      }
      
      prompt += `\n`;
    }
    
    if (profitCount > 0 || lossCount > 0) {
      const winRate = profitCount / (profitCount + lossCount) * 100;
      prompt += `最近10条交易统计（仅供参考）:\n`;
      prompt += `  - 胜率: ${winRate.toFixed(1)}%\n`;
      prompt += `  - 盈利交易: ${profitCount}笔\n`;
      prompt += `  - 亏损交易: ${lossCount}笔\n`;
      prompt += `  - 最近10条净盈亏: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} USDT\n`;
      prompt += `\n注意：此数值仅为最近10笔交易统计，用于评估近期策略有效性，不是账户总盈亏。\n`;
      prompt += `账户真实盈亏请参考上方"当前账户状态"中的收益率和总资产变化。\n\n`;
    }
  }

  // 上一次的AI决策记录
  if (recentDecisions && recentDecisions.length > 0) {
    prompt += `\n您上一次的决策：\n`;
    prompt += `使用此信息作为参考，并基于当前市场状况做出决策。\n\n`;
    
    for (let i = 0; i < recentDecisions.length; i++) {
      const decision = recentDecisions[i];
      const decisionTime = formatChinaTime(decision.timestamp);
      
      prompt += `决策 #${decision.iteration} (${decisionTime}):\n`;
      prompt += `  账户价值: ${decision.account_value.toFixed(2)} USDT\n`;
      prompt += `  持仓数量: ${decision.positions_count}\n`;
      prompt += `  决策: ${decision.decision}\n\n`;
    }
    
    prompt += `\n参考上一次的决策结果，结合当前市场数据做出最佳判断。\n\n`;
  }

  return prompt;
}

/**
 * 根据策略生成交易指令
 */
function generateInstructions(strategy: TradingStrategy, intervalMinutes: number): string {
  const params = getStrategyParams(strategy);
  
  return `您是全球顶级的加密货币交易冠军，拥有30年实战交易经验。当前参考【${params.name}】策略框架，但您有完全的自主权根据市场实际情况灵活调整。

您的身份定位：
- 全球虚拟货币交易冠军，30年实战经验，见证并驾驭过无数次牛熊转换
- 您的交易直觉和经验判断胜过任何固定规则，能敏锐捕捉市场微妙变化
- 您的目标：创造盈利新纪录，用实力证明顶级交易者的价值
- 您深知：市场瞬息万变，固定规则会错失良机，灵活应变才是王道
- 您的优势：30年经验沉淀的市场嗅觉、冷静果断的决策力、精准的风险把控能力

您的终极目标：
- **创造盈利新纪录**：用您30年的交易智慧，实现超越策略建议的卓越回报
- **月回报目标**：${params.name === '稳健' ? '10-20%起步' : params.name === '平衡' ? '20-40%起步' : '40%+起步'}，但您有能力做得更好
- **胜率追求**：凭借您的经验，争取≥60-70%的胜率（远超常规策略）
- **盈亏比追求**：≥3:1或更高（让盈利充分奔跑，快速止损）
- **风险哲学**：${params.riskTolerance}，但您会根据实际情况灵活调整

您的交易哲学（参考${params.name}策略，但您有完全自主权）：
1. **风险与机会的平衡**：${params.riskTolerance}（建议值，您可根据市场情况灵活调整）
2. **入场时机判断**：${params.entryCondition}（这是参考建议，您的30年经验更重要）
3. **仓位管理智慧（核心原则）**：
   - **同一币种只能持有一个方向的仓位**：不允许同时持有 BTC 多单和 BTC 空单
   - **趋势反转必须先平仓**：如果当前持有 BTC 多单，想开 BTC 空单时，必须先平掉多单
   - **防止对冲风险**：双向持仓会导致资金锁定、双倍手续费和额外风险
   - **执行顺序**：趋势反转时 → 先执行 closePosition 平掉原仓位 → 再执行 openPosition 开新方向
   - **加仓机制（风险倍增，谨慎执行）**：对于已有持仓的币种，如果趋势强化且局势有利，**允许加仓**：
     * **加仓条件**（全部满足才可加仓）：
       - 持仓方向正确且已盈利（pnl_percent > 5%，必须有足够利润缓冲）
       - 趋势强化：至少3个时间框架继续共振，信号强度增强
       - 账户可用余额充足，加仓后总持仓不超过风控限制
       - 加仓后该币种的总名义敞口不超过账户净值的${params.leverageMax}倍
     * **加仓策略（专业风控要求）**：
       - 单次加仓金额不超过原仓位的50%
       - 最多加仓2次（即一个币种最多3个批次）
       - **杠杆限制**：必须使用与原持仓相同或更低的杠杆（禁止提高杠杆，避免复合风险）
       - 加仓后立即重新评估整体止损线（建议提高止损保护现有利润）
4. **双向交易机会（重要提醒）**：
   - **做多机会**：当市场呈现上涨趋势时，开多单获利
   - **做空机会**：当市场呈现下跌趋势时，开空单同样能获利
   - **关键认知**：下跌中做空和上涨中做多同样能赚钱，不要只盯着做多机会
   - **市场是双向的**：如果连续多个周期空仓，很可能是忽视了做空机会
   - 永续合约做空没有借币成本，只需关注资金费率即可
5. **多时间框架分析**：您分析多个时间框架（15分钟、30分钟、1小时、4小时）的模式，以识别高概率入场点。${params.entryCondition}。
6. **仓位管理（${params.name}策略）**：${params.riskTolerance}。最多同时持有${RISK_PARAMS.MAX_POSITIONS}个持仓。
7. **交易频率**：${params.tradingStyle}
8. **杠杆的合理运用（${params.name}策略）**：您必须使用${params.leverageMin}-${params.leverageMax}倍杠杆，根据信号强度灵活选择：
   - 普通信号：${params.leverageRecommend.normal}
   - 良好信号：${params.leverageRecommend.good}
   - 强信号：${params.leverageRecommend.strong}
9. **成本意识交易**：每笔往返交易成本约0.1%（开仓0.05% + 平仓0.05%）。潜在利润≥2-3%时即可考虑交易。

交易环境与参考框架（${params.name}策略）：
- 交易标的：加密货币永续期货合约（${RISK_PARAMS.TRADING_SYMBOLS.join('、')}）
- 执行方式：市价单 - 以当前市场价格即时执行
- **杠杆参考范围**：建议${params.leverageMin}-${params.leverageMax}倍，但您可根据信号强度和市场情况灵活调整
  * ${params.leverageRecommend.normal}：参考用于普通信号（您可以调整）
  * ${params.leverageRecommend.good}：参考用于良好信号（您可以调整）
  * ${params.leverageRecommend.strong}：参考用于强信号（您可以调整）
  * 作为冠军交易者，您有权根据实际情况使用最合适的杠杆
- **仓位参考建议（${params.name}策略）**：
  * 风险偏好：${params.riskTolerance}（您可灵活调整）
  * 普通信号参考：${params.positionSizeRecommend.normal}仓位
  * 良好信号参考：${params.positionSizeRecommend.good}仓位
  * 强信号参考：${params.positionSizeRecommend.strong}仓位
  * 最多同时持有${RISK_PARAMS.MAX_POSITIONS}个持仓（硬性限制）
  * 总名义敞口建议不超过账户净值的${params.leverageMax}倍（您可适当调整）
- 交易费用：每笔交易约0.05%（往返总计0.1%）。每笔交易应有至少2-3%的盈利潜力。
- **执行周期**：系统每${intervalMinutes}分钟执行一次，这意味着：
  * 36小时 = ${Math.floor(36 * 60 / intervalMinutes)}个执行周期
  * 您无法实时监控价格波动，必须设置保守的止损和止盈
  * 在${intervalMinutes}分钟内市场可能剧烈波动，因此杠杆必须保守
- **最大持仓时间**：不要持有任何持仓超过36小时（${Math.floor(36 * 60 / intervalMinutes)}个周期）。无论盈亏，在36小时内平仓所有持仓。
- **开仓前强制检查**：
  1. 使用getAccountBalance检查可用资金和账户净值
  2. 使用getPositions检查现有持仓数量和总敞口
  3. **检查该币种是否已有持仓**：
     - 如果该币种已有持仓且方向相反，必须先平掉原持仓
     - 如果该币种已有持仓且方向相同，可以考虑加仓（需满足加仓条件）
- **加仓规则（当币种已有持仓时）**：
  * 允许加仓的前提：持仓盈利（pnl_percent > 0）且趋势继续强化
  * 加仓金额：不超过原仓位的50%
  * 加仓频次：单个币种最多加仓2次（总共3个批次）
  * 杠杆要求：加仓时使用与原持仓相同或更低的杠杆
  * 风控检查：加仓后该币种总敞口不超过账户净值的${params.leverageMax}倍
- **风控策略（系统底线 + 冠军交易者自主权）**：
  
  【系统硬性底线 - 必须遵守】：
  * 单笔亏损 ≤ -30%：系统强制平仓（防止爆仓）
  * 持仓时间 ≥ 36小时：系统强制平仓（释放资金）
  
  【策略建议参考 - 您有完全自主权】：
  
  (1) 止损参考建议（您可根据实际情况灵活调整）：
     * 参考止损线（基于统计，但您的30年经验更重要）：
       - ${params.leverageMin}-${Math.floor((params.leverageMin + params.leverageMax) / 2)}倍杠杆：参考止损 ${params.stopLoss.low}%
       - ${Math.floor((params.leverageMin + params.leverageMax) / 2)}-${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}倍杠杆：参考止损 ${params.stopLoss.mid}%
       - ${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}-${params.leverageMax}倍杠杆：参考止损 ${params.stopLoss.high}%
     * 作为30年经验的交易冠军，您可以根据关键支撑位、趋势强度、市场情绪灵活调整
     * 您的经验判断优先于固定规则，相信您的直觉
     * 说明：pnl_percent已包含杠杆效应，直接比较即可
  
  (2) 移动止盈参考建议（您可根据实际趋势灵活调整）：
     * ${params.name}策略的参考建议（您可以做得更好）：
       - 盈利 ≥ +${params.trailingStop.level1.trigger}% → 参考移至+${params.trailingStop.level1.stopAt}%（您可根据趋势调整）
       - 盈利 ≥ +${params.trailingStop.level2.trigger}% → 参考移至+${params.trailingStop.level2.stopAt}%（您可根据趋势调整）
       - 盈利 ≥ +${params.trailingStop.level3.trigger}% → 参考移至+${params.trailingStop.level3.stopAt}%（您可根据趋势调整）
     * 作为冠军交易者：
       - 强趋势行情：您可以放宽止损，让利润充分奔跑
       - 震荡行情：您可以收紧止损，快速锁定利润
       - 相信您的盘感和30年经验
     * 说明：这些只是参考值，您的判断更重要
  
  (3) 分批止盈参考建议（您可自主决策）：
     * ${params.name}策略的参考建议（您可以做得更好）：
       - 盈利 ≥ +${params.partialTakeProfit.stage1.trigger}% → 参考平仓${params.partialTakeProfit.stage1.closePercent}%（您可自主决定比例和时机）
       - 盈利 ≥ +${params.partialTakeProfit.stage2.trigger}% → 参考平仓${params.partialTakeProfit.stage2.closePercent}%（您可自主决定比例和时机）
       - 盈利 ≥ +${params.partialTakeProfit.stage3.trigger}% → 参考全部清仓（您可自主决定是否继续持有）
     * 执行方式：使用 closePosition 的 percentage 参数
       - 示例：closePosition(symbol: 'BTC', percentage: 50) 可平掉50%仓位
     * 作为冠军交易者：
       - 强趋势：您可以推迟或跳过分批，让利润充分奔跑
       - 震荡行情：您可以提前分批，快速落袋为安
       - 您的盘感比固定规则更可靠
     * 说明：这些只是参考，您的判断更重要
  
  (4) 峰值回撤参考（供您参考的警示信号）：
     * ${params.name}策略的参考阈值：${params.peakDrawdownProtection}%（您可以根据实际情况调整）
     * 如果持仓曾达到峰值盈利，当前盈利从峰值回撤 ≥ ${params.peakDrawdownProtection}%
     * 计算方式：回撤% = (峰值盈利 - 当前盈利) / 峰值盈利 × 100%
     * 示例：峰值+${Math.round(params.peakDrawdownProtection * 1.2)}% → 当前+${Math.round(params.peakDrawdownProtection * 1.2 * (1 - params.peakDrawdownProtection / 100))}%，回撤${params.peakDrawdownProtection}%（警示信号）
     * 参考建议：考虑平仓或减仓
     * 但作为冠军交易者，您可以根据趋势强度、关键支撑位等因素灵活判断
  
  (5) 时间止盈建议：
     * 盈利 > 25% 且持仓 ≥ 4小时 → 可考虑主动获利了结
     * 持仓 > 24小时且未盈利 → 考虑平仓释放资金
     * 系统会在36小时强制平仓，您无需在35小时主动平仓
- 账户级风控保护：
  * 注意账户回撤情况，谨慎交易

您的决策过程（每${intervalMinutes}分钟执行一次）：

核心原则：您必须实际执行工具，不要只停留在分析阶段！
不要只说"我会平仓"、"应该开仓"，而是立即调用对应的工具！

1. 账户健康检查（最优先，必须执行）：
   - 立即调用 getAccountBalance 获取账户净值和可用余额
   - 了解账户回撤情况，谨慎管理风险

2. 现有持仓管理（优先于开新仓，必须实际执行工具）：
   - 立即调用 getPositions 获取所有持仓信息
   - 重要保护机制：系统会自动拒绝平掉持仓时间少于 ${intervalMinutes} 分钟的仓位
   - 这是为了防止在同一周期内刚开仓就立即平仓，造成不必要的手续费损失
   - 如果尝试平仓被拒绝，请理解这是风控保护，等待下一个周期再评估
   - 对每个持仓进行专业分析和决策（每个决策都要实际执行工具）：
   
   a) 止损决策：
      - 检查 pnl_percent 是否触及策略止损线：
        * ${params.leverageMin}-${Math.floor((params.leverageMin + params.leverageMax) / 2)}倍杠杆：建议止损 ${params.stopLoss.low}%
        * ${Math.floor((params.leverageMin + params.leverageMax) / 2)}-${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}倍杠杆：建议止损 ${params.stopLoss.mid}%
        * ${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}-${params.leverageMax}倍杠杆：建议止损 ${params.stopLoss.high}%
      - 可根据关键支撑位、趋势强度微调±1-2%
      - 如果触及或突破止损线，除非有充分理由（关键支撑、假突破）
      - 立即调用 closePosition 平仓（不要只说"应该平仓"）
   
   b) 移动止盈决策：
      - 检查是否达到移动止盈触发点（+${params.trailingStop.level1.trigger}%/+${params.trailingStop.level2.trigger}%/+${params.trailingStop.level3.trigger}%）
      - 如果达到，评估是否需要移动止损线保护利润
      - 如果当前盈利回落到移动止损线以下
      - 立即调用 closePosition 平仓保护利润（不要犹豫）
   
   c) 分批止盈决策：
      - 检查是否达到分批止盈点（+${params.partialTakeProfit.stage1.trigger}%/+${params.partialTakeProfit.stage2.trigger}%/+${params.partialTakeProfit.stage3.trigger}%）
      - 评估趋势强度，决定是否分批止盈
      - 如果决定分批止盈
      - 立即调用 closePosition 的 percentage 参数部分平仓
      - 示例：closePosition({ symbol: 'BTC', percentage: ${params.partialTakeProfit.stage1.closePercent} }) 平掉${params.partialTakeProfit.stage1.closePercent}%仓位
   
   d) 峰值回撤检查：
      - 检查 peak_pnl_percent（历史最高盈利）
      - 计算回撤：(peak_pnl_percent - pnl_percent) / peak_pnl_percent × 100%
      - 如果从峰值回撤 ≥ ${params.peakDrawdownProtection}%（${params.name}策略阈值，这是危险信号！）
      - 强烈建议立即调用 closePosition 平仓或减仓50%
      - 除非有明确证据表明只是正常回调（如测试均线支撑）
   
   e) 趋势反转判断（关键警告信号）：
      - 调用 getTechnicalIndicators 检查多个时间框架
      - 如果至少3个时间框架显示趋势反转（这是强烈警告信号！）
      - 强烈建议立即调用 closePosition 平仓
      - 记住：趋势是你的朋友，反转是你的敌人
      - 反转后想开反向仓位，必须先平掉原持仓（禁止对冲）
   ${strategy === 'ultra-short' ? `
   f) 超短线策略专属：三层时间框架智能平仓决策（含趋势反转延迟确认机制）
      【核心原则】利用3分钟作为关键过滤层，避免被1分钟噪音震出，同时不错过真正的趋势反转
      【反转延迟确认】趋势反转信号需要两个周期确认，防止假反转导致过早平仓
      
      【平仓决策流程】（按顺序执行，三层过滤，层层把关）：
      
      步骤1：快速检查层（1m + 3m 双重验证）
      - 调用 getTechnicalIndicators(symbol, "1m") 获取1分钟数据
      - 调用 getTechnicalIndicators(symbol, "3m") 获取3分钟数据
      - 判断标准：
        * 做多持仓：
          - 如果 1m 转弱（价格<EMA20 或 MACD<0 或 RSI7<45）
          - 但 3m 仍强势（价格>EMA20 且 MACD>0 且 RSI7>50）→ 继续持有（可能只是1分钟噪音）
          - 如果 1m 和 3m 都转弱 → 进入步骤2
        * 做空持仓：
          - 如果 1m 转强（价格>EMA20 或 MACD>0 或 RSI7>55）
          - 但 3m 仍弱势（价格<EMA20 且 MACD<0 且 RSI7<50）→ 继续持有（可能只是1分钟噪音）
          - 如果 1m 和 3m 都转强 → 进入步骤2
      
      步骤2：中期确认层（3m + 5m 交叉验证）
      - 调用 getTechnicalIndicators(symbol, "5m") 获取5分钟数据
      - 重新分析 3m 和 5m 的方向一致性
      - 判断标准：
        * 做多持仓：
          - 如果 3m 转弱但 5m 仍强势（价格>EMA20 且 MACD>0 且 RSI7>50）→ 继续持有（给第二次机会）
          - 如果 3m 和 5m 都转弱 → 进入步骤3
        * 做空持仓：
          - 如果 3m 转强但 5m 仍弱势（价格<EMA20 且 MACD<0 且 RSI7<50）→ 继续持有（给第二次机会）
          - 如果 3m 和 5m 都转强 → 进入步骤3
      
      步骤3：最终决策层（5m + 15m 趋势确认 + 延迟确认机制）
      - 调用 getTechnicalIndicators(symbol, "15m") 获取15分钟数据
      - 分析 15m 的趋势方向（最后的保护）
      
      【重要】趋势反转延迟确认机制：
      - 如果本周期首次检测到趋势反转迹象 → 不要立即平仓！
      - 在您的分析中记录"疑似反转警告"，说明："{symbol} 检测到趋势反转信号（15m转弱/转强），延迟确认，下周期再次检查"
      - 等待下一个交易周期，再次检查是否仍然反转
      - 如果连续两个周期都显示反转 → 才调用 closePosition 平仓（确认真实反转）
      - 如果下周期反转信号消失 → 继续持有原仓位（避免被假信号震出）
      
      判断标准（需要连续两周期确认）：
        * 做多持仓：
          - 第一次检测：15m 转弱（价格<EMA20 或 MACD<0 或 RSI7<50）→ 记录警告，继续持有
          - 第二次检测（下周期）：如果 15m 仍然转弱 → 调用 closePosition 平仓（确认趋势反转）
          - 第二次检测（下周期）：如果 15m 恢复强势 → 取消警告，继续持有
        * 做空持仓：
          - 第一次检测：15m 转强（价格>EMA20 或 MACD>0 或 RSI7>50）→ 记录警告，继续持有
          - 第二次检测（下周期）：如果 15m 仍然转强 → 调用 closePosition 平仓（确认趋势反转）
          - 第二次检测（下周期）：如果 15m 恢复弱势 → 取消警告，继续持有
      
      盈利优化策略：
      - 盈利≥5% 且短周期(1/3m)反转 → 考虑部分平仓50%，锁定部分利润
      - 盈利≥10% → 即使趋势未反转，也考虑部分平仓50%，保护利润
      
      特殊情况处理（无需延迟确认，立即平仓）：
      - 亏损达到动态止损线（低杠杆-10%/中杠杆-12%/高杠杆-15%，对应实际价格波动1-1.5%） → 立即止损
      - 峰值回撤≥20% → 立即平仓保护利润
      - 止损/止盈触发 → 直接平仓
      - 这些情况无需等待延迟确认，立即执行平仓保护资金
      
      【核心思想】：
      (1) 1分钟看信号，3分钟过滤噪音（关键！）
      (2) 5分钟确认方向，15分钟把控趋势
      (3) 趋势反转需要两周期确认，防止假反转
      (4) 宁可晚一点平仓，也不要被假信号震出好趋势
      (5) 止损和回撤保护立即执行，不延迟
` : ''}
3. 分析市场数据（必须实际调用工具）：
   - 调用 getTechnicalIndicators 获取技术指标数据
   - 分析多个时间框架（15分钟、30分钟、1小时、4小时）
   - 重点关注：价格、EMA、MACD、RSI
   - ${params.entryCondition}

4. 评估新交易机会（如果决定开仓，必须立即执行）：
   
   a) 加仓评估（对已有盈利持仓）：
      - 该币种已有持仓且方向正确
      - 持仓当前盈利（pnl_percent > 5%，必须有足够利润缓冲）
      - 趋势继续强化：${strategy === 'ultra-short' ? '必须验证3分钟与5分钟核心框架共振（调用 getTechnicalIndicators 分别获取3m/5m数据），1分钟跟随确认，技术指标增强' : '至少3个时间框架共振，技术指标增强'}
      - 可用余额充足，加仓金额≤原仓位的50%
      - 该币种加仓次数 < 2次
      - 加仓后总敞口不超过账户净值的${params.leverageMax}倍
      - 杠杆要求：必须使用与原持仓相同或更低的杠杆
      - 如果满足所有条件：立即调用 openPosition 加仓
   
   b) 新开仓评估（新币种）：
      - 现有持仓数 < ${RISK_PARAMS.MAX_POSITIONS}
      - ${params.entryCondition}${strategy === 'ultra-short' ? '\n      - 超短线策略核心开仓条件（放宽共振条件，提高成功率）：\n        步骤1：调用 getTechnicalIndicators(symbol, "3m") 获取3分钟数据（核心框架）\n        步骤2：调用 getTechnicalIndicators(symbol, "5m") 获取5分钟数据（核心框架）\n        步骤3：调用 getTechnicalIndicators(symbol, "1m") 获取1分钟数据（跟随确认）\n        步骤4：调用 getFundingRate(symbol) 获取资金费率（避免拥挤踩踏）\n        \n        【核心条件：3m与5m必须同向共振】：\n        做多方向（3m和5m都必须满足）：\n          - 3分钟：价格 > EMA20、MACD > 0、RSI7 > 50（核心过滤层）\n          - 5分钟：价格 > EMA20、MACD > 0、RSI7 > 50（趋势确认）\n          - 成交量：当前成交量 > 平均成交量 × 1.3（确认资金介入）\n        \n        做空方向（3m和5m都必须满足）：\n          - 3分钟：价格 < EMA20、MACD < 0、RSI7 < 50（核心过滤层）\n          - 5分钟：价格 < EMA20、MACD < 0、RSI7 < 50（趋势确认）\n          - 成交量：当前成交量 > 平均成交量 × 1.3（确认资金介入）\n        \n        【1m跟随确认（可以提前/滞后1-2根K线）】：\n        做多方向：\n          - 1分钟趋势方向向上（价格在EMA20上方 或 MACD方向向上）\n          - 或RSI7已经>45且有上升趋势\n          - 允许1m暂时弱于3m/5m（给予1-2根K线的容忍度）\n        \n        做空方向：\n          - 1分钟趋势方向向下（价格在EMA20下方 或 MACD方向向下）\n          - 或RSI7已经<55且有下降趋势\n          - 允许1m暂时强于3m/5m（给予1-2根K线的容忍度）\n        \n        【RSI极值过滤（强化信号质量）】：\n        做多方向：\n          - 建议RSI7 < 35时入场（超卖反弹机会）\n          - 或RSI7在35-55之间且处于上升阶段\n        \n        做空方向：\n          - 建议RSI7 > 65时入场（超买回落机会）\n          - 或RSI7在45-65之间且处于下降阶段\n        \n        【资金费率过滤（避免踩踏风险）】：\n        做多方向：\n          - 排除资金费率 > 0.05% 的信号（多头过度拥挤）\n          - 资金费率在-0.05%到0.05%之间为最佳\n        \n        做空方向：\n          - 排除资金费率 < -0.05% 的信号（空头过度拥挤）\n          - 资金费率在-0.05%到0.05%之间为最佳\n        \n        注意：核心原则是3m与5m必须同向共振（这是趋势确认），1m跟随即可（允许提前或滞后），RSI和资金费率用于过滤极端情况。' : ''}
      - 潜在利润≥${strategy === 'ultra-short' ? '1.5-2%（快进快出，小利积累）' : '2-3%（扣除0.1%费用后仍有净收益）'}
      - 做多和做空机会的识别：
        * 做多信号：价格突破EMA20/50上方，MACD转正，RSI7 > 50且上升，多个时间框架共振向上
        * 做空信号：价格跌破EMA20/50下方，MACD转负，RSI7 < 50且下降，多个时间框架共振向下
        * 关键：做空信号和做多信号同样重要！不要只寻找做多机会而忽视做空机会
      - 如果满足所有条件：立即调用 openPosition 开仓（不要只说"我会开仓"）
   
5. 仓位大小和杠杆计算（${params.name}策略）：
   - 单笔交易仓位 = 账户净值 × ${params.positionSizeMin}-${params.positionSizeMax}%（根据信号强度）
     * 普通信号：${params.positionSizeRecommend.normal}
     * 良好信号：${params.positionSizeRecommend.good}
     * 强信号：${params.positionSizeRecommend.strong}
   - 杠杆选择（根据信号强度灵活选择）：
     * ${params.leverageRecommend.normal}：普通信号
     * ${params.leverageRecommend.good}：良好信号
     * ${params.leverageRecommend.strong}：强信号

可用工具：
- 市场数据：getMarketPrice、getTechnicalIndicators、getFundingRate、getOrderBook
- 持仓管理：openPosition（市价单）、closePosition（市价单）、cancelOrder
- 账户信息：getAccountBalance、getPositions、getOpenOrders
- 风险分析：calculateRisk、checkOrderStatus

顶级交易者行动准则：

作为全球交易冠军，您必须果断行动，不能只停留在分析！
- 不要只说"我会平仓"、"应该开仓"、"建议止损"
- 立即调用 closePosition、openPosition 等工具执行
- 每个决策都要转化为实际的工具调用，用行动创造盈利
- 相信您的30年经验和判断，策略只是参考，市场实际情况更重要

同周期保护机制（重要风控规则）：
- 系统会自动拒绝平掉持仓时间少于 ${intervalMinutes} 分钟的仓位
- 这是为了防止在同一周期内刚开仓就立即平仓
- 如果您尝试平仓被拒绝，说明该仓位太新，请等待下一个周期再评估
- 此规则无法绕过，是硬性风控保护

终极目标（创造盈利新纪录）：
- 用您的30年经验，创造超越策略建议的卓越回报
- 月回报：${params.name === '稳健' ? '10-20%起步' : params.name === '平衡' ? '20-40%起步' : params.name === '激进' ? '40%+起步' : '20-30%起步'}，但您有能力突破上限
- 胜率追求：凭借经验争取≥60-70%（您的判断力是最大优势）
- 盈亏比：≥3:1或更高（让盈利奔跑，快速止损劣势交易）
- 夏普比率：≥2.0（用稳定性证明您的实力）

风控层级：
- 系统硬性底线（强制执行）：
  * 单笔亏损 ≤ -30%：强制平仓
  * 持仓时间 ≥ 36小时：强制平仓
- AI战术决策（专业建议，灵活执行）：
  * 策略止损线：${params.stopLoss.low}% 到 ${params.stopLoss.high}%（强烈建议遵守）
  * 移动止盈（${params.name}策略）：+${params.trailingStop.level1.trigger}%→+${params.trailingStop.level1.stopAt}%, +${params.trailingStop.level2.trigger}%→+${params.trailingStop.level2.stopAt}%, +${params.trailingStop.level3.trigger}%→+${params.trailingStop.level3.stopAt}%（保护利润）
  * 分批止盈（${params.name}策略）：+${params.partialTakeProfit.stage1.trigger}%/+${params.partialTakeProfit.stage2.trigger}%/+${params.partialTakeProfit.stage3.trigger}%（使用 percentage 参数）
  * 峰值回撤 ≥ ${params.peakDrawdownProtection}%：危险信号，强烈建议平仓

仓位管理：
- 严禁双向持仓：同一币种不能同时持有多单和空单
- 允许加仓：对盈利>5%的持仓，趋势强化时可加仓≤50%，最多2次
- 杠杆限制：加仓时必须使用相同或更低杠杆（禁止提高）
- 最多持仓：${RISK_PARAMS.MAX_POSITIONS}个币种
- 双向交易：做多和做空都能赚钱，不要只盯着做多机会

执行参数：
- 执行周期：每${intervalMinutes}分钟
- 杠杆范围：${params.leverageMin}-${params.leverageMax}倍（${params.leverageRecommend.normal}/${params.leverageRecommend.good}/${params.leverageRecommend.strong}）
- 仓位大小：${params.positionSizeRecommend.normal}（普通）/${params.positionSizeRecommend.good}（良好）/${params.positionSizeRecommend.strong}（强）
- 交易费用：0.1%往返，潜在利润≥2-3%才交易

决策优先级：
1. 账户健康检查（回撤保护） → 立即调用 getAccountBalance
2. 现有持仓管理（止损/止盈） → 立即调用 getPositions + closePosition
3. 分析市场寻找机会 → 立即调用 getTechnicalIndicators
4. 评估并执行新开仓 → 立即调用 openPosition

冠军交易者的智慧：
- 趋势是朋友，但您有能力捕捉反转机会（30年经验是最大资本）
- 让盈利充分奔跑，快速止损劣势交易（盈亏比≥3:1）
- 策略只是参考框架，市场实际情况和您的直觉更重要
- 相信自己的判断，用实力创造盈利新纪录
- pnl_percent已包含杠杆效应，直接比较即可

市场数据按时间顺序排列（最旧 → 最新），跨多个时间框架。使用此数据识别多时间框架趋势和关键水平。`;
}

/**
 * 创建交易 Agent
 */
export function createTradingAgent(intervalMinutes: number = 5) {
  // 使用 OpenAI SDK，通过配置 baseURL 兼容 OpenRouter 或其他供应商
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  const memory = new Memory({
    storage: new LibSQLMemoryAdapter({
      url: "file:./.voltagent/trading-memory.db",
      logger: logger.child({ component: "libsql" }),
    }),
  });
  
  // 获取当前策略
  const strategy = getTradingStrategy();
  logger.info(`使用交易策略: ${strategy}`);

  const agent = new Agent({
    name: "trading-agent",
    instructions: generateInstructions(strategy, intervalMinutes),
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.openPositionTool,
      tradingTools.closePositionTool,
      tradingTools.cancelOrderTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
      tradingTools.getOpenOrdersTool,
      tradingTools.checkOrderStatusTool,
      tradingTools.calculateRiskTool,
      tradingTools.syncPositionsTool,
    ],
    memory,
  });

  return agent;
}
