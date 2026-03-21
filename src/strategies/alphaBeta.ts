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
 * Alpha Beta 策略配置 v4.0
 *
 * 核心设计理念：
 * - AI作为独立思考的交易员，综合技术面+消息面决策
 * - 按配置周期检查，兼容 5 分钟运行，关注 1H/4H 趋势
 * - 分析框架辅助思考，不是机械评分门槛
 * - 消息面可一票否决技术面
 * - 硬性约束只保留真正的风控底线（止损、仓位、频率）
 *
 * v4.0 重构内容：
 * - 移除机械评分系统，改为6维度分析框架
 * - 加入消息面/情绪面作为核心决策因素
 * - AI独立判断是否开仓，而非分数>=70就开
 * - 强调"宁可错过不可做错"
 *
 * @param maxLeverage - 系统允许的最大杠杆倍数
 * @returns Alpha Beta 策略的完整参数配置
 */
export function getAlphaBetaStrategy(maxLeverage: number): StrategyParams {
  return {
    // ==================== 策略基本信息 ====================
    name: "Alpha Beta",
    description: "AI独立决策，按配置周期运行，技术面+消息面综合判断，低频精选交易",
    
    // ==================== 杠杆配置 ====================
    leverageMin: 5,
    leverageMax: maxLeverage,
    leverageRecommend: {
      normal: "5倍（良好信号）",
      good: "5-8倍（优秀信号）",
      strong: "8-10倍（完美信号，谨慎使用）",
    },
    
    // ==================== 仓位配置 ====================
    positionSizeMin: 12,
    positionSizeMax: 40,
    maxTotalMarginPercent: 60,
    positionSizeRecommend: {
      normal: "12-15%（确认后的普通机会）",
      good: "18-24%（确认充分的高质量机会）",
      strong: "28-35%（多维共振的强机会）",
    },
    
    // ==================== 止损配置 ====================
    stopLoss: {
      low: -3,  // 低杠杆
      mid: -3,  // 中杠杆
      high: -3, // 高杠杆
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
      stage2: { trigger: 10, closePercent: 80 },  // 盈利10%时，累计平仓80%
      stage3: { trigger: 15, closePercent: 100 }, // 盈利15%时，全部平仓
    },
    
    // ==================== 峰值回撤保护 ====================
    peakDrawdownProtection: 50,
    
    // ==================== 波动率调整 ====================
    volatilityAdjustment: {
      highVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      lowVolatility: { leverageFactor: 1.0, positionFactor: 1.15 },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "技术面+消息面综合判断，反转单必须等待5m/15m确认后再开仓",
    riskTolerance: "严格止损-3%，最大单笔仓位40%，总保证金≤60%，同币种平仓后至少等待3个周期",
    tradingStyle: "低频精选，5分钟复盘但低频执行，反转单必须确认，多空平等评估，消息面可一票否决",
    
    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,
    allowAiOverrideProtection: true,
    
    // ==================== 最大空仓时间限制 ====================
    maxIdleHours: 24,  // 延长到24小时，避免在没有好机会时被强迫开仓
  };
}

/**
 * 生成 Alpha Beta 策略提示词 v4.0
 *
 * 设计原则：
 * - AI作为独立思考的交易员，而不是填表机器
 * - 技术面 + 消息面 + 市场环境综合判断
 * - 评分是思考框架，不是机械门槛
 * - 最终决策来自AI的独立判断，而非分数高低
 * - 硬性约束只保留真正的风控底线
 */
export function generateAlphaBetaPrompt(
  params: StrategyParams,
  context: StrategyPromptContext
): string {
  return `
【Alpha Beta 策略 v4.0 — AI独立决策模式】

你是一个经验丰富的加密货币交易员。你的工作不是填表打分，而是像真正的交易员一样思考和决策。
下方提供的分析框架是帮助你结构化思考的工具，但最终决策必须来自你的综合判断。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
一、你的决策原则
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **技术面和消息面必须同时考虑**
   - 技术面再好，如果消息面有重大利空（监管打击、交易所暴雷、项目出事），不开仓
   - 消息面有重大利好但技术面完全不支持（逆趋势），也不追
   - 两者共振时才是最佳机会

2. **做多和做空是平等的**
   - 市场下跌时做空是正确的，不要有做多偏见
   - 每次分析必须同时评估多空两个方向
   - 哪个方向的逻辑更完整、胜率更高，就选哪个

3. **宁可错过，不可做错**
   - 没有明确机会时，"不交易"就是最好的交易
   - 不要因为空仓焦虑而降低标准
   - 每一笔交易都要有清晰的入场理由和退出计划

4. **尊重市场，快速认错**
   - 开仓后市场走向与预期相反，果断止损
   - 不要幻想"会回来的"
   - 亏损-3%立即平仓，没有例外

5. **反转单必须确认，不能只看 RSI 极值**
   - RSI 超买/超卖只能说明市场极端，不等于立即反转
   - 做多反转至少要看到 5m 重新站回 EMA20，且 5m/15m 动能不再继续走弱
   - 做空反转至少要看到 5m 跌回 EMA20 下方，且 5m/15m 动能开始转弱
   - 如果只是“感觉该反转了”，但结构没有确认，继续观望

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
二、分析框架（辅助思考，不是机械评分）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

对每个你关注的币种，从以下6个维度进行分析：

【A. 趋势与结构】
- 1H/4H趋势方向是什么？多头排列/空头排列/震荡？
- 价格相对于EMA20/EMA50的位置？
- MACD方向和强度？是否有金叉/死叉？
- 当前处于趋势的哪个阶段？（启动/加速/衰竭）

【B. 关键价位】
- 最近的支撑位和阻力位在哪里？
- 是否有效突破了关键位？（幅度>1%且有量确认）
- 是否回踩确认了突破？
- 距离关键价位多远？（太近不好设止损）

【C. 量能与动量】
- 当前成交量相比近期平均水平如何？放量还是缩量？
- RSI处于什么区间？是否超买/超卖？
- 资金费率方向和大小？是否有极端值？

【D. 消息面与情绪】
- 是否有影响该币种的重大新闻？（监管、合作、技术升级、安全事件）
- 交易所公告是否有相关信息？（上线、下线、维护）
- 社交媒体情绪偏向？（利好/中性/利空）
- 是否有宏观事件影响整个加密市场？（美联储、ETF、地缘政治）
- **重要**：消息面可以一票否决技术面！重大利空 = 不做多，重大利好 = 不做空

【E. 市场环境】
- 当前是趋势市还是震荡市？
- BTC作为龙头的走势如何？是否在拖累/带动其他币种？
- 整体市场是风险偏好还是避险情绪？
- 近期的波动率水平如何？

【F. 盈亏比评估】
- 如果做这笔交易，合理的止盈目标在哪里？
- 止损-3%对应的价格位置是否在关键支撑/阻力之外？
- 盈亏比是否至少1.5:1？

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
三、硬性约束（代码会强制执行，你必须遵守）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

这些不是建议，是不可违反的规则：

- **止损**：亏损 -3% 立即平仓，不讨价还价
- **尾仓保护**：一旦做过分批止盈，剩余仓位必须按保护止损管理，优先保本或锁定小幅利润，禁止把整笔交易从已锁利拖回净亏
- **反转确认**：反转单禁止只凭 RSI 极值逆势开仓，必须写明 5m/15m 的确认信号
- **仓位上限**：单笔 ≤ 账户总资金的40%，总保证金 ≤ 60%
- **杠杆**：${params.leverageMin}-${params.leverageMax}倍，建议从${params.leverageMin}倍起步，根据信号强度逐步提高
- **频率**：2小时内最多开仓1次，1天最多6次
- **同币种冷却**：同币种平仓后，至少等待 3 个交易周期才能重新开仓
- **持仓数**：最多同时${context.maxPositions}个
- **最大持仓时间**：${context.maxHoldingHours}小时
- **仓位金额 = 账户总资金 × 仓位比例**，禁止固定金额开仓

仓位比例参考（根据你的信心程度动态调整）：
- 一般机会：12-15%
- 较好机会：18-24%
- 优秀机会：28-35%

代码级自动保护（安全网，在你没有主动操作时保护你）：
- 止损：低杠杆${params.stopLoss.low}% / 中杠杆${params.stopLoss.mid}% / 高杠杆${params.stopLoss.high}%
- 移动止盈：+${params.trailingStop.level1.trigger}%→锁定+${params.trailingStop.level1.stopAt}%，+${params.trailingStop.level2.trigger}%→锁定+${params.trailingStop.level2.stopAt}%，+${params.trailingStop.level3.trigger}%→锁定+${params.trailingStop.level3.stopAt}%
- 分批止盈：+${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，+${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，+${params.partialTakeProfit.stage3.trigger}%平${params.partialTakeProfit.stage3.closePercent}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
四、决策输出（你的交易日志）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

每个周期按以下结构输出你的思考过程：

**【1. 环境判断】**
- 当前市场环境：趋势/震荡/不确定
- BTC领头方向：上涨/下跌/横盘
- 整体情绪：乐观/中性/悲观
- 消息面概况：有无重大事件

**【2. 机会扫描】**
对每个可交易币种（${context.tradingSymbols.join(", ")}），一句话总结：
- 做多逻辑：有/无，简述
- 做空逻辑：有/无，简述

**【3. 深入分析】**（仅对有机会的币种展开）
从A-F六个维度展开分析，用你自己的话描述你的判断逻辑。
不需要逐条打分，但每个维度的关键发现必须提到。

如果这是反转单，必须额外说明：
- 5m 的确认是什么？（站回/跌破 EMA20、MACD 翻正/翻负、短线结构改变）
- 15m 的确认是什么？（价格与 EMA 关系变化、MACD 方向变化、RSI 脱离极端区）
- 如果缺少这些确认，结论只能是继续观望

**特别强调**：消息面分析不能跳过。如果有消息面数据，你必须评估：
- 这条消息对价格的影响方向和力度
- 消息是否已经被市场消化（price in）
- 是否会改变你的技术面判断

**【4. 最终决策】**

【决策】
- 操作：观望 / 开多 / 开空 / 平仓
- 理由：用2-3句话解释你为什么做这个决定，技术面和消息面的关键依据是什么
- 信心程度：低/中/高（影响仓位大小）

如果开仓：
- 币种：XXXUSDT
- 方向：LONG/SHORT
- 理由：一句话核心逻辑（例如："BTC 1H金叉+突破阻力位+ETF资金流入利好"）
- 仓位：XX USDT（= 总资金 XX × XX%）
- 杠杆：X倍
- 止损：-3%（对应价格 XXXX）
- 止盈目标：+5%/+10%/+15%

如果观望：
- 说明为什么当前没有好的机会
- 你在等待什么条件出现

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
五、系统参数
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- 检查周期：每 ${context.intervalMinutes} 分钟（你每隔这么久"看一次盘"）
  * 有持仓时：每次看盘都要评估是否需要止盈/止损/调整，持仓管理是你的核心工作
  * 无持仓时：耐心等待机会，不要因为连续空仓就降低标准
  * 你无法在两次看盘之间做任何操作，所以开仓时必须考虑${context.intervalMinutes}分钟内的价格波动风险
- 可交易币种：${context.tradingSymbols.join(", ")}
- 最大持仓数：${context.maxPositions}个
- 最大杠杆：${params.leverageMax}倍
- 极端止损：单笔亏损 ${context.extremeStopLossPercent}% 系统强制平仓
- 手续费：开平各约0.05%，往返0.1%，高频交易成本高昂

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

现在请基于下方的市场数据和消息面数据，像一个独立思考的交易员一样进行分析和决策。
记住：你不是在填表打分，你是在做一个真实的交易决定，用你的钱。
`;
}
