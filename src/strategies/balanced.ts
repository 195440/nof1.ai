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
 * 平衡策略配置
 * 
 * 策略特点：
 * - 风险等级：中等风险
 * - 杠杆范围：60%-85% 最大杠杆（如最大25倍，则使用15-21倍）
 * - 仓位大小：20-27%
 * - 适用人群：大多数投资者，追求风险收益平衡
 * - 目标月回报：20-40%
 * - 交易频率：在风险可控前提下积极把握机会
 * 
 * 核心策略：
 * - 单边行情：积极参与（标准仓位+合理杠杆）
 * - 震荡行情：谨慎防守（小仓位+低杠杆）
 * - 风控方式：AI 主动止损止盈（enableCodeLevelProtection = false，由AI主动判断执行）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 平衡策略的完整参数配置
 */
export function getBalancedStrategy(maxLeverage: number): StrategyParams {
  // 计算平衡策略的杠杆范围：使用 60%-85% 的最大杠杆
  // 例如：系统最大杠杆25倍时，计算出15-21倍的杠杆范围
  const balancedLevMin = Math.max(2, Math.ceil(maxLeverage * 0.6));  // 最小杠杆：60%最大杠杆，至少2倍
  const balancedLevMax = Math.max(3, Math.ceil(maxLeverage * 0.85));  // 最大杠杆：85%最大杠杆，至少3倍
  
  // 计算不同信号强度下推荐的杠杆倍数
  const balancedLevNormal = balancedLevMin;  // 普通信号：使用最小杠杆
  const balancedLevGood = Math.ceil((balancedLevMin + balancedLevMax) / 2);  // 良好信号：使用中等杠杆
  const balancedLevStrong = balancedLevMax;  // 强信号：使用最大杠杆
  
  return {
    // ==================== 策略基本信息 ====================
    name: "平衡",  // 策略名称（中文）
    description: "中等风险杠杆，合理入场条件，适合大多数投资者",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：使用 60%-85% 最大杠杆（如系统最大25倍，则使用15-21倍）
    leverageMin: balancedLevMin,  // 最小杠杆倍数
    leverageMax: balancedLevMax,  // 最大杠杆倍数
    leverageRecommend: {
      normal: `${balancedLevNormal}倍`,   // 普通信号：使用最小杠杆（谨慎入场）
      good: `${balancedLevGood}倍`,       // 良好信号：使用中等杠杆（平衡收益风险）
      strong: `${balancedLevStrong}倍`,   // 强信号：使用最大杠杆（把握机会）
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：20-27%（中等仓位，平衡风险收益）
    positionSizeMin: 20,  // 最小仓位：20%（保守信号）
    positionSizeMax: 27,  // 最大仓位：27%（强信号）
    positionSizeRecommend: {
      normal: "20-23%",   // 普通信号：较小仓位，控制风险
      good: "23-25%",     // 良好信号：中等仓位，平衡收益
      strong: "25-27%",   // 强信号：较大仓位，把握机会
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，stopLossMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    stopLoss: {
      low: -3,    // 低杠杆时：亏损3%止损（如使用2-5倍杠杆）
      mid: -2.5,  // 中杠杆时：亏损2.5%止损（如使用6-12倍杠杆）
      high: -2,   // 高杠杆时：亏损2%止损（如使用13倍以上杠杆）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，trailingStopMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    trailingStop: {
      // 平衡策略：适中的移动止盈（基准：15倍杠杆）
      // 注意：这些是基准值，实际使用时AI会根据杠杆动态调整
      level1: { trigger: 8, stopAt: 3 },    // 盈利达到 +8% 时，止损线移至 +3%（保护5%空间）
      level2: { trigger: 15, stopAt: 8 },   // 盈利达到 +15% 时，止损线移至 +8%（保护7%空间）
      level3: { trigger: 25, stopAt: 15 },  // 盈利达到 +25% 时，止损线移至 +15%（保护10%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，partialProfitMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    partialTakeProfit: {
      // 平衡策略：标准分批止盈，逐步锁定利润
      stage1: { trigger: 30, closePercent: 50 },   // +30%时平仓50%（锁定部分利润）
      stage2: { trigger: 40, closePercent: 50 },   // +40%时平仓剩余50%（累计平100%）
      stage3: { trigger: 50, closePercent: 100 },  // +50%时全部清仓（防止利润回吐）
    },
    
    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤30%时，AI强烈建议平仓
    // 例如：峰值+30%，回撤到+0%时（回撤30个百分点），触发保护
    peakDrawdownProtection: 30,
    
    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.7,   // 高波动时，杠杆降低30%（如15倍→10.5倍）
        positionFactor: 0.8    // 高波动时，仓位降低20%（如25%→20%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.1,   // 低波动时，杠杆提高10%（如15倍→16.5倍）
        positionFactor: 1.0    // 低波动时，仓位不调整（保持稳健）
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "至少2个关键时间框架信号一致，3个或更多更佳",  // 入场条件
    riskTolerance: "单笔交易风险控制在20-27%之间，平衡风险与收益",  // 风险容忍度
    tradingStyle: "在风险可控前提下积极把握机会，追求稳健增长",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    enableCodeLevelProtection: false,
  };
}

/**
 * 生成平衡策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * @param params - 策略参数配置（从 getBalancedStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 平衡策略专属的AI提示词
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

