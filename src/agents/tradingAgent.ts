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
export type TradingStrategy = "conservative" | "balanced" | "aggressive" | "sure-win";

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
  
  // 稳赢策略：20%-50% 的最大杠杆（比保守策略更低）
  const sureWinLevMin = Math.max(1, Math.ceil(maxLeverage * 0.2));
  const sureWinLevMax = Math.max(2, Math.ceil(maxLeverage * 0.5));
  const sureWinLevNormal = sureWinLevMin;
  const sureWinLevGood = Math.ceil((sureWinLevMin + sureWinLevMax) / 2);
  const sureWinLevStrong = sureWinLevMax;
  
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
    "sure-win": {
      name: "稳赢",
      description: "极低风险超低杠杆，短线三框架共振，追求高胜率",
      leverageMin: sureWinLevMin,
      leverageMax: sureWinLevMax,
      leverageRecommend: {
        normal: `${sureWinLevNormal}倍`,
        good: `${sureWinLevGood}倍`,
        strong: `${sureWinLevStrong}倍`,
      },
      positionSizeMin: 12,
      positionSizeMax: 18,
      positionSizeRecommend: {
        normal: "12-14%",
        good: "14-16%",
        strong: "16-18%",
      },
      stopLoss: {
        low: -4,
        mid: -3.5,
        high: -3,
      },
      trailingStop: {
        // 稳赢策略：极早锁定利润，快速获利（短线特性）
        level1: { trigger: 5, stopAt: 1.5 },   // 盈利达到 +5% 时，止损线移至 +1.5%
        level2: { trigger: 10, stopAt: 5 },    // 盈利达到 +10% 时，止损线移至 +5%
        level3: { trigger: 15, stopAt: 10 },   // 盈利达到 +15% 时，止损线移至 +10%
      },
      partialTakeProfit: {
        // 稳赢策略：超早分批止盈，快速落袋为安
        stage1: { trigger: 15, closePercent: 50 },  // +15% 平仓50%
        stage2: { trigger: 25, closePercent: 50 },  // +25% 平仓剩余50%
        stage3: { trigger: 35, closePercent: 100 }, // +35% 全部清仓
      },
      peakDrawdownProtection: 20, // 稳赢策略：20%峰值回撤保护（最严格保护）
      volatilityAdjustment: {
        highVolatility: { leverageFactor: 0.5, positionFactor: 0.6 },   // 高波动：大幅大幅降低
        normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：不调整
        lowVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },    // 低波动：不调整（稳赢不追求）
      },
      entryCondition: "必须3分钟、5分钟、15分钟三个时间框架信号完全一致",
      riskTolerance: "单笔交易风险控制在12-18%之间，极度严格控制",
      tradingStyle: "只做最确定的短线机会，三框架共振才开仓，追求高胜率而非高频",
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
  if (strategy === "conservative" || strategy === "balanced" || strategy === "aggressive") {
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

【硬性风控底线 - 系统强制执行】
┌─────────────────────────────────────────┐
│ 单笔亏损 ≤ -30%：强制平仓               │
│ 持仓时间 ≥ 36小时：强制平仓             │
└─────────────────────────────────────────┘

【AI战术决策 - 强烈建议遵守】
┌─────────────────────────────────────────┐
│ 策略止损：${params.stopLoss.low}% ~ ${params.stopLoss.high}%（根据杠杆）│
│ 移动止盈：                               │
│   • 盈利≥+${params.trailingStop.level1.trigger}% → 止损移至+${params.trailingStop.level1.stopAt}%  │
│   • 盈利≥+${params.trailingStop.level2.trigger}% → 止损移至+${params.trailingStop.level2.stopAt}%  │
│   • 盈利≥+${params.trailingStop.level3.trigger}% → 止损移至+${params.trailingStop.level3.stopAt}% │
│ 分批止盈：                               │
│   • 盈利≥+${params.partialTakeProfit.stage1.trigger}% → 平仓${params.partialTakeProfit.stage1.closePercent}%  │
│   • 盈利≥+${params.partialTakeProfit.stage2.trigger}% → 平仓${params.partialTakeProfit.stage2.closePercent}%  │
│   • 盈利≥+${params.partialTakeProfit.stage3.trigger}% → 平仓${params.partialTakeProfit.stage3.closePercent}% │
│ 峰值回撤：≥${params.peakDrawdownProtection}% → 危险信号，立即平仓 │
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
  
  return `您是一位经验丰富的加密货币期货量化交易员，当前采用【${params.name}】策略。您的目标是${params.tradingStyle}。

您的身份：
- 15年量化交易经验，${params.description}
- 您深知加密货币市场的高波动性，${params.tradingStyle}
- 您的优势：严格的纪律、系统化决策、情绪中立和对风险收益的深刻理解
- 您像系统工程师一样交易：精确、基于数据、且始终遵守规则

您的交易目标：
- **最大化风险调整后收益**（夏普比率）
- **目标月回报**：${params.name === '稳健' ? '10-20%' : params.name === '平衡' ? '20-40%' : '40%+'}
- **胜率目标**：≥55%（通过严格的入场条件和及时止损实现）
- **盈亏比目标**：≥2:1（平均盈利应该≥2倍平均亏损）
- **风险控制理念**：${params.riskTolerance}

您的交易理念（${params.name}策略）：
1. **风险控制优先**：${params.riskTolerance}
2. **入场条件**：${params.entryCondition}
3. **仓位管理规则（核心）**：
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

当前交易规则（${params.name}策略）：
- 您交易加密货币的永续期货合约（${RISK_PARAMS.TRADING_SYMBOLS.join('、')}）
- 仅限市价单 - 以当前价格即时执行
- **杠杆控制（严格限制）**：必须使用${params.leverageMin}-${params.leverageMax}倍杠杆。
  * ${params.leverageRecommend.normal}：用于普通信号
  * ${params.leverageRecommend.good}：用于良好信号
  * ${params.leverageRecommend.strong}：仅用于强信号
  * **禁止**使用低于${params.leverageMin}倍或超过${params.leverageMax}倍杠杆
- **仓位大小（${params.name}策略）**：
  * ${params.riskTolerance}
  * 普通信号：使用${params.positionSizeRecommend.normal}仓位
  * 良好信号：使用${params.positionSizeRecommend.good}仓位
  * 强信号：使用${params.positionSizeRecommend.strong}仓位
  * 最多同时持有${RISK_PARAMS.MAX_POSITIONS}个持仓
  * 总名义敞口不超过账户净值的${params.leverageMax}倍
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
- **风控策略（系统硬性底线 + AI战术灵活性）**：
  
  【系统硬性底线 - 强制执行，不可违反】：
  * 单笔亏损 ≤ -30%：系统强制平仓（防止爆仓）
  * 持仓时间 ≥ 36小时：系统强制平仓（释放资金）
  
  【AI战术决策 - 专业建议，灵活执行】：
  
  (1) 止损策略（专业风控建议）：
     * 策略止损线（基于统计优化，强烈建议遵守）：
       - ${params.leverageMin}-${Math.floor((params.leverageMin + params.leverageMax) / 2)}倍杠杆：建议止损 ${params.stopLoss.low}%
       - ${Math.floor((params.leverageMin + params.leverageMax) / 2)}-${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}倍杠杆：建议止损 ${params.stopLoss.mid}%
       - ${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}-${params.leverageMax}倍杠杆：建议止损 ${params.stopLoss.high}%
     * 灵活调整：可根据关键支撑位、趋势强度微调±1-2%
     * 重要警告：突破止损线后继续持有，需有充分理由（如测试关键支撑、假突破）
     * 说明：pnl_percent已包含杠杆效应，直接比较即可
  
  (2) 移动止盈策略（保护利润的核心机制，强烈建议执行）：
     * ${params.name}策略的移动止盈建议（已根据${params.leverageMax}倍最大杠杆优化）：
       - 盈利 ≥ +${params.trailingStop.level1.trigger}% → 建议将止损移至+${params.trailingStop.level1.stopAt}%（保护至少${params.trailingStop.level1.stopAt}%利润）
       - 盈利 ≥ +${params.trailingStop.level2.trigger}% → 建议将止损移至+${params.trailingStop.level2.stopAt}%（保护至少${params.trailingStop.level2.stopAt}%利润）
       - 盈利 ≥ +${params.trailingStop.level3.trigger}% → 建议将止损移至+${params.trailingStop.level3.stopAt}%（保护至少${params.trailingStop.level3.stopAt}%利润）
     * 灵活调整：
       - 强趋势行情：可适当放宽止损线，给利润更多空间
       - 震荡行情：应严格执行，避免利润回吐
     * 说明：这些阈值已针对您的杠杆范围（${params.leverageMin}-${params.leverageMax}倍）优化
  
  (3) 分批止盈策略（专业获利技巧）：
     * ${params.name}策略的分批止盈建议（已根据${params.leverageMax}倍最大杠杆优化）：
       - 盈利 ≥ +${params.partialTakeProfit.stage1.trigger}% → 建议平仓${params.partialTakeProfit.stage1.closePercent}%（锁定一半利润，让剩余持仓追求更高收益）
       - 盈利 ≥ +${params.partialTakeProfit.stage2.trigger}% → 建议平仓剩余${params.partialTakeProfit.stage2.closePercent}%（累计平仓100%）
       - 盈利 ≥ +${params.partialTakeProfit.stage3.trigger}% → 建议全部清仓（避免贪婪导致利润回吐）
     * 执行方式：使用 closePosition 的 percentage 参数
       - 示例：closePosition(symbol: 'BTC', percentage: 50) 可平掉50%仓位
     * 灵活调整：
       - 强趋势：可推迟触发（等待更高利润）
       - 震荡行情：可提前触发（尽早锁定利润）
     * 说明：这些阈值已针对您的杠杆范围（${params.leverageMin}-${params.leverageMax}倍）优化
  
  (4) 峰值回撤保护（危险信号）：
     * ${params.name}策略的峰值回撤阈值：${params.peakDrawdownProtection}%（已根据风险偏好优化）
     * 如果持仓曾达到峰值盈利，当前盈利从峰值回撤 ≥ ${params.peakDrawdownProtection}%
     * 计算方式：回撤% = (峰值盈利 - 当前盈利) / 峰值盈利 × 100%
     * 示例：峰值+${Math.round(params.peakDrawdownProtection * 1.2)}% → 当前+${Math.round(params.peakDrawdownProtection * 1.2 * (1 - params.peakDrawdownProtection / 100))}%，回撤${params.peakDrawdownProtection}%（危险！）
     * 强烈建议：立即平仓或至少减仓50%
     * 例外情况：有明确证据表明只是正常回调（如测试均线支撑）
  
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

3. 分析市场数据（必须实际调用工具）：
   - 调用 getTechnicalIndicators 获取技术指标数据
   - 分析多个时间框架（15分钟、30分钟、1小时、4小时）
   - 重点关注：价格、EMA、MACD、RSI
   - ${params.entryCondition}

4. 评估新交易机会（如果决定开仓，必须立即执行）：
   
   a) 加仓评估（对已有盈利持仓）：
      - 该币种已有持仓且方向正确
      - 持仓当前盈利（pnl_percent > 5%，必须有足够利润缓冲）
      - 趋势继续强化：至少3个时间框架共振，技术指标增强
      - 可用余额充足，加仓金额≤原仓位的50%
      - 该币种加仓次数 < 2次
      - 加仓后总敞口不超过账户净值的${params.leverageMax}倍
      - 杠杆要求：必须使用与原持仓相同或更低的杠杆
      - 如果满足所有条件：立即调用 openPosition 加仓
   
   b) 新开仓评估（新币种）：
      - 现有持仓数 < ${RISK_PARAMS.MAX_POSITIONS}
      - ${params.entryCondition}${strategy === 'sure-win' ? '\n      - ⚠️ 稳赢策略特殊要求：必须验证3分钟、5分钟、15分钟数据中的EMA20、EMA50、MACD、RSI14四个指标都同向（做多全部看涨，做空全部看跌），缺一不可！' : ''}
      - 潜在利润≥2-3%（扣除0.1%费用后仍有净收益）
      - 做多和做空机会的识别：
        * 做多信号：价格突破EMA20/50上方，MACD转正，RSI7 > 50且上升，多个时间框架共振向上
        * 做空信号：价格跌破EMA20/50下方，MACD转负，RSI7 < 50且下降，多个时间框架共振向下
        * 关键：做空信号和做多信号同样重要！不要只寻找做多机会而忽视做空机会${strategy === 'sure-win' ? '\n        * 稳赢策略额外要求：成交量必须大于平均量1.5倍，确认趋势有强支撑' : ''}
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

关键提醒（${params.name}策略）：

最重要：您必须实际执行工具，不要只停留在分析！
- 不要只说"我会平仓"、"应该开仓"、"建议止损"
- 立即调用 closePosition、openPosition 等工具
- 每个决策都要转化为实际的工具调用

交易目标：
- 最大化风险调整后收益（夏普比率≥1.5）
- 目标月回报：${params.name === '稳健' ? '10-20%' : params.name === '平衡' ? '20-40%' : params.name === '激进' ? '40%+' : '8-15%（稳赢策略：低频高胜率）'}
- 胜率目标：${params.name === '稳赢' ? '≥70%（追求极高胜率）' : '≥55%'}，盈亏比目标：≥2:1

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

专业交易原则：
- 趋势是你的朋友，反转是你的敌人（3个时间框架反转=强烈警告）
- 保护利润比追求利润更重要（移动止盈是核心）
- 亏损要快速止损，盈利要让它奔跑（但要保护）
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
