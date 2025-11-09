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
 * 激进策略配置
 * 
 * 策略特点：
 * - 风险等级：高风险
 * - 杠杆范围：85%-100% 最大杠杆（如最大25倍，则使用21-25倍）
 * - 仓位大小：25-32%
 * - 适用人群：激进投资者，追求高收益，能承受高风险
 * - 目标月回报：30-50%
 * - 交易频率：积极进取，快速捕捉市场机会
 * 
 * 核心策略：
 * - 单边行情：全力进攻（大仓位+高杠杆）
 * - 震荡行情：严格防守（小仓位+低杠杆）
 * - 风控方式：代码自动执行（enableCodeLevelProtection = true，监控器自动管理）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 激进策略的完整参数配置
 */
export function getAggressiveStrategy(maxLeverage: number): StrategyParams {
  // 激进策略：使用 85%-100% 的最大杠杆
  // 例如：系统最大杠杆25倍时，使用21-25倍
  // 计算激进策略的杠杆范围：使用 85%-100% 的最大杠杆
  // 例如：系统最大杠杆25倍时，计算出21-25倍的杠杆范围
  const aggressiveLevMin = Math.max(3, Math.ceil(maxLeverage * 0.85));  // 最小杠杆：85%最大杠杆，至少3倍
  const aggressiveLevMax = maxLeverage;  // 最大杠杆：100%系统最大杠杆
  
  // 计算不同信号强度下推荐的杠杆倍数
  const aggressiveLevNormal = aggressiveLevMin;  // 普通信号：使用最小杠杆（保守入场）
  const aggressiveLevGood = Math.ceil((aggressiveLevMin + aggressiveLevMax) / 2);  // 良好信号：使用中间值
  const aggressiveLevStrong = aggressiveLevMax;  // 强信号：使用最大杠杆（全力进攻）
  
  return {
    // 策略基本信息
    name: "激进",
    description: "高风险高杠杆，宽松入场条件，适合激进投资者",
    
    // 杠杆配置：使用 85%-100% 最大杠杆
    leverageMin: aggressiveLevMin,
    leverageMax: aggressiveLevMax,
    leverageRecommend: {
      normal: `${aggressiveLevNormal}倍`,  // 普通信号：使用最小杠杆
      good: `${aggressiveLevGood}倍`,      // 良好信号：使用中等杠杆
      strong: `${aggressiveLevStrong}倍`,  // 强信号：使用最大杠杆
    },
    
    // 仓位配置：25-32%（激进，大仓位）
    positionSizeMin: 25,  // 最小25%仓位
    positionSizeMax: 32,  // 最大32%仓位
    positionSizeRecommend: {
      normal: "25-28%",   // 普通信号：较小仓位
      good: "28-30%",     // 良好信号：中等仓位
      strong: "30-32%",   // 强信号：最大仓位
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，stopLossMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    stopLoss: {
      low: -6,    // 低杠杆（如3-12倍，以30倍杠杆为例，亏损6%止损）
      mid: -8,  // 中杠杆（如13-21倍，以30倍杠杆为例，亏损8%止损）
      high: -10,   // 高杠杆（如22-30倍，以30倍杠杆为例，亏损10%止损）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，trailingStopMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    trailingStop: {
      // 激进策略：更晚锁定利润，追求更高收益
      // 基准：15倍杠杆，实际使用时AI会根据杠杆动态调整
      level1: { trigger: 10, stopAt: 4 },  // 盈利达到 +10% 时，止损线移至 +4%（保护6%空间）
      level2: { trigger: 18, stopAt: 10 }, // 盈利达到 +18% 时，止损线移至 +10%（保护8%空间）
      level3: { trigger: 30, stopAt: 18 }, // 盈利达到 +30% 时，止损线移至 +18%（保护12%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，partialProfitMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    partialTakeProfit: {
      stage1: { trigger: 25, closePercent: 40 },  // +25%时平仓40%（开始锁定，保留60%追求更高利润）
      stage2: { trigger: 40, closePercent: 60 },  // +40%时平仓60%（累计平100%，全部锁定）
      stage3: { trigger: 60, closePercent: 100 }, // +60%时全部清仓（防止利润回吐）
    },
    
    // 峰值回撤保护：盈利从峰值回撤25%时，AI强烈建议平仓
    // 例如：峰值+30%，回撤到+5%时（回撤25个百分点），触发保护
    peakDrawdownProtection: 25,
    
    // 波动率调整：根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.8,   // 高波动时，杠杆降低20%（如25倍→20倍）
        positionFactor: 0.85   // 高波动时，仓位降低15%（如30%→25.5%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.2,   // 低波动时，杠杆提高20%（如25倍→30倍，但不超过系统最大）
        positionFactor: 1.1    // 低波动时，仓位提高10%（如30%→33%）
      },
    },
    
    // 策略规则描述
    entryCondition: "至少2个关键时间框架信号一致即可入场",
    riskTolerance: "单笔交易风险可达25-32%，追求高收益",
    tradingStyle: "积极进取，快速捕捉市场机会，追求最大化收益",
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    enableCodeLevelProtection: true,
  };
}

/**
 * 生成激进策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * @param params - 策略参数配置（从 getAggressiveStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 激进策略专属的AI提示词
 */
export function generateAggressivePrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
**目标月回报**：30-50%（通过频繁的小确定性盈利累积）
**盈亏比追求**：≥2:1（激进策略注重频繁获利，盈亏比适度降低，通过高胜率补偿）

【行情识别与应对 - 激进策略核心】

激进策略的核心矛盾：在单边行情积极进攻，在震荡行情严格防守

单边行情处理：
- 入场条件：【必须】至少1个长周期（30m或1h）趋势明确 + 至少1个中周期（5m或15m）与长周期方向一致
- 仓位配置：使用较大仓位（28-32%），充分把握趋势
- 杠杆选择：积极使用较高杠杆（22-25倍），抓住机会
- 关键提醒：单边行情是激进策略的核心盈利来源，但必须由长周期确认！

震荡行情处理：
- 【强制规则】震荡行情禁止频繁开仓，这是亏损的主要来源！
- 入场条件：【必须】至少1个长周期（30m或1h）+ 2个中周期（5m、15m）完全一致
- 仓位配置：大幅降低仓位（15-20%），避免震荡止损
- 杠杆选择：降低杠杆（15-18倍），控制风险
- 关键警告：震荡行情频繁交易=频繁止损+手续费亏损，必须克制！

【激进策略特别提醒】
- 核心原则：长周期确认趋势，中周期验证信号，短周期寻找入场点
- 单边行情全力进攻 = 长周期趋势明确 + 大仓位 + 高杠杆 + 积极加仓
- 震荡行情严格防守 = 长周期震荡 + 小仓位 + 低杠杆 + 高标准
- 成功要诀：在对的行情做对的事（单边进攻、震荡防守）
- 失败根源：仅凭短周期（1m、3m）就开仓 = 频繁止损
- 铁律：长周期（30m、1h）没有明确趋势时，绝不能因为短周期信号就开仓！
`;
}

