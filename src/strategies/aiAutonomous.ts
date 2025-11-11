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
 * AI自主策略配置
 * 
 * 策略特点：
 * - 风险等级：完全由AI自主决定
 * - 杠杆范围：1-最大杠杆（AI完全自主选择）
 * - 仓位大小：1-100%（AI完全自主选择）
 * - 适用人群：信任AI能力的交易者
 * - 目标回报：由AI根据市场情况自主决定
 * - 交易频率：由AI根据市场机会自主决定
 * 
 * 核心理念：
 * - 不提供任何策略建议或限制
 * - 只提供市场数据和交易工具
 * - AI完全自主分析和决策
 * - 仅保留系统级硬性风控底线
 * - 风控方式：双重防护（enableCodeLevelProtection = true + allowAiOverrideProtection = true）
 *   - 代码级自动止损：每10秒监控，触发阈值自动平仓（安全网）
 *   - AI主动决策：AI可以在代码级保护之前主动止盈止损（灵活性）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns AI自主策略的完整参数配置
 */
export function getAiAutonomousStrategy(maxLeverage: number): StrategyParams {
  return {
    // ==================== 策略基本信息 ====================
    name: "AI自主",  // 策略名称（中文）
    description: "完全由AI主导，不提供任何策略建议，AI自主分析市场并做出决策",  // 策略描述
    
    // ==================== 杠杆配置 ====================
    // 杠杆范围：1倍到最大杠杆，由AI完全自主选择
    leverageMin: 1,  // 最小杠杆倍数
    leverageMax: maxLeverage,  // 最大杠杆倍数
    leverageRecommend: {
      normal: "由AI自主决定",   // 不提供建议
      good: "由AI自主决定",     // 不提供建议
      strong: "由AI自主决定",   // 不提供建议
    },
    
    // ==================== 仓位配置 ====================
    // 仓位范围：1-100%，由AI完全自主选择
    positionSizeMin: 1,   // 最小仓位：1%
    positionSizeMax: 100, // 最大仓位：100%
    positionSizeRecommend: {
      normal: "由AI自主决定",   // 不提供建议
      good: "由AI自主决定",     // 不提供建议
      strong: "由AI自主决定",   // 不提供建议
    },
    
    // ==================== 止损配置 ====================
    // 代码级自动止损配置（作为安全网）
    // AI可以在此之前主动止损，这些是最后的防线
    stopLoss: {
      low: -20,    // 低杠杆（1-5倍）：亏损8%时代码自动止损
      mid: -20,    // 中杠杆（6-10倍）：亏损6%时代码自动止损
      high: -20,   // 高杠杆（11倍以上）：亏损5%时代码自动止损
    },
    
    // ==================== 移动止盈配置 ====================
    // 代码级自动移动止盈配置（作为利润保护网）
    // AI可以在此之前主动止盈，这些是自动保护机制
    trailingStop: {
      level1: { trigger: 5, stopAt: 3 },    // 盈利5%时，止损线移至+2%
      level2: { trigger: 10, stopAt: 5 },   // 盈利10%时，止损线移至+5%
      level3: { trigger: 15, stopAt: 10 },   // 盈利15%时，止损线移至+8%
    },
    
    // ==================== 分批止盈配置 ====================
    // 代码级自动分批止盈配置（作为利润锁定机制）
    // AI可以在此之前主动止盈，这些是自动锁利机制
    partialTakeProfit: {
      stage1: { trigger: 20, closePercent: 30 },   // 盈利8%时，自动平仓30%
      stage2: { trigger: 30, closePercent: 30 },  // 盈利12%时，自动平仓30%
      stage3: { trigger: 40, closePercent: 100 },  // 盈利18%时，自动平仓40%
    },
    
    // ==================== 峰值回撤保护 ====================
    // 代码级峰值回撤保护（防止利润大幅回吐）
    peakDrawdownProtection: 50,  // 从峰值回撤50%时提醒AI注意
    
    // ==================== 波动率调整 ====================
    // 不进行波动率调整，由AI自主判断
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 1.0,  // 不调整
        positionFactor: 1.0   // 不调整
      },
      normalVolatility: { 
        leverageFactor: 1.0,  // 不调整
        positionFactor: 1.0   // 不调整
      },
      lowVolatility: { 
        leverageFactor: 1.0,  // 不调整
        positionFactor: 1.0   // 不调整
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "由AI根据市场数据自主判断",  // 入场条件
    riskTolerance: "由AI根据市场情况自主决定风险承受度",  // 风险容忍度
    tradingStyle: "由AI根据市场机会自主决定交易风格和频率",  // 交易风格
    
    // ==================== 代码级保护开关 ====================
    // 启用代码级保护（每10秒自动监控止损止盈）
    enableCodeLevelProtection: true,
    
    // ==================== 双重防护模式 ====================
    // 允许AI在代码级保护之外继续主动操作止盈止损
    allowAiOverrideProtection: true,
  };
}

