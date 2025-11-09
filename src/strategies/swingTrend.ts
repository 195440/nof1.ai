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
 * 波段趋势策略配置
 * 
 * 策略特点：
 * - 风险等级：中低风险
 * - 杠杆范围：20%-50% 最大杠杆（如最大25倍，则使用5-13倍）
 * - 仓位大小：20-35%
 * - 适用人群：追求中长期趋势、稳健成长的投资者
 * - 目标月回报：20-30%
 * - 交易频率：20分钟执行周期，注重趋势质量而非交易频率
 * 
 * 核心策略：
 * - 短周期精准入场：使用1m/3m/5m/15m四个时间框架共振
 * - 自动监控保护：止损和止盈完全由自动监控系统执行（每10秒检查）
 * - AI专注开仓：AI只负责寻找高质量开仓机会，不主动平仓
 * - 耐心持仓：持仓时间可达数小时到3天，让利润充分奔跑
 * - 风控方式：自动监控止损止盈（enableCodeLevelProtection = true）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 波段趋势策略的完整参数配置
 */
export function getSwingTrendStrategy(maxLeverage: number): StrategyParams {
  return {
    // ==================== 策略基本信息 ====================
    name: "波段趋势",  // 策略名称（中文）
    description: "中长线波段交易，20分钟执行，捕捉中期趋势，适合稳健成长",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：使用 20%-50% 最大杠杆（如系统最大25倍，则使用5-13倍）
    // 低杠杆配合较大仓位，适合中长线持仓
    leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.2)),   // 最小杠杆：20%最大杠杆，至少2倍
    leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.5)),   // 最大杠杆：50%最大杠杆，至少5倍
    leverageRecommend: {
      normal: `${Math.max(2, Math.ceil(maxLeverage * 0.2))}倍`,   // 普通信号：使用最小杠杆（2倍，最安全）
      good: `${Math.max(3, Math.ceil(maxLeverage * 0.35))}倍`,    // 良好信号：使用中等杠杆（3倍左右）
      strong: `${Math.max(5, Math.ceil(maxLeverage * 0.5))}倍`,   // 强信号：使用最大杠杆（5倍，谨慎使用）
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：20-35%（较大仓位，配合低杠杆）
    positionSizeMin: 20,  // 最小仓位：20%（普通信号）
    positionSizeMax: 35,  // 最大仓位：35%（强信号，谨慎使用）
    positionSizeRecommend: {
      normal: "20-25%",   // 普通信号：标准仓位，稳健参与
      good: "25-30%",     // 良好信号：较大仓位，把握趋势
      strong: "30-35%",   // 强信号：最大仓位，谨慎使用（需4个时间框架完美共振）
    },
    
    // ==================== 止损配置 ====================
    // 根据杠杆倍数分级止损
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，stopLossMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    stopLoss: {
      low: -9,      // 低杠杆(2-3倍)：-9%止损（给趋势足够空间）
      mid: -7.5,    // 中杠杆(3-4倍)：-7.5%止损（平衡空间和风险）
      high: -5.5,   // 高杠杆(4-5倍)：-5.5%止损（较严格控制）
    },
    
    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，trailingStopMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    trailingStop: {
      // 波段策略：给趋势更多空间，较晚锁定利润
      level1: { trigger: 15, stopAt: 8 },    // 盈利达到 +15% 时，止损线移至 +8%（保护7%空间）
      level2: { trigger: 30, stopAt: 20 },   // 盈利达到 +30% 时，止损线移至 +20%（保护10%空间）
      level3: { trigger: 50, stopAt: 35 },   // 盈利达到 +50% 时，止损线移至 +35%（保护15%空间）
    },
    
    // ==================== 分批止盈配置 ====================
    // 逐步锁定利润
    // 执行方式：
    //   - enableCodeLevelProtection = true：代码自动执行（每10秒检查，partialProfitMonitor.ts）
    //   - enableCodeLevelProtection = false：AI根据此配置主动判断和执行
    partialTakeProfit: {
      // 波段策略：更晚分批止盈，追求趋势利润最大化
      stage1: { trigger: 50, closePercent: 40 },   // +50%时平仓40%（保留60%追求更大利润）
      stage2: { trigger: 80, closePercent: 60 },   // +80%时平仓剩余60%（累计平仓100%）
      stage3: { trigger: 120, closePercent: 100 }, // +120%时全部清仓（防止回吐）
    },
    
    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤35%时，AI强烈建议平仓（给趋势更多空间）
    // 例如：峰值+50%，回撤到+15%时（回撤35个百分点），触发保护
    // 注意：当前由移动止盈实现，此参数仅供参考
    peakDrawdownProtection: 35,
    
    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.5,   // 高波动时，杠杆降低50%（如5倍→2.5倍）
        positionFactor: 0.6    // 高波动时，仓位降低40%（如30%→18%）
      },
      normalVolatility: { 
        leverageFactor: 1.0,   // 正常波动时，杠杆不调整
        positionFactor: 1.0    // 正常波动时，仓位不调整
      },
      lowVolatility: { 
        leverageFactor: 1.2,   // 低波动时，杠杆提高20%（如5倍→6倍）
        positionFactor: 1.1    // 低波动时，仓位提高10%（如30%→33%）
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "必须1分钟、3分钟、5分钟、15分钟这4个时间框架信号全部强烈一致，且关键指标共振（MACD、RSI、EMA方向一致）",  // 入场条件（严格）
    riskTolerance: "单笔交易风险控制在20-35%之间，注重趋势质量而非交易频率",  // 风险容忍度
    tradingStyle: "波段趋势交易，20分钟执行周期，耐心等待高质量趋势信号，持仓时间可达数天，让利润充分奔跑",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 控制上述 stopLoss、trailingStop、partialTakeProfit 的执行方式
    // - true：代码自动执行（监控器每10秒检查，AI只需负责开仓）
    // - false：AI主动执行（AI根据配置在交易周期中判断和执行）
    enableCodeLevelProtection: true,
    // 自动监控会使用上面的 stopLoss 和 trailingStop 配置
  };
}

