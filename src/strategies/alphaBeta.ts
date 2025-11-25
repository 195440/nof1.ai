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
 * Alpha Beta 策略配置 v3.0
 * 
 * 核心设计理念：
 * - 30分钟检查周期，关注1H/4H趋势
 * - 简化评分系统（5维度100分制）
 * - 强制多空平衡（必须检查做空机会）
 * - 严格执行规则（添加违规警告）
 * - 更现实的止盈目标（5%/10%/15%）
 * 
 * v3.0 修复内容：
 * - 简化评分系统：7维度→5维度，110分→100分
 * - 强化做空要求：强制每周期检查做空机会
 * - 添加交易频率限制：2小时内最多1次开仓
 * - 调整止盈目标：10%/18%/30%→5%/10%/15%
 * - 添加历史警告：提醒AI过去的严重问题
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数
 * @returns Alpha Beta 策略的完整参数配置
 */
export function getAlphaBetaStrategy(maxLeverage: number): StrategyParams {
  return {
    // ==================== 策略基本信息 ====================
    name: "Alpha Beta",
    description: "低频交易，30分钟检查，关注1H/4H趋势，简化评分系统",
    
    // ==================== 杠杆配置 ====================
    leverageMin: 1,
    leverageMax: maxLeverage,
    leverageRecommend: {
      normal: "2倍（良好信号）",
      good: "2-3倍（优秀信号）",
      strong: "3倍（完美信号，谨慎使用）",
    },
    
    // ==================== 仓位配置 ====================
    positionSizeMin: 1,
    positionSizeMax: 30,  // 降低单笔最大仓位到30%
    maxTotalMarginPercent: 50,
    positionSizeRecommend: {
      normal: "8-10%（良好信号，70-80分）",
      good: "10-15%（优秀信号，80-90分）",
      strong: "15-20%（完美信号，90-100分）",
    },
    
    // ==================== 止损配置 ====================
    stopLoss: {
      low: -5,    // 低杠杆（1-5倍）
      mid: -4,    // 中杠杆（6-10倍）
      high: -3.5, // 高杠杆（11倍以上）
    },
    
    // ==================== 移动止盈配置（更现实的目标）====================
    trailingStop: {
      level1: { trigger: 3, stopAt: 1 },     // 盈利3%时，止损移至+1%
      level2: { trigger: 6, stopAt: 3 },     // 盈利6%时，止损移至+3%
      level3: { trigger: 10, stopAt: 6 },    // 盈利10%时，止损移至+6%
    },
    
    // ==================== 分批止盈配置（更现实的目标）====================
    partialTakeProfit: {
      stage1: { trigger: 5, closePercent: 50 },   // 盈利5%时，平仓50%
      stage2: { trigger: 10, closePercent: 30 },  // 盈利10%时，平仓30%
      stage3: { trigger: 15, closePercent: 20 },  // 盈利15%时，平仓剩余20%
    },
    
    // ==================== 峰值回撤保护 ====================
    peakDrawdownProtection: 50,
    
    // ==================== 波动率调整 ====================
    volatilityAdjustment: {
      highVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      lowVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "信号评分≥70分才能开仓，必须确认1H趋势方向",
    riskTolerance: "严格止损-3%，最大单笔仓位30%",
    tradingStyle: "低频交易，2小时内最多开仓1次，必须检查做空机会",
    
    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,
    allowAiOverrideProtection: true,
    
    // ==================== 最大空仓时间限制 ====================
    maxIdleHours: 8,  // 延长到8小时，减少被迫开仓
  };
}

/**
 * 生成 Alpha Beta 策略提示词 v3.0
 * 
 * 设计原则：
 * - 简化评分系统，易于执行
 * - 强制做空检查，防止做多偏见
 * - 添加历史警告，提醒过去问题
 * - 精简内容，突出核心规则
 */
export function generateAlphaBetaPrompt(
  params: StrategyParams, 
  context: StrategyPromptContext
): string {
  return `
=== 历史表现警告 ===
你在过去的交易中表现极差，以下问题必须立即改正：
- 胜率仅 26%（严重低于合格线40%）
- 做空比例仅 2%（97%做多，严重偏见）
- 过度交易（大量持仓<30分钟）
- 未执行评分系统（只看RSI就开仓）
- 未执行动态仓位（使用固定仓位）

本次必须改正：
1. 必须完整执行5维度评分，评分<70分禁止开仓
2. 必须检查做空机会，不能只想着做多
3. 必须按公式计算仓位：账户总资金 * 仓位比例
4. 最小持仓时间2小时，不要因小波动平仓
5. 2小时内最多开仓1次，禁止频繁交易
========================

【Alpha Beta 策略 v3.0 - 核心规则】

** 5条铁律（违反任何一条都是错误决策）**
1. 评分>=70分才能开仓（震荡市>=75分）
2. 必须确认1H趋势方向与交易方向一致
3. 仓位=账户总资金*仓位比例（禁止固定仓位）
4. 止损-3%（触及立即执行，不犹豫）
5. 每周期必须同时检查做多和做空机会

---
【一、简化评分系统（100分制）】
---

开仓条件：总分>=70分（震荡市>=75分）

评分标准（5个维度，必须逐一评分）：

(1) 趋势确认（35分）- 最重要
  - 1H趋势明确且与交易方向一致：35分
  - 1H趋势明确但4H震荡：25分
  - 1H震荡但4H趋势明确：15分
  - 无明确趋势：0分
  
  判断标准：
  - 做多：价格 > EMA20 > EMA50，MACD > 0
  - 做空：价格 < EMA20 < EMA50，MACD < 0
  - 震荡：价格在EMA20上下穿梭，MACD接近0

(2) 技术指标（25分）
  - MACD方向 + RSI区间 + EMA排列全部支持：25分
  - 两项支持：15分
  - 一项支持：8分
  - 不支持：0分

(3) 突破/回踩确认（20分）
  - 有效突破关键位（幅度>1%+收盘确认）：20分
  - 回踩支撑/阻力位不破：15分
  - 接近关键位但未确认：8分
  - 无突破/回踩信号：0分

(4) 成交量确认（10分）
  - 成交量 > 平均值150%：10分
  - 成交量 > 平均值100%：6分
  - 成交量正常：3分
  - 成交量萎缩：0分

(5) 风险回报比（10分）
  - 盈亏比 >= 2:1：10分
  - 盈亏比 1.5-2:1：6分
  - 盈亏比 1-1.5:1：3分
  - 盈亏比 < 1:1：0分

评分输出格式（必须严格按此格式）：

【信号评分】币种：XXXUSDT 方向：LONG/SHORT
1. 趋势确认：XX/35分（1H趋势状态 + 4H趋势状态）
2. 技术指标：XX/25分（MACD方向 + RSI值 + EMA排列）
3. 突破确认：XX/20分（是否突破/回踩关键位）
4. 成交量：XX/10分（当前量/平均量 = XX%）
5. 风险回报：XX/10分（目标+X% / 止损-3% = X:1）
---
总分：XX/100分
结论：[满足开仓条件] / [不满足，继续观望]

---
【二、强制多空检查】
---

** 每个周期必须同时评估做多和做空机会！**

做多条件：
- 价格 > EMA20 > EMA50（多头排列）
- MACD > 0 或刚金叉
- 突破阻力位或回踩支撑位不破

做空条件：
- 价格 < EMA20 < EMA50（空头排列）
- MACD < 0 或刚死叉
- 跌破支撑位或反弹阻力位受阻

必须输出多空机会检查表：

【多空机会检查】

BTCUSDT:
- 做多条件：[Y/N] 原因
- 做空条件：[Y/N] 原因

ETHUSDT:
- 做多条件：[Y/N] 原因
- 做空条件：[Y/N] 原因

最佳机会：XXX

** 如果只分析做多而忽略做空，视为违规决策！**

---
【三、仓位计算（必须动态计算）】
---

** 禁止使用固定仓位！必须按公式计算！**

公式：仓位金额 = 账户总资金 * 仓位比例

仓位比例：
- 90-100分（完美信号）：15-20%
- 80-90分（优秀信号）：10-15%
- 70-80分（良好信号）：8-10%
- <70分：禁止开仓

杠杆选择：
- 良好信号：2倍
- 优秀信号：2-3倍
- 完美信号：3倍（谨慎）

仓位计算输出格式（必须）：

【仓位计算】
账户总资金：XXX USDT
信号评分：XX分 -> 仓位比例：XX%
仓位金额：XXX * XX% = XX USDT
杠杆选择：X倍
最终开仓金额：XX USDT

---
【四、持仓管理】
---

止损规则（铁律）：
- 主动止损：亏损达到 -3% 立即平仓
- 代码止损：${params.stopLoss.low}%/${params.stopLoss.mid}%/${params.stopLoss.high}%（安全网）
- 不犹豫、不幻想、不移动止损位

止盈规则（分批获利）：
- 第一目标 +5%：平仓50%，止损移至保本
- 第二目标 +10%：平仓30%，止损移至+5%
- 第三目标 +15%：平仓剩余20%

持仓时间：
- 最小持仓：2小时（除非触发止损止盈）
- 最大持仓：${context.maxHoldingHours}小时
- 禁止因<3%的波动在2小时内平仓

---
【五、交易频率限制】
---

** 2小时内最多开仓1次！**

开仓前必须检查：
- 上次开仓时间：XX:XX
- 距今：X小时X分钟
- 是否满足2小时限制：[Y/N]

违规判定：
- 2小时内开仓2次 = 违规
- 1天内开仓超过6次 = 过度交易

---
【六、决策输出格式】
---

每个周期必须按以下步骤输出：

步骤1：历史数据检查
【历史检查】
- 最近10笔胜率：XX%
- 做多/做空比例：XX/XX
- 上次开仓时间：XX:XX（距今X小时）
- 当前持仓：有/无

步骤2：多空机会检查
（按【多空机会检查】格式输出）

步骤3：信号评分（如果有机会）
（按【信号评分】格式输出）

步骤4：决策执行

【决策】
- 操作：观望 / 开多 / 开空 / 平仓
- 理由：（一句话说明）

如果开仓：
- 币种：XXXUSDT
- 方向：LONG/SHORT
- 仓位：XX USDT（账户XX * XX%）
- 杠杆：X倍
- 止损：-3%
- 目标：+5%/+10%/+15%

---
【七、系统参数】
---

- 检查周期：${context.intervalMinutes}分钟
- 可交易币种：${context.tradingSymbols.join(", ")}
- 最大持仓数：${context.maxPositions}个
- 最大杠杆：${params.leverageMax}倍（建议2-3倍）
- 最大空仓时间：8小时

代码级自动保护：
- 止损：低杠杆${params.stopLoss.low}%/中杠杆${params.stopLoss.mid}%/高杠杆${params.stopLoss.high}%
- 止盈：+${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，+${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，+${params.partialTakeProfit.stage3.trigger}%平${params.partialTakeProfit.stage3.closePercent}%

---
【开始分析】
---

执行清单：
[ ] 1. 检查历史数据（胜率、多空比例、上次开仓时间）
[ ] 2. 检查每个币种的做多和做空机会
[ ] 3. 对最佳机会进行5维度评分
[ ] 4. 按公式计算仓位
[ ] 5. 输出最终决策

** 提醒：你过去做空比例只有2%，本次必须认真检查做空机会！**

现在基于下方的市场数据进行分析和决策。
`;
}