/**
 * 生成AI自主策略特有的提示词
 * 
 * 这个策略不提供任何策略建议，只提供市场数据和工具说明。
 * AI需要完全自主分析市场并做出决策。
 * 
 * @param params - 策略参数配置（从 getAiAutonomousStrategy 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量等）
 * @returns AI自主策略专属的AI提示词
 */
export function generateAiAutonomousPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【AI自主策略 - 完全自主决策模式】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**核心理念**：
你是一个完全自主的AI交易员。本策略不会给你任何交易建议、策略框架或决策指导。
你需要完全依靠自己的分析能力，基于市场数据做出所有交易决策。

**你拥有的资源**：
1. **完整的市场数据**：
   - 多个时间框架的K线数据（1m, 3m, 5m, 15m, 30m, 1h, 4h）
   - 技术指标（价格、EMA、MACD、RSI、成交量等）
   - 资金费率
   - 订单簿数据
   - 持仓量数据

2. **完整的账户信息**：
   - 账户余额和可用资金
   - 当前持仓状态
   - 历史交易记录
   - 收益率和夏普比率

3. **完整的交易工具**：
   - openPosition: 开仓（做多或做空）
   - closePosition: 平仓
   - 可以使用 1-${context.maxPositions} 倍杠杆
   - 可以同时持有最多 ${context.maxPositions} 个仓位

**双重防护机制**（保护你的交易安全）：

**第一层：代码级自动保护**（每10秒监控，自动执行）
- 自动止损：
  • 低杠杆（1-5倍）：亏损达到 -8% 自动平仓
  • 中杠杆（6-10倍）：亏损达到 -6% 自动平仓
  • 高杠杆（11倍以上）：亏损达到 -5% 自动平仓
- 自动移动止盈：
  • 盈利达到 5% 时，止损线移至 +2%（锁定利润）
  • 盈利达到 10% 时，止损线移至 +5%（锁定更多利润）
  • 盈利达到 15% 时，止损线移至 +8%（保护大部分利润）
- 自动分批止盈：
  • 盈利达到 8% 时，自动平仓 30%（锁定部分利润）
  • 盈利达到 12% 时，自动平仓 30%（继续锁定利润）
  • 盈利达到 18% 时，自动平仓 40%（大部分获利了结）

**第二层：AI主动决策**（你的灵活操作权）
- 你可以在代码自动保护触发**之前**主动止损止盈
- 你可以根据市场情况灵活调整，不必等待自动触发
- 你可以更早止损（避免更大亏损）
- 你可以更早止盈（落袋为安）
- 代码保护是最后的安全网，你有完全的主动权

**系统硬性底线**（防止极端风险）：
- 单笔交易亏损达到 ${context.extremeStopLossPercent}% 时，系统会强制平仓（防止爆仓）
- 持仓时间超过 ${context.maxHoldingHours} 小时，系统会强制平仓（释放资金）
- 最大杠杆：${params.leverageMax} 倍
- 最大持仓数：${context.maxPositions} 个
- 可交易币种：${context.tradingSymbols.join(", ")}

**你的任务**：
1. **自主分析市场**：
   - 自己决定看哪些指标
   - 自己决定如何解读数据
   - 自己决定什么是好的交易机会

2. **自主制定策略**：
   - 自己决定使用什么交易策略
   - 自己决定何时激进、何时保守
   - 自己决定持仓时间长短
   - 自己决定止损止盈规则

3. **自主执行交易**：
   - 自己决定何时开仓、平仓
   - 自己决定使用多少杠杆
   - 自己决定使用多大仓位
   - 自己决定是否加仓或减仓

4. **自主风险管理**：
   - 自己决定风险承受度
   - 自己决定仓位分配
   - 自己决定何时止损止盈
   - 自己决定如何保护利润

**重要提醒**：
- 没有策略建议
- 没有入场条件指导
- 没有仓位管理建议
- 没有杠杆选择建议
- 只有市场数据
- 只有交易工具
- 双重防护保护（代码自动 + AI主动）
- 完全由你自主决策

**止损止盈策略**：
- 你可以随时主动止损止盈，不必等待代码自动触发
- 代码自动保护是安全网，在你没有主动操作时保护你
- 建议：看到不利信号时主动止损，看到获利机会时主动止盈
- 不要过度依赖自动保护，主动管理风险才是优秀交易员的标志

**交易成本提醒**：
- 开仓手续费：约 0.05%
- 平仓手续费：约 0.05%
- 往返交易成本：约 0.1%
- 资金费率：根据市场情况变化（每8小时收取一次）

**双向交易机会**：
- 做多（long）：预期价格上涨时开多单
- 做空（short）：预期价格下跌时开空单
- 永续合约做空无需借币，只需关注资金费率

**执行周期**：
- 当前执行周期：每 ${context.intervalMinutes} 分钟执行一次
- 你可以在每个周期做出新的决策
- 你可以持有仓位跨越多个周期

**开始交易**：
现在，请基于下方提供的市场数据和账户信息，完全自主地分析市场并做出交易决策。
记住：没有任何建议和限制（除了系统硬性风控底线），一切由你自主决定。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