/**
 * 生成波段趋势策略特有的提示词
 * 
 * 根据策略参数和运行上下文，生成传递给AI的策略提示词。
 * AI会根据这些提示词来指导交易决策。
 * 
 * 注意：波段策略启用了自动监控保护，AI只负责开仓，平仓由自动监控系统执行。
 * 
 * @param params - 策略参数配置（从 getSwingTrendStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns 波段趋势策略专属的AI提示词
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

自动监控止损规则（根据杠杆倍数）：
- ${params.leverageMin}-${Math.ceil(params.leverageMin + (params.leverageMax - params.leverageMin) * 0.33)}倍杠杆：亏损 ${params.stopLoss.low}% 时止损
- ${Math.ceil(params.leverageMin + (params.leverageMax - params.leverageMin) * 0.33) + 1}-${Math.ceil(params.leverageMin + (params.leverageMax - params.leverageMin) * 0.67)}倍杠杆：亏损 ${params.stopLoss.mid}% 时止损
- ${Math.ceil(params.leverageMin + (params.leverageMax - params.leverageMin) * 0.67) + 1}倍以上杠杆：亏损 ${params.stopLoss.high}% 时止损

自动监控移动止盈规则（3级）：
- Level 1: 峰值达到 ${params.trailingStop.level1.trigger}% 时，回落至 ${params.trailingStop.level1.stopAt}% 平仓
- Level 2: 峰值达到 ${params.trailingStop.level2.trigger}% 时，回落至 ${params.trailingStop.level2.stopAt}% 平仓
- Level 3: 峰值达到 ${params.trailingStop.level3.trigger}% 时，回落至 ${params.trailingStop.level3.stopAt}% 平仓

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

