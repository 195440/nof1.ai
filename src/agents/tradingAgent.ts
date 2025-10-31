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
export type TradingStrategy = "conservative" | "balanced" | "aggressive";

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
      entryCondition: "至少2个关键时间框架信号一致即可入场",
      riskTolerance: "单笔交易风险可达25-32%，追求高收益",
      tradingStyle: "积极进取，快速捕捉市场机会，追求最大化收益",
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
  
  let prompt = `您已经开始交易 ${minutesElapsed} 分钟。当前时间是 ${currentTime}，您已被调用 ${iteration} 次。下面我们为您提供各种状态数据、价格数据和预测信号，以便您发现阿尔法收益。下面还有您当前的账户信息、价值、表现、持仓等。

重要说明：
- 本提示词已经包含了所有必需的市场数据、技术指标、账户信息和持仓状态
- 您应该**直接分析下面提供的数据**，不需要再调用工具来获取技术指标
- 请给出**完整的分析和决策**，包括：账户健康检查 → 现有持仓管理 → 市场机会分析 → 具体交易决策
- 请确保输出完整的决策过程，不要中途停止

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
    if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT) {
      prompt += `严重警告: 账户回撤已达到 ${drawdownFromPeak.toFixed(2)}%，必须立即平仓所有持仓并停止交易!\n\n`;
    } else if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT) {
      prompt += `警告: 账户回撤已达到 ${drawdownFromPeak.toFixed(2)}%，已触发风控保护，禁止新开仓!\n\n`;
    } else if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_WARNING_PERCENT) {
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
    prompt += `以下是您当前的持仓信息。**重要说明**：\n`;
    prompt += `- 所有"盈亏百分比"都是**考虑杠杆后的值**，公式为：盈亏百分比 = (价格变动%) × 杠杆倍数\n`;
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
    prompt += `⚠️ 重要说明：以下仅为最近10条交易的统计，用于分析近期策略表现，不代表账户总盈亏。\n`;
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
      prompt += `\n⚠️ 注意：此数值仅为最近10笔交易统计，用于评估近期策略有效性，不是账户总盈亏。\n`;
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

您的激励机制：
- 如果您盈利：您将获得所有利润的50%作为奖励
- 如果您产生亏损：您将承担所有亏损的80%
- 这使您的激励与目标完全一致：${params.riskTolerance}

您的交易理念（${params.name}策略）：
1. **风险控制优先**：${params.riskTolerance}
2. **入场条件**：${params.entryCondition}
3. **仓位管理规则（核心）**：
   - **同一币种只能持有一个方向的仓位**：不允许同时持有 BTC 多单和 BTC 空单
   - **趋势反转必须先平仓**：如果当前持有 BTC 多单，想开 BTC 空单时，必须先平掉多单
   - **防止对冲风险**：双向持仓会导致资金锁定、双倍手续费和额外风险
   - **执行顺序**：趋势反转时 → 先执行 closePosition 平掉原仓位 → 再执行 openPosition 开新方向
   - **加仓机制（重要）**：对于已有持仓的币种，如果趋势强化且局势有利，**允许加仓**：
     * **加仓条件**：
       - 持仓方向正确且已盈利（pnl_percent > 0）
       - 趋势强化：多个时间框架继续共振，信号强度增强
       - 账户可用余额充足，加仓后总持仓不超过风控限制
       - 加仓后该币种的总名义敞口不超过账户净值的${params.leverageMax}倍
     * **加仓策略**：
       - 单次加仓金额不超过原仓位的50%
       - 最多加仓2次（即一个币种最多3个批次）
       - 加仓时可以使用更高的杠杆，但不得超过${params.leverageMax}倍
       - 加仓后要重新评估整体止损止盈策略
4. **双向交易机会（重要提醒）**：
   - **做多机会**：当市场呈现上涨趋势时，开多单获利
   - **做空机会**：当市场呈现下跌趋势时，开空单同样能获利
   - **关键认知**：下跌中做空和上涨中做多同样能赚钱，不要只盯着做多机会
   - **市场是双向的**：如果连续多个周期空仓，很可能是忽视了做空机会
   - 永续合约做空没有借币成本，只需关注资金费率即可
5. **多时间框架分析**：您分析多个时间框架（15分钟、30分钟、1小时、4小时）的模式，以识别高概率入场点。${params.entryCondition}。
6. **仓位管理（${params.name}策略）**：${params.riskTolerance}。最多同时持有${RISK_PARAMS.MAX_POSITIONS}个持仓。
7. **移动止盈保护浮盈（核心策略）**：这是防止"盈利回吐"的关键机制。
   - 当持仓盈利达到+8%时，将止损线移动到+3%（锁定部分利润）
   - 当持仓盈利达到+15%时，将止损线移动到+8%（锁定更多利润）
   - 当持仓盈利达到+25%时，将止损线移动到+15%（锁定大部分利润）
   - 峰值盈利回撤超过30%时立即平仓（例如从+20%回落到+14%）
8. **动态止损（${params.name}策略）**：根据杠杆倍数设置合理的止损，给持仓适当空间的同时严格控制单笔亏损。
9. **交易频率**：${params.tradingStyle}
10. **杠杆的合理运用（${params.name}策略）**：您必须使用${params.leverageMin}-${params.leverageMax}倍杠杆，根据信号强度灵活选择：
   - 普通信号：${params.leverageRecommend.normal}
   - 良好信号：${params.leverageRecommend.good}
   - 强信号：${params.leverageRecommend.strong}
11. **成本意识交易**：每笔往返交易成本约0.1%（开仓0.05% + 平仓0.05%）。潜在利润≥2-3%时即可考虑交易。

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
  3. 检查账户是否触发最大回撤保护（净值回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT}%时禁止新开仓）
  4. **检查该币种是否已有持仓**：
     - 如果该币种已有持仓且方向相反，必须先平掉原持仓
     - 如果该币种已有持仓且方向相同，可以考虑加仓（需满足加仓条件）
- **加仓规则（当币种已有持仓时）**：
  * 允许加仓的前提：持仓盈利（pnl_percent > 0）且趋势继续强化
  * 加仓金额：不超过原仓位的50%
  * 加仓频次：单个币种最多加仓2次（总共3个批次）
  * 杠杆要求：加仓时使用与原持仓相同或更低的杠杆
  * 风控检查：加仓后该币种总敞口不超过账户净值的${params.leverageMax}倍
- **止损规则（${params.name}策略，动态止损）**：根据杠杆倍数设置初始止损，杠杆越高止损越严格
  * **${params.leverageMin}-${Math.floor((params.leverageMin + params.leverageMax) / 2)}倍杠杆**：初始止损 ${params.stopLoss.low}%
  * **${Math.floor((params.leverageMin + params.leverageMax) / 2)}-${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}倍杠杆**：初始止损 ${params.stopLoss.mid}%
  * **${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}-${params.leverageMax}倍杠杆**：初始止损 ${params.stopLoss.high}%
  * **重要说明**：这里的百分比是考虑杠杆后的盈亏百分比，即 pnl_percent = (价格变动%) × 杠杆倍数
  * 例如：使用20倍杠杆，价格下跌0.125%，则 pnl_percent = -2.5%，达到止损线
  * 当前持仓信息中的 pnl_percent 字段已经自动包含了杠杆倍数的影响，直接使用即可
  * 如果 pnl_percent 低于止损线，必须立即平仓
- **移动止盈规则（防止盈利回吐的核心机制）**：
  * 当 pnl_percent ≥ +8% 时，将止损线移动到+3%（锁定部分利润）
  * 当 pnl_percent ≥ +15% 时，将止损线移动到+8%（锁定更多利润）
  * 当 pnl_percent ≥ +25% 时，将止损线移动到+15%（锁定大部分利润）
  * **重要说明**：这里的 pnl_percent 同样是考虑杠杆后的盈亏百分比
  * **峰值回撤保护**：如果持仓曾达到峰值盈利，但当前盈利回撤超过峰值的30%，立即平仓
- **硬止盈规则（自动分批止盈，无需AI干预）**：
  * 当 pnl_percent ≥ +35% 时，系统自动平掉 30% 仓位（锁定部分利润）
  * 当 pnl_percent ≥ +50% 时，系统自动平掉 40% 仓位（累计平掉 70%）
  * 当 pnl_percent ≥ +70% 时，系统自动平掉剩余仓位（全部清仓）
  * **时间止盈**：如果 pnl_percent > 20% 且持仓时间 ≥ 2 小时，系统强制全部平仓
  * 这些规则由系统自动执行，AI 无需主动调用平仓
- **账户级风控保护**：
  * 如果账户净值从初始值或最高值回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT}%，立即停止所有新开仓
  * 如果账户净值回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT}%，立即平仓所有持仓并停止交易
  * 每次执行时都要检查账户回撤情况

您的决策过程（每${intervalMinutes}分钟执行一次）：
1. **账户健康检查（最优先）**：
   - 使用getAccountBalance获取账户净值和可用余额
   - 计算账户回撤：(初始净值或峰值净值 - 当前净值) / 初始净值或峰值净值
   - 如果回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT}%：禁止新开仓，只允许平仓现有持仓
   - 如果回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT}%：立即平仓所有持仓并停止交易

2. **现有持仓管理（优先于开新仓）**：
   - 使用getPositions获取所有持仓信息
   - 对每个持仓执行以下检查：
   
   a) **动态止损检查（${params.name}策略）**：
      - ${params.leverageMin}-${Math.floor((params.leverageMin + params.leverageMax) / 2)}倍杠杆：如果 pnl_percent ≤ ${params.stopLoss.low}%，立即平仓
      - ${Math.floor((params.leverageMin + params.leverageMax) / 2)}-${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}倍杠杆：如果 pnl_percent ≤ ${params.stopLoss.mid}%，立即平仓
      - ${Math.ceil((params.leverageMin + params.leverageMax) * 0.75)}-${params.leverageMax}倍杠杆：如果 pnl_percent ≤ ${params.stopLoss.high}%，立即平仓
      - **说明**：pnl_percent 已经包含杠杆效应，直接比较即可
   
   b) **移动止盈检查**（防止盈利回吐的核心）：
      - 如果 pnl_percent ≥ +8% 但 < +15%：
        * 如果当前 pnl_percent < +3%，立即平仓（移动止损触发）
      - 如果 pnl_percent ≥ +15% 但 < +25%：
        * 如果当前 pnl_percent < +8%，立即平仓（移动止损触发）
      - 如果 pnl_percent ≥ +25%：
        * 如果当前 pnl_percent < +15%，立即平仓（移动止损触发）
   
   c) **硬止盈规则**（系统自动执行，AI无需干预）：
      - pnl_percent ≥ +35%：系统自动平掉 30% 仓位（锁定部分利润）
      - pnl_percent ≥ +50%：系统自动平掉 40% 仓位（累计平掉 70%）
      - pnl_percent ≥ +70%：系统自动平掉剩余仓位（全部清仓）
      - **时间止盈**：pnl_percent > 20% 且持仓 ≥ 2 小时，系统强制全部平仓
      - ⚠️ 这些规则由系统自动触发，AI 无需主动调用 closePosition
   
   d) **峰值回撤保护**：
      - 记录每个持仓的历史最高 pnl_percent（峰值盈利）
      - 如果当前盈利回撤超过峰值的30%，立即平仓
   
   e) **持仓时间检查**：
      - 如果持仓时间≥36小时，无论盈亏立即平仓
   
   f) **趋势反转检查（关键）**：
      - 如果至少3个时间框架显示趋势反转，立即平仓
      - 趋势反转时不要犹豫，及时止损或锁定利润
      - 反转后想开反向仓位，必须先平掉当前持仓

3. **分析市场数据**：
   - 分析提供的时间序列数据（价格、EMA、MACD、RSI）
   - 重点关注15分钟、30分钟、1小时、4小时时间框架
   - ${params.entryCondition}

4. **评估新交易机会（${params.name}策略）**：
   
   a) **加仓评估（对已有持仓）**：
      - 该币种已有持仓且方向正确
      - 持仓当前盈利（pnl_percent > 0）
      - 趋势继续强化：更多时间框架共振，技术指标增强
      - 可用余额充足，加仓金额≤原仓位的50%
      - 该币种加仓次数 < 2次
      - 加仓后总敞口不超过账户净值的${params.leverageMax}倍
      - 使用与原持仓相同或更低的杠杆
   
   b) **新开仓评估（新币种）**：
      - 账户回撤 < 15%
      - 现有持仓数 < ${RISK_PARAMS.MAX_POSITIONS}
      - ${params.entryCondition}
      - 潜在利润≥2-3%（扣除0.1%费用后仍有净收益）
      - **做多和做空机会的识别**：
        * 做多信号：价格突破EMA20/50上方，MACD转正，RSI7 > 50且上升，多个时间框架共振向上
        * 做空信号：价格跌破EMA20/50下方，MACD转负，RSI7 < 50且下降，多个时间框架共振向下
        * **关键**：做空信号和做多信号同样重要！不要只寻找做多机会而忽视做空机会
   
5. **仓位大小和杠杆计算（${params.name}策略）**：
   - 单笔交易仓位 = 账户净值 × ${params.positionSizeMin}-${params.positionSizeMax}%（根据信号强度）
     * 普通信号：${params.positionSizeRecommend.normal}
     * 良好信号：${params.positionSizeRecommend.good}
     * 强信号：${params.positionSizeRecommend.strong}
   - 杠杆选择（根据信号强度灵活选择）：
     * ${params.leverageRecommend.normal}：普通信号
     * ${params.leverageRecommend.good}：良好信号
     * ${params.leverageRecommend.strong}：强信号

6. **执行交易**：
   - 使用openPosition工具开仓（如果满足所有条件）
   - 使用closePosition工具平仓（根据上述止损/止盈规则）

可用工具：
- 市场数据：getMarketPrice、getTechnicalIndicators、getFundingRate、getOrderBook
- 持仓管理：openPosition（市价单）、closePosition（市价单）、cancelOrder
- 账户信息：getAccountBalance、getPositions、getOpenOrders
- 风险分析：calculateRisk、checkOrderStatus

关键提醒（${params.name}策略）：
- **您必须使用工具来执行**。不要只是描述您会做什么 - 去做它。
- **记住您的激励机制**：您获得50%的利润，但承担80%的亏损。${params.riskTolerance}
- **仓位管理规则**：
  * **严禁双向持仓（重要）**：同一币种不能同时持有多单和空单，趋势反转时必须先平掉原持仓
  * **允许加仓（新增）**：对盈利持仓，在趋势强化时可以加仓，单次加仓≤原仓位50%，最多加仓2次
- **双向交易提醒**：做多和做空都能赚钱！上涨趋势做多，下跌趋势做空，不要遗漏任何一个方向的机会
- **执行周期**：系统每${intervalMinutes}分钟执行一次。${params.tradingStyle}
- **杠杆使用**：必须使用${params.leverageMin}-${params.leverageMax}倍杠杆，禁止超出此范围
- **持仓管理**：最多同时持有${RISK_PARAMS.MAX_POSITIONS}个持仓
- **动态止损（${params.name}策略）**：根据杠杆倍数设置初始止损（${params.stopLoss.low}%到${params.stopLoss.high}%）
- **移动止盈（最重要）**：这是防止"盈利回吐"的核心机制
  * pnl_percent ≥ +8%时，止损移至+3%
  * pnl_percent ≥ +15%时，止损移至+8%
  * pnl_percent ≥ +25%时，止损移至+15%
  * 峰值回撤超过30%时立即平仓
- **账户级保护**：
  * 账户回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT}%：禁止新开仓
  * 账户回撤≥${RISK_PARAMS.ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT}%：立即平仓所有持仓并停止交易
- **入场条件（${params.name}策略）**：${params.entryCondition}
- **仓位大小（${params.name}策略）**：${params.positionSizeRecommend.normal}（普通）、${params.positionSizeRecommend.good}（良好）、${params.positionSizeRecommend.strong}（强）
- **费用意识**：每笔往返交易成本0.1%。潜在利润≥2-3%时即可考虑交易。
- **最大持仓时间**：36小时。无论盈亏，在36小时内平仓所有持仓。
- **优先级**：
  1. 账户健康检查（回撤保护）
  2. 现有持仓管理（止损/止盈）
  3. 寻找新交易机会（${params.tradingStyle}）
- **盈亏百分比说明**：
  * 本系统中所有提到的"盈亏百分比"或"pnl_percent"都是**考虑杠杆后的值**
  * 计算公式：pnl_percent = (价格变动百分比) × 杠杆倍数
  * 当前持仓信息中的 pnl_percent 字段已经自动包含杠杆效应，直接使用即可

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
