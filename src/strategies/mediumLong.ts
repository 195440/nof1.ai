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

import type { StrategyParams, StrategyPromptContext } from "./types";

/**
 * 中长线策略配置
 * 
 * 策略特点：
 * - 风险等级：中等风险
 * - 杠杆范围：3-10倍（固定范围，给AI充分自主权）
 * - 仓位大小：15-35%（灵活配置，根据市场情况调整）
 * - 适用人群：追求中长期稳健收益，能接受一定波动的投资者
 * - 目标月回报：25-50%
 * - 交易频率：30分钟执行周期，注重质量而非频率
 * - 最长持仓：24小时
 * - 最大持仓数：5个
 * 
 * 核心策略：
 * - AI主导决策：最小限制，充分发挥AI分析能力
 * - 多时间框架验证：建议使用5m/15m/30m/1h四个时间框架
 * - 灵活止盈止损：根据市场情况动态调整
 * - 自主风控：AI根据市场状态自主判断风险
 * - 风控方式：AI 主动止损止盈（enableCodeLevelProtection = false）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（本策略固定使用10倍）
 * @returns 中长线策略的完整参数配置
 */
export function getMediumLongStrategy(maxLeverage: number): StrategyParams {
  // 中长线策略：固定使用 3-10倍杠杆，不受 maxLeverage 限制
  // 这是用户指定的杠杆范围
  const strategyLevMin = 3;   // 最小杠杆：3倍（保守入场）
  const strategyLevMax = 10;  // 最大杠杆：10倍（用户指定的最大值）
  
  // 计算不同信号强度下推荐的杠杆倍数
  const strategyLevNormal = 4;   // 普通信号：4倍杠杆
  const strategyLevGood = 6;     // 良好信号：6倍杠杆
  const strategyLevStrong = 8;   // 强信号：8倍杠杆（保留10倍给极强信号）
  
  return {
    // ==================== 策略基本信息 ====================
    name: "中长线",  // 策略名称（中文）
    description: "30分钟周期，3-10倍杠杆，最长持仓24小时，AI主导决策，最小限制最大自由度",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：固定3-10倍（用户指定）
    // 给AI充分的杠杆选择空间，根据市场情况灵活运用
    leverageMin: strategyLevMin,  // 最小杠杆倍数
    leverageMax: strategyLevMax,  // 最大杠杆倍数
    leverageRecommend: {
      normal: `${strategyLevNormal}倍`,   // 普通信号：4倍杠杆（稳健参与）
      good: `${strategyLevGood}倍`,       // 良好信号：6倍杠杆（平衡收益风险）
      strong: `${strategyLevStrong}倍`,   // 强信号：8倍杠杆（积极把握机会）
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：15-35%（灵活配置）
    // 给AI充分的仓位选择权，可以根据市场情况和信号强度灵活调整
    positionSizeMin: 15,  // 最小仓位：15%（试探性入场）
    positionSizeMax: 35,  // 最大仓位：35%（强信号重仓）
    positionSizeRecommend: {
      normal: "15-22%",   // 普通信号：较小仓位，控制风险
      good: "22-28%",     // 良好信号：标准仓位，平衡收益
      strong: "28-35%",   // 强信号：较大仓位，把握机会
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 给AI充分的判断空间，止损线相对宽松
    // 执行方式：AI根据此配置主动判断和执行（enableCodeLevelProtection = false）
    stopLoss: {
      low: -8,     // 低杠杆(3-5倍)：-8%止损（给趋势足够发展空间）
      mid: -6,     // 中杠杆(5-7倍)：-6%止损（平衡空间和风险）
      high: -4.5,  // 高杠杆(7-10倍)：-4.5%止损（严格控制风险）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // AI可以根据市场情况灵活调整，这里提供建议值
    // 执行方式：AI根据此配置主动判断和执行（enableCodeLevelProtection = false）
    trailingStop: {
      // 中长线策略：给趋势更多空间，较晚锁定利润
      level1: { trigger: 12, stopAt: 5 },    // 盈利达到 +12% 时，止损线移至 +5%（保护7%空间）
      level2: { trigger: 25, stopAt: 15 },   // 盈利达到 +25% 时，止损线移至 +15%（保护10%空间）
      level3: { trigger: 40, stopAt: 28 },   // 盈利达到 +40% 时，止损线移至 +28%（保护12%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // AI可以根据趋势强度灵活调整，这里提供建议值
    // 执行方式：AI根据此配置主动判断和执行（enableCodeLevelProtection = false）
    partialTakeProfit: {
      // 中长线策略：分批止盈，追求利润最大化
      stage1: { trigger: 35, closePercent: 30 },   // +35%时平仓30%（保留70%追求更大利润）
      stage2: { trigger: 60, closePercent: 50 },   // +60%时平仓剩余50%（累计平仓65%）
      stage3: { trigger: 100, closePercent: 100 }, // +100%时全部清仓（翻倍止盈）
    },
    
    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤30%时，AI可以考虑平仓（仅作为参考建议）
    // 例如：峰值+40%，回撤到+10%时（回撤30个百分点），AI可考虑平仓
    // 注意：这是灵活建议，AI可以根据趋势健康度自主判断
    peakDrawdownProtection: 30,
    
    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    // 给AI充分的调整空间，适应不同市场环境
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.6,   // 高波动时，杠杆降低40%（如8倍→4.8倍）
        positionFactor: 0.7    // 高波动时，仓位降低30%（如30%→21%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.15,  // 低波动时，杠杆提高15%（如8倍→9.2倍）
        positionFactor: 1.1    // 低波动时，仓位提高10%（如30%→33%）
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "建议多时间框架验证（5m/15m/30m/1h），但AI可根据市场情况灵活调整入场标准",  // 入场条件（灵活）
    riskTolerance: "单笔风险控制在15-35%之间，AI可根据市场状态动态调整",  // 风险容忍度
    tradingStyle: "30分钟执行周期，中长线持仓（最长24小时），注重质量而非频率，给AI充分自主决策权",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    // 
    // 中长线策略：禁用代码级保护，完全由AI主导（enableCodeLevelProtection = false）
    // 这样AI可以根据市场情况灵活调整止盈止损，不受固定规则限制
    enableCodeLevelProtection: false,
  };
}

/**
 * 生成中长线策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * 核心理念：最小限制，最大自由度，充分发挥AI的分析和决策能力
 * 
 * @param params - 策略参数配置（从 getMediumLongStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 中长线策略专属的AI提示词
 */
export function generateMediumLongPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**策略类型**：中长线策略 - AI主导决策
**执行周期**：${context.intervalMinutes}分钟（建议30分钟）
**目标月回报**：25-50%起步
**盈亏比追求**：≥2:1（灵活调整，根据市场情况）
**最长持仓时间**：${context.maxHoldingHours}小时（建议24小时）
**最大持仓数**：${context.maxPositions}个

【中长线策略核心理念】

本策略的设计哲学是：**最小限制，最大自由度，充分信任AI的分析和决策能力**

你将获得充分的自主权来进行交易决策，包括但不限于：
- 自主选择入场时机和条件
- 灵活调整杠杆倍数（3-10倍范围）
- 灵活配置仓位大小（15-35%范围）
- 自主判断止盈止损时机
- 根据市场状态动态调整策略

【杠杆使用指南】

可用杠杆范围：${params.leverageMin}-${params.leverageMax}倍

杠杆选择建议（仅供参考，你可以灵活调整）：
- 普通信号：${params.leverageRecommend.normal}（稳健参与）
- 良好信号：${params.leverageRecommend.good}（平衡收益风险）
- 强信号：${params.leverageRecommend.strong}（积极把握机会）
- 极强信号：可以使用${params.leverageMax}倍（谨慎使用，需要充分理由）

关键原则：
- 高杠杆需要更强的信号确认和更严格的止损
- 市场波动大时主动降低杠杆
- 可以根据持仓表现动态调整后续入场的杠杆

【仓位配置指南】

可用仓位范围：${params.positionSizeMin}-${params.positionSizeMax}%

仓位选择建议（仅供参考，你可以灵活调整）：
- 试探性入场：${params.positionSizeRecommend.normal}（信号一般或不确定）
- 标准入场：${params.positionSizeRecommend.good}（信号良好）
- 重仓入场：${params.positionSizeRecommend.strong}（信号极强且多重确认）

关键原则：
- 根据信号强度和确信度调整仓位
- 考虑当前持仓数量，避免过度集中风险
- 可以采用分批建仓策略（先轻仓试探，确认后加仓）

【入场决策指南】

建议的分析框架（非强制要求）：

1. **多时间框架验证**：
   - 建议关注：5分钟、15分钟、30分钟、1小时
   - 长周期（30m/1h）：判断大趋势方向
   - 中周期（15m）：确认趋势延续性
   - 短周期（5m）：寻找精准入场点
   
2. **技术指标参考**：
   - 趋势指标：EMA均线系统、MACD
   - 动量指标：RSI、成交量
   - 波动率：ATR（平均真实波幅）
   
3. **市场状态判断**：
   - 单边行情：积极参与，给趋势足够空间
   - 震荡行情：谨慎入场，降低仓位和杠杆
   - 转折行情：耐心等待确认，避免抢跑

**重要提示**：以上仅为建议框架，你可以根据实际市场情况灵活调整分析方法和入场标准。

【止损策略指南】

止损建议（你可以根据市场情况灵活调整）：

根据杠杆等级的建议止损线：
- 低杠杆(3-5倍)：建议亏损 ${params.stopLoss.low}% 止损（给趋势足够空间）
- 中杠杆(5-7倍)：建议亏损 ${params.stopLoss.mid}% 止损（平衡空间和风险）
- 高杠杆(7-10倍)：建议亏损 ${params.stopLoss.high}% 止损（严格控制风险）

灵活止损的场景：
- 市场快速逆转，技术面破位：提前止损
- 趋势仍然健康，暂时回调：可以给更多空间
- 持仓时间接近24小时：评估是否需要提前离场

核心原则：
- 止损是保护本金的最后防线，但不是唯一防线
- 重视技术面和基本面的综合判断
- 及时止损比死扛更重要

【止盈策略指南】

移动止盈建议（你可以根据趋势强度灵活调整）：

三级移动止盈参考：
- Level 1: 盈利达到 ${params.trailingStop.level1.trigger}% 时，可将止损线移至 ${params.trailingStop.level1.stopAt}%
- Level 2: 盈利达到 ${params.trailingStop.level2.trigger}% 时，可将止损线移至 ${params.trailingStop.level2.stopAt}%
- Level 3: 盈利达到 ${params.trailingStop.level3.trigger}% 时，可将止损线移至 ${params.trailingStop.level3.stopAt}%

分批止盈建议（你可以根据市场情况灵活调整）：
- Stage 1: 盈利达到 ${params.partialTakeProfit.stage1.trigger}% 时，可考虑平仓 ${params.partialTakeProfit.stage1.closePercent}%
- Stage 2: 盈利达到 ${params.partialTakeProfit.stage2.trigger}% 时，可考虑平仓剩余 ${params.partialTakeProfit.stage2.closePercent}%
- Stage 3: 盈利达到 ${params.partialTakeProfit.stage3.trigger}% 时，全部清仓

灵活止盈的场景：
- 趋势强劲，多时间框架一致：可以延迟止盈，让利润充分奔跑
- 趋势减弱，出现背离信号：可以提前止盈或增加平仓比例
- 接近24小时持仓上限：评估是否需要提前止盈

峰值回撤保护：
- 当盈利从峰值回撤约 ${params.peakDrawdownProtection}% 时，建议考虑平仓
- 但如果趋势仍然健康，可以给予一定容忍度

核心原则：
- 让盈利充分奔跑，但也要及时锁定利润
- 分批止盈比一次性清仓更稳健
- 根据趋势强度动态调整止盈策略

【波动率调整】

根据市场波动率动态调整参数：

高波动环境（ATR > 5%）：
- 杠杆调整系数：${params.volatilityAdjustment.highVolatility.leverageFactor}（降低${(1-params.volatilityAdjustment.highVolatility.leverageFactor)*100}%）
- 仓位调整系数：${params.volatilityAdjustment.highVolatility.positionFactor}（降低${(1-params.volatilityAdjustment.highVolatility.positionFactor)*100}%）

正常波动环境（ATR 2-5%）：
- 使用标准参数，不需要调整

低波动环境（ATR < 2%）：
- 杠杆调整系数：${params.volatilityAdjustment.lowVolatility.leverageFactor}（提高${(params.volatilityAdjustment.lowVolatility.leverageFactor-1)*100}%）
- 仓位调整系数：${params.volatilityAdjustment.lowVolatility.positionFactor}（提高${(params.volatilityAdjustment.lowVolatility.positionFactor-1)*100}%）

【持仓管理】

时间管理：
- 最长持仓时间：${context.maxHoldingHours}小时
- 接近时间上限时，评估是否需要平仓
- 如果趋势依然强劲，可以考虑适当延长（需要充分理由）

持仓数量管理：
- 最大持仓数：${context.maxPositions}个
- 避免过度分散或过度集中
- 根据各持仓表现动态调整新入场的仓位大小

持仓监控：
- 定期（每个执行周期）检查所有持仓的健康度
- 关注技术面变化、止盈止损触发情况
- 在分析报告中说明每个持仓的状态和下一步计划

【AI决策自主权】

你拥有充分的自主权，包括但不限于：

1. **灵活入场**：
   - 可以根据市场情况调整入场标准
   - 不必拘泥于固定的时间框架数量
   - 信任你的综合判断

2. **灵活持仓**：
   - 可以根据趋势发展调整止盈止损
   - 可以提前或延后执行止盈止损
   - 可以采用非标准的平仓比例

3. **灵活风控**：
   - 可以根据市场状态动态调整风险敞口
   - 可以在极端情况下突破常规限制（需要充分理由）
   - 可以暂停交易等待更好机会

4. **自主学习**：
   - 从历史交易中总结经验教训
   - 根据市场反馈调整决策模型
   - 持续优化交易策略

【风险管理底线】

虽然给予你充分自主权，但以下是必须遵守的底线：

1. **强制止损**：
   - 系统级极限止损：单笔亏损达到 ${context.extremeStopLossPercent}% 时强制平仓
   - 这是保护账户的最后防线

2. **时间限制**：
   - 单笔持仓最长时间：${context.maxHoldingHours}小时
   - 超过后必须平仓（除非有极其充分的理由）

3. **持仓数量**：
   - 最大同时持仓：${context.maxPositions}个
   - 不得超过此限制

4. **杠杆和仓位范围**：
   - 杠杆必须在 ${params.leverageMin}-${params.leverageMax}倍范围内
   - 仓位必须在 ${params.positionSizeMin}-${params.positionSizeMax}% 范围内

【交易币种】

可交易币种：${context.tradingSymbols.join('、')}

币种选择建议：
- 优先选择流动性好、波动适中的币种
- 避免同时持有高度相关的币种（分散风险）
- 关注各币种的独立走势和特性

【策略总结】

核心理念：
- **信任AI**：充分发挥你的分析和决策能力
- **灵活应变**：根据市场情况动态调整策略
- **注重质量**：宁缺毋滥，等待高质量机会
- **风险可控**：在自主决策的同时，严守风险底线

交易节奏：
- 30分钟执行周期，不急于频繁交易
- 中长线持仓（数小时到24小时），让利润充分发展
- 耐心等待高质量信号，避免强行交易

决策流程：
1. 多维度分析市场状态和趋势
2. 综合判断信号强度和确信度
3. 灵活选择杠杆、仓位和入场时机
4. 持续监控持仓，动态调整止盈止损
5. 在分析报告中清晰说明决策理由

记住：你不仅是执行者，更是决策者。相信你的判断，勇于承担责任，持续学习优化。
`;
}

