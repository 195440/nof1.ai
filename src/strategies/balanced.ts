import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * 平衡策略配置
 * 中等风险杠杆，合理入场条件，适合大多数投资者
 */
export function getBalancedStrategy(maxLeverage: number): StrategyParams {
  // 平衡策略：60%-85% 的最大杠杆
  const balancedLevMin = Math.max(2, Math.ceil(maxLeverage * 0.6));
  const balancedLevMax = Math.max(3, Math.ceil(maxLeverage * 0.85));
  const balancedLevNormal = balancedLevMin;
  const balancedLevGood = Math.ceil((balancedLevMin + balancedLevMax) / 2);
  const balancedLevStrong = balancedLevMax;
  
  return {
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
    enableCodeLevelProtection: false, // 平衡策略：AI 主动止损止盈
  };
}

/**
 * 生成平衡策略特有的提示词
 */
export function generateBalancedPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**目标月回报**：20-40%起步
**盈亏比追求**：≥2:1（让盈利充分奔跑，快速止损劣势交易）

【行情识别与应对 - 平衡策略】

平衡策略在单边行情积极参与，在震荡行情谨慎防守

单边行情处理：
- 入场条件：至少1个长周期（30m或1h）+ 2个中周期（5m、15m）方向一致
- 仓位配置：标准仓位
- 杠杆选择：根据信号强度选择

震荡行情处理：
- 入场条件：至少3-4个时间框架一致，且长周期无震荡特征
- 仓位配置：降低仓位至最小
- 杠杆选择：使用最低杠杆

【平衡策略总结】
- 核心原则：时间框架分层使用：长周期判断趋势，中周期验证信号，短周期入场
- 在单边行情积极把握，让利润充分奔跑（长周期趋势明确）
- 在震荡行情谨慎防守，避免频繁交易（长周期震荡混乱）
- 正确识别行情类型，调整交易策略（优先看长周期）
- 耐心等待高质量机会，不要强行交易（长周期无趋势时观望）
`;
}

