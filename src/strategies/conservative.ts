import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * 稳健策略配置
 * 低风险低杠杆，严格入场条件，适合保守投资者
 */
export function getConservativeStrategy(maxLeverage: number): StrategyParams {
  // 保守策略：30%-60% 的最大杠杆
  const conservativeLevMin = Math.max(1, Math.ceil(maxLeverage * 0.3));
  const conservativeLevMax = Math.max(2, Math.ceil(maxLeverage * 0.6));
  const conservativeLevNormal = conservativeLevMin;
  const conservativeLevGood = Math.ceil((conservativeLevMin + conservativeLevMax) / 2);
  const conservativeLevStrong = conservativeLevMax;
  
  return {
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
    enableCodeLevelProtection: false, // 稳健策略：AI 主动止损止盈
  };
}

/**
 * 生成稳健策略特有的提示词
 */
export function generateConservativePrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**目标月回报**：10-20%起步
**盈亏比追求**：≥2:1（让盈利充分奔跑，快速止损劣势交易）

【行情识别与应对 - 稳健策略】

稳健策略更加谨慎，只在高确定性机会时入场

单边行情处理：
- 入场条件：至少1个长周期（30m或1h）+ 2个中周期（5m、15m）方向一致
- 仓位配置：标准仓位
- 杠杆选择：根据信号强度选择，偏保守

震荡行情处理：
- 入场条件：至少3-4个时间框架一致，且长周期无震荡特征
- 仓位配置：降低仓位至最小
- 杠杆选择：使用最低杠杆
- 交易频率：尽量观望

【稳健策略总结】
- 核心原则：时间框架分层使用，长周期判断趋势，中周期验证信号，短周期入场
- 在单边行情积极把握，让利润充分奔跑（长周期趋势明确）
- 在震荡行情谨慎防守，避免频繁交易（长周期震荡混乱）
- 正确识别行情类型，调整交易策略（优先看长周期）
- 耐心等待高质量机会，不要强行交易（长周期无趋势时观望）
- 宁可错过机会，也不冒险
`;
}

