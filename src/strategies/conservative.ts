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
 * 稳健策略配置
 * 
 * 策略特点：
 * - 风险等级：低风险
 * - 杠杆范围：30%-60% 最大杠杆（如最大25倍，则使用8-15倍）
 * - 仓位大小：15-22%
 * - 适用人群：保守投资者，优先保护本金，追求稳健收益
 * - 目标月回报：10-20%
 * - 交易频率：谨慎交易，宁可错过机会也不冒险
 * 
 * 核心策略：
 * - 单边行情：谨慎参与（标准仓位+低杠杆）
 * - 震荡行情：严格防守（最小仓位+最低杠杆）
 * - 风控方式：AI 主动止损止盈（enableCodeLevelProtection = false，由AI主动判断执行）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 稳健策略的完整参数配置
 */
export function getConservativeStrategy(maxLeverage: number): StrategyParams {
  // 计算稳健策略的杠杆范围：使用 30%-60% 的最大杠杆
  // 例如：系统最大杠杆25倍时，计算出8-15倍的杠杆范围
  const conservativeLevMin = Math.max(1, Math.ceil(maxLeverage * 0.3));  // 最小杠杆：30%最大杠杆，至少1倍
  const conservativeLevMax = Math.max(2, Math.ceil(maxLeverage * 0.6));  // 最大杠杆：60%最大杠杆，至少2倍
  
  // 计算不同信号强度下推荐的杠杆倍数
  const conservativeLevNormal = conservativeLevMin;  // 普通信号：使用最小杠杆（最保守）
  const conservativeLevGood = Math.ceil((conservativeLevMin + conservativeLevMax) / 2);  // 良好信号：使用中等杠杆
  const conservativeLevStrong = conservativeLevMax;  // 强信号：使用最大杠杆（但仍然保守）
  
  return {
    // ==================== 策略基本信息 ====================
    name: "稳健",  // 策略名称（中文）
    description: "低风险低杠杆，严格入场条件，适合保守投资者",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：使用 30%-60% 最大杠杆（如系统最大25倍，则使用8-15倍）
    leverageMin: conservativeLevMin,  // 最小杠杆倍数
    leverageMax: conservativeLevMax,  // 最大杠杆倍数
    leverageRecommend: {
      normal: `${conservativeLevNormal}倍`,   // 普通信号：使用最小杠杆（最保守）
      good: `${conservativeLevGood}倍`,       // 良好信号：使用中等杠杆（稳健平衡）
      strong: `${conservativeLevStrong}倍`,   // 强信号：使用最大杠杆（但仍保守）
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：15-22%（小仓位，优先保护本金）
    positionSizeMin: 15,  // 最小仓位：15%（最保守）
    positionSizeMax: 22,  // 最大仓位：22%（强信号时）
    positionSizeRecommend: {
      normal: "15-17%",   // 普通信号：最小仓位，严控风险
      good: "17-20%",     // 良好信号：中等仓位，稳健参与
      strong: "20-22%",   // 强信号：较大仓位，把握确定性机会
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，stopLossMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    stopLoss: {
      low: -3.5,   // 低杠杆时：亏损3.5%止损（如使用1-3倍杠杆）
      mid: -3,     // 中杠杆时：亏损3%止损（如使用4-8倍杠杆）
      high: -2.5,  // 高杠杆时：亏损2.5%止损（如使用9倍以上杠杆）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，trailingStopMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    trailingStop: {
      // 保守策略：较早锁定利润（基准：15倍杠杆）
      // 注意：这些是基准值，实际使用时AI会根据杠杆动态调整
      level1: { trigger: 6, stopAt: 2 },    // 盈利达到 +6% 时，止损线移至 +2%（保护4%空间）
      level2: { trigger: 12, stopAt: 6 },   // 盈利达到 +12% 时，止损线移至 +6%（保护6%空间）
      level3: { trigger: 20, stopAt: 12 },  // 盈利达到 +20% 时，止损线移至 +12%（保护8%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，partialProfitMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    partialTakeProfit: {
      // 保守策略：较早分批止盈，提前锁定利润
      stage1: { trigger: 20, closePercent: 50 },   // +20%时平仓50%（较早锁定）
      stage2: { trigger: 30, closePercent: 50 },   // +30%时平仓剩余50%（累计平100%）
      stage3: { trigger: 40, closePercent: 100 },  // +40%时全部清仓（防止利润回吐）
    },
    
    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤25%时，AI强烈建议平仓（更早保护利润）
    // 例如：峰值+25%，回撤到+0%时（回撤25个百分点），触发保护
    peakDrawdownProtection: 25,
    
    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.6,   // 高波动时，杠杆降低40%（如10倍→6倍）
        positionFactor: 0.7    // 高波动时，仓位降低30%（如20%→14%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.0,   // 低波动时，杠杆不调整（保守策略不追求激进）
        positionFactor: 1.0    // 低波动时，仓位不调整（保持稳健）
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "至少3个关键时间框架信号一致，4个或更多更佳",  // 入场条件（严格）
    riskTolerance: "单笔交易风险控制在15-22%之间，严格控制回撤",  // 风险容忍度
    tradingStyle: "谨慎交易，宁可错过机会也不冒险，优先保护本金",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    enableCodeLevelProtection: false,
  };
}

/**
 * 生成稳健策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * @param params - 策略参数配置（从 getConservativeStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 稳健策略专属的AI提示词
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

