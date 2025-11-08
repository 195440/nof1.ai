import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * 波段趋势策略配置
 * 中长线波段交易，20分钟执行，捕捉中期趋势，适合稳健成长
 */
export function getSwingTrendStrategy(maxLeverage: number): StrategyParams {
  return {
    name: "波段趋势",
    description: "中长线波段交易，20分钟执行，捕捉中期趋势，适合稳健成长",
    leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.2)),
    leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.5)),
    leverageRecommend: {
      normal: `${Math.max(2, Math.ceil(maxLeverage * 0.2))}倍`,
      good: `${Math.max(3, Math.ceil(maxLeverage * 0.35))}倍`,
      strong: `${Math.max(5, Math.ceil(maxLeverage * 0.5))}倍`,
    },
    positionSizeMin: 20,
    positionSizeMax: 35,
    positionSizeRecommend: {
      normal: "20-25%",
      good: "25-30%",
      strong: "30-35%",
    },
    stopLoss: {
      low: -9,      // 低杠杆(2-3倍)：-9%止损（给趋势足够空间，略收紧1%）
      mid: -7.5,    // 中杠杆(3-4倍)：-7.5%止损（略收紧0.5%）
      high: -5.5,   // 高杠杆(4-5倍)：-5.5%止损（略收紧0.5%）
    },
    trailingStop: {
      // 波段策略：给趋势更多空间，较晚锁定利润
      level1: { trigger: 15, stopAt: 8 },   // 盈利达到 +15% 时，止损线移至 +8%
      level2: { trigger: 30, stopAt: 20 },  // 盈利达到 +30% 时，止损线移至 +20%
      level3: { trigger: 50, stopAt: 35 },  // 盈利达到 +50% 时，止损线移至 +35%
    },
    partialTakeProfit: {
      // 波段策略：更晚分批止盈，追求趋势利润最大化
      stage1: { trigger: 50, closePercent: 40 },  // +50% 平仓40%（保留60%追求更大利润）
      stage2: { trigger: 80, closePercent: 60 },  // +80% 平仓剩余60%（累计平仓100%）
      stage3: { trigger: 120, closePercent: 100 },// +120% 全部清仓
    },
    peakDrawdownProtection: 35, // 波段策略：35%峰值回撤保护（给趋势更多空间）
    volatilityAdjustment: {
      highVolatility: { leverageFactor: 0.5, positionFactor: 0.6 },   // 高波动：大幅降低风险
      normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 }, // 正常波动：标准配置
      lowVolatility: { leverageFactor: 1.2, positionFactor: 1.1 },    // 低波动：适度提高（趋势稳定）
    },
    entryCondition: "必须1分钟、3分钟、5分钟、15分钟这4个时间框架信号全部强烈一致，且关键指标共振（MACD、RSI、EMA方向一致）",
    riskTolerance: "单笔交易风险控制在20-35%之间，注重趋势质量而非交易频率",
    tradingStyle: "波段趋势交易，20分钟执行周期，耐心等待高质量趋势信号，持仓时间可达数天，让利润充分奔跑",
    enableCodeLevelProtection: true, // 波段策略：启用自动监控止损和移动止盈（默认启用）
    // 自动监控止损配置（每10秒自动检查）
    codeLevelStopLoss: {
      lowRisk: {
        minLeverage: 5,
        maxLeverage: 7,
        stopLossPercent: -6,
        description: "5-7倍杠杆，亏损 -6% 时止损",
      },
      mediumRisk: {
        minLeverage: 8,
        maxLeverage: 12,
        stopLossPercent: -5,
        description: "8-12倍杠杆，亏损 -5% 时止损",
      },
      highRisk: {
        minLeverage: 13,
        maxLeverage: Infinity,
        stopLossPercent: -4,
        description: "13倍以上杠杆，亏损 -4% 时止损",
      },
    },
    // 自动监控移动止盈配置（每10秒自动检查，5级规则）
    codeLevelTrailingStop: {
      stage1: {
        name: "阶段1",
        minProfit: 4,
        maxProfit: 6,
        drawdownPercent: 1.5,
        description: "峰值4-6%，回退1.5%平仓（保底2.5%）",
      },
      stage2: {
        name: "阶段2",
        minProfit: 6,
        maxProfit: 10,
        drawdownPercent: 2,
        description: "峰值6-10%，回退2%平仓（保底4%）",
      },
      stage3: {
        name: "阶段3",
        minProfit: 10,
        maxProfit: 15,
        drawdownPercent: 2.5,
        description: "峰值10-15%，回退2.5%平仓（保底7.5%）",
      },
      stage4: {
        name: "阶段4",
        minProfit: 15,
        maxProfit: 25,
        drawdownPercent: 3,
        description: "峰值15-25%，回退3%平仓（保底12%）",
      },
      stage5: {
        name: "阶段5",
        minProfit: 25,
        maxProfit: Infinity,
        drawdownPercent: 5,
        description: "峰值25%+，回退5%平仓（保底20%）",
      },
    },
  };
}

/**
 * 生成波段趋势策略特有的提示词
 */
export function generateSwingTrendPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**目标月回报**：20-30%起步
**盈亏比追求**：≥2:1（让盈利充分奔跑，快速止损劣势交易）

【行情识别与应对 - 波段趋势策略】

波段趋势策略注重捕捉中期趋势，持仓时间可达数天

【特殊说明 - 自动监控保护】
本策略启用了自动监控止损和移动止盈（每10秒检查）：
- AI只负责开仓和市场分析
- 平仓完全由自动监控执行
- AI禁止主动调用 closePosition

自动监控止损规则：
- ${params.codeLevelStopLoss?.lowRisk.description}
- ${params.codeLevelStopLoss?.mediumRisk.description}
- ${params.codeLevelStopLoss?.highRisk.description}

自动监控移动止盈规则（5级）：
- ${params.codeLevelTrailingStop?.stage1.description}
- ${params.codeLevelTrailingStop?.stage2.description}
- ${params.codeLevelTrailingStop?.stage3.description}
- ${params.codeLevelTrailingStop?.stage4.description}
- ${params.codeLevelTrailingStop?.stage5.description}

【AI职责】
- 专注于市场分析和开仓决策
- 监控持仓状态并在报告中说明
- 分析技术指标和趋势健康度
- 禁止主动执行平仓操作
- 让自动监控自动处理所有平仓逻辑

单边行情处理：
- 入场条件：必须1分钟、3分钟、5分钟、15分钟这4个时间框架信号全部强烈一致
- 仓位配置：标准仓位（20-35%）
- 杠杆选择：低杠杆（2-5倍）
- 耐心持仓，让利润充分奔跑

震荡行情处理：
- 严格防守
- 提高入场标准
- 降低仓位和杠杆

【波段趋势策略总结】
- 核心原则：耐心等待高质量趋势信号，持仓时间可达数天
- 20分钟执行周期，注重趋势质量而非交易频率
- 自动监控保护利润，AI专注于开仓和分析
- 让利润充分奔跑，不要轻易平仓
`;
}

