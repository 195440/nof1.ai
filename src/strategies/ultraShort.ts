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
 * 超短线策略配置
 * 
 * 策略特点：
 * - 风险等级：中高风险
 * - 杠杆范围：50%-75% 最大杠杆（如最大25倍，则使用13-19倍）
 * - 仓位大小：18-25%
 * - 适用人群：喜欢高频交易、快进快出的交易者
 * - 目标月回报：20-30%
 * - 交易频率：5分钟执行周期，快速捕捉短期波动
 * 
 * 核心策略：
 * - 快进快出：5分钟执行周期，持仓30分钟-2小时
 * - 周期锁利：每个周期内盈利>2%且<4%时立即平仓
 * - 30分钟规则：持仓超过30分钟且盈利>手续费时执行保守平仓
 * - 风控方式：AI 主动止损止盈（enableCodeLevelProtection = false，由AI主动判断执行）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 超短线策略的完整参数配置
 */
export function getUltraShortStrategy(maxLeverage: number): StrategyParams {
  // 计算超短线策略的杠杆范围：使用 50%-75% 的最大杠杆
  // 例如：系统最大杠杆25倍时，计算出13-19倍的杠杆范围
  const ultraShortLevMin = Math.max(3, Math.ceil(maxLeverage * 0.5));   // 最小杠杆：50%最大杠杆，至少3倍
  const ultraShortLevMax = Math.max(5, Math.ceil(maxLeverage * 0.75));  // 最大杠杆：75%最大杠杆，至少5倍
  
  return {
    // ==================== 策略基本信息 ====================
    name: "超短线",  // 策略名称（中文）
    description: "极短周期快进快出，5分钟执行，适合高频交易",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：使用 50%-75% 最大杠杆（如系统最大25倍，则使用13-19倍）
    leverageMin: ultraShortLevMin,  // 最小杠杆倍数
    leverageMax: ultraShortLevMax,  // 最大杠杆倍数
    leverageRecommend: {
      normal: `${ultraShortLevMin}倍`,  // 普通信号：使用最小杠杆（快速入场）
      good: `${Math.max(4, Math.ceil(maxLeverage * 0.625))}倍`,  // 良好信号：使用中等杠杆（62.5%）
      strong: `${ultraShortLevMax}倍`,  // 强信号：使用最大杠杆（把握短期机会）
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：18-25%（中等偏小仓位，快进快出）
    positionSizeMin: 18,  // 最小仓位：18%（普通信号）
    positionSizeMax: 25,  // 最大仓位：25%（强信号）
    positionSizeRecommend: {
      normal: "18-20%",   // 普通信号：较小仓位，快速试探
      good: "20-23%",     // 良好信号：中等仓位，把握波动
      strong: "23-25%",   // 强信号：较大仓位，短期进攻
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，stopLossMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    stopLoss: {
      low: -2.5,   // 低杠杆时：亏损2.5%止损（如使用3-7倍杠杆）
      mid: -2,     // 中杠杆时：亏损2%止损（如使用8-13倍杠杆）
      high: -1.5,  // 高杠杆时：亏损1.5%止损（如使用14倍以上杠杆）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，trailingStopMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    trailingStop: {
      // 超短线策略：快速锁利（5分钟周期，快进快出）
      level1: { trigger: 4, stopAt: 1.5 },    // 盈利达到 +4% 时，止损线移至 +1.5%（保护2.5%空间）
      level2: { trigger: 8, stopAt: 4 },      // 盈利达到 +8% 时，止损线移至 +4%（保护4%空间）
      level3: { trigger: 15, stopAt: 8 },     // 盈利达到 +15% 时，止损线移至 +8%（保护7%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，partialProfitMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    partialTakeProfit: {
      // 超短线策略：快速分批止盈，及时锁定短期利润
      stage1: { trigger: 15, closePercent: 50 },   // +15%时平仓50%（快速锁定）
      stage2: { trigger: 25, closePercent: 50 },   // +25%时平仓剩余50%（累计平100%）
      stage3: { trigger: 35, closePercent: 100 },  // +35%时全部清仓（防止回吐）
    },
    
    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤20%时，AI强烈建议平仓（快速保护短期利润）
    // 例如：峰值+20%，回撤到+0%时（回撤20个百分点），触发保护
    peakDrawdownProtection: 20,
    
    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.7,   // 高波动时，杠杆降低30%（如15倍→10.5倍）
        positionFactor: 0.8    // 高波动时，仓位降低20%（如20%→16%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.1,   // 低波动时，杠杆提高10%（如15倍→16.5倍）
        positionFactor: 1.0    // 低波动时，仓位不调整
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "至少2个时间框架信号一致，优先1-5分钟级别",  // 入场条件（注重短周期）
    riskTolerance: "单笔交易风险控制在18-25%之间，快进快出",  // 风险容忍度
    tradingStyle: "超短线交易，5分钟执行周期，快速捕捉短期波动，严格执行2%周期锁利规则和30分钟盈利平仓规则",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    enableCodeLevelProtection: false,
  };
}

/**
 * 生成超短线策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * @param params - 策略参数配置（从 getUltraShortStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 超短线策略专属的AI提示词
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

