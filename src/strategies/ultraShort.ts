import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * 超短线策略配置
 * 极短周期快进快出，5分钟执行，适合高频交易
 */
export function getUltraShortStrategy(maxLeverage: number): StrategyParams {
  // 超短线策略：50%-75% 的最大杠杆
  const ultraShortLevMin = Math.max(3, Math.ceil(maxLeverage * 0.5));
  const ultraShortLevMax = Math.max(5, Math.ceil(maxLeverage * 0.75));
  
  return {
    name: "超短线",
    description: "极短周期快进快出，5分钟执行，适合高频交易",
    leverageMin: ultraShortLevMin,
    leverageMax: ultraShortLevMax,
    leverageRecommend: {
      normal: `${ultraShortLevMin}倍`,
      good: `${Math.max(4, Math.ceil(maxLeverage * 0.625))}倍`,
      strong: `${ultraShortLevMax}倍`,
    },
    positionSizeMin: 18,
    positionSizeMax: 25,
    positionSizeRecommend: {
      normal: "18-20%",
      good: "20-23%",
      strong: "23-25%",
    },
    stopLoss: {
      low: -2.5,
      mid: -2,
      high: -1.5,
    },
    trailingStop: {
      // 超短线策略：快速锁利（5分钟周期）
      level1: { trigger: 4, stopAt: 1.5 },   // 盈利达到 +4% 时，止损线移至 +1.5%
      level2: { trigger: 8, stopAt: 4 },     // 盈利达到 +8% 时，止损线移至 +4%
      level3: { trigger: 15, stopAt: 8 },    // 盈利达到 +15% 时，止损线移至 +8%
    },
    partialTakeProfit: {
      // 超短线策略：快速分批止盈
      stage1: { trigger: 15, closePercent: 50 },  // +15% 平仓50%
      stage2: { trigger: 25, closePercent: 50 },  // +25% 平仓剩余50%
      stage3: { trigger: 35, closePercent: 100 }, // +35% 全部清仓
    },
    peakDrawdownProtection: 20, // 超短线：20%峰值回撤保护（快速保护利润）
    volatilityAdjustment: {
      highVolatility: { leverageFactor: 0.7, positionFactor: 0.8 },
      normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      lowVolatility: { leverageFactor: 1.1, positionFactor: 1.0 },
    },
    entryCondition: "至少2个时间框架信号一致，优先1-5分钟级别",
    riskTolerance: "单笔交易风险控制在18-25%之间，快进快出",
    tradingStyle: "超短线交易，5分钟执行周期，快速捕捉短期波动，严格执行2%周期锁利规则和30分钟盈利平仓规则",
    enableCodeLevelProtection: false, // 超短线策略：AI 主动止损止盈
    // 如需启用代码级保护，stopLossMonitor 会自动使用上面的 stopLoss 配置
  };
}

/**
 * 生成超短线策略特有的提示词
 */
export function generateUltraShortPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**目标月回报**：20-30%起步
**盈亏比追求**：≥2:1（让盈利充分奔跑，快速止损劣势交易）

【行情识别与应对 - 超短线策略】

超短线策略注重快速捕捉短期波动

单边行情处理：
- 入场条件：至少1个长周期（30m或1h）+ 2个中周期（5m、15m）方向一致
- 仓位配置：标准仓位
- 杠杆选择：根据信号强度选择

震荡行情处理：
- 谨慎观望
- 降低仓位至最小
- 使用最低杠杆

【超短线特别规则】
- 周期锁利规则：每个周期内，盈利>2%且<4%时，立即平仓锁定利润
- 30分钟规则：持仓超过30分钟且盈利>手续费成本时，如未达移动止盈线，执行保守平仓
- 快速捕捉短期波动，严格执行锁利规则
`;
}

