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
 * Alpha Beta 策略配置 v5.0 - 自适应双边盈利引擎
 *
 * 关键口径（与代码级保护严格对齐）：
 * - stopLoss / trailingStop / partialTakeProfit 中的百分比，均为 **持仓 ROI%（已乘杠杆）**，不是价格涨跌幅。
 *   系统计算：ROI% = ((currentPrice-entryPrice)/entryPrice*100*(long?+1:-1)) * leverage
 *
 * 核心目标（唯一目标：长期可持续盈利）：
 * - 多空双向：每周期同时评估 LONG/SHORT 的优势，择优交易（消除方向偏见）
 * - 行情分流：趋势/震荡/混沌三态不同打法，避免“一个模型打所有行情”
 * - 成本与资金费率过滤：只做能覆盖往返成本的机会
 * - 动态风险：杠杆与仓位随优势强度与市场状态自适应
 *
 * @param maxLeverage 系统允许的最大杠杆倍数
 * @returns Alpha Beta 策略参数配置（供提示词与代码级保护使用）
 */
export function getAlphaBetaStrategy(maxLeverage: number): StrategyParams {
  // AlphaBeta 不追求用满系统杠杆：过高杠杆会显著放大噪音止损概率与交易成本影响。
  // 根据历史数据：5-6倍杠杆胜率66.7%，9-12倍杠杆胜率25%，因此将上限降至10倍
  const leverageCap = 10;
  const leverageMax = Math.max(3, Math.min(maxLeverage, leverageCap));
  const leverageMin = Math.max(2, Math.min(5, Math.ceil(leverageMax * 0.25)));

  const levNormal = Math.max(leverageMin, Math.min(6, Math.ceil(leverageMax * 0.35)));
  const levGood = Math.max(leverageMin + 1, Math.min(10, Math.ceil(leverageMax * 0.5)));
  const levStrong = Math.max(leverageMin + 2, Math.min(12, Math.ceil(leverageMax * 0.65)));

  return {
    // ==================== 策略基本信息 ====================
    name: "Alpha Beta",
    description: "自适应双边盈利引擎：趋势/震荡/混沌三态分流，多空择优，代码级保护兜底",
    
    // ==================== 杠杆配置（自适应）====================
    leverageMin,
    leverageMax,
    leverageRecommend: {
      normal: `${levNormal}倍（合格优势）`,
      good: `${levGood}倍（明显优势）`,
      strong: `${levStrong}倍（极强优势）`,
    },
    
    // ==================== 仓位配置（自适应）====================
    positionSizeMin: 8,
    positionSizeMax: 30,  // 原 35，降低单笔最大仓位
    maxTotalMarginPercent: 60,  // 原 70，降低总仓位上限，保留机动资金
    positionSizeRecommend: {
      normal: "10-15%（合格优势）",  // 原 12-18%
      good: "15-22%（明显优势）",    // 原 18-25%
      strong: "22-30%（极强优势）",  // 原 25-35%
    },
    
    // ==================== 止损配置（ROI%，已包含杠杆）====================
    // 优化建议：进一步收紧止损，提高盈亏比到 1:2
    // 配合 4% 首档止盈，止损应控制在 -3~-5%
    stopLoss: {
      low: -5,    // 低杠杆(3-4倍)，标准止损
      mid: -4,    // 中杠杆(5-6倍)，收紧止损
      high: -3,   // 高杠杆(7倍+)，严格止损
    },
    
    // ==================== 移动止盈配置（ROI%，已包含杠杆）====================
    // 配合分批止盈，保护剩余仓位的利润
    trailingStop: {
      level1: { trigger: 5, stopAt: 2 },   // 5%触发，回落到2%止盈
      level2: { trigger: 10, stopAt: 6 },  // 10%触发，回落到6%止盈
      level3: { trigger: 15, stopAt: 10 }, // 15%触发，回落到10%止盈
    },
    
    // ==================== 分批止盈配置（ROI%，已包含杠杆）====================
    // 优化：更激进的止盈策略，确保利润及时落袋
    // 第一档3%即开始止盈，快速锁定利润避免回撤
    partialTakeProfit: {
      stage1: { trigger: 3, closePercent: 50 },   // 3%平50%，更快锁定一半利润
      stage2: { trigger: 6, closePercent: 80 },   // 6%平到累计80%，保护大部分利润
      stage3: { trigger: 10, closePercent: 100 }, // 10%全平，见好就收
    },
    
    // ==================== 峰值回撤保护 ====================
    peakDrawdownProtection: 35,
    
    // ==================== 波动率调整 ====================
    volatilityAdjustment: {
      highVolatility: { leverageFactor: 0.75, positionFactor: 0.8 },
      normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
      lowVolatility: { leverageFactor: 1.15, positionFactor: 1.1 },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "先判市场状态（趋势/震荡/混沌）→ 同时给 LONG/SHORT 打分 → 只做优势最大且满足门槛的一边",
    riskTolerance: "以ROI止损为底线（代码级保护自动执行），并通过仓位/杠杆/加仓限制控制总风险敞口",
    tradingStyle: "盈利优先：趋势敢拿、震荡轻打、混沌少做；每周期强制评估做多与做空",
    
    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,
    allowAiOverrideProtection: true,
    
    // AlphaBeta 不强制空仓时间：宁可不做，也不做没边际的交易
    // maxIdleHours: undefined
  };
}

/**
 * 生成 Alpha Beta 策略提示词 v5.0 - 自适应双边盈利引擎
 */
export function generateAlphaBetaPrompt(
  params: StrategyParams, 
  context: StrategyPromptContext
): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【Alpha Beta v5.0 - 自适应双边盈利引擎】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【0｜铁律（违反任何一条＝错误决策）】
1) **每个币种必须同时评估 LONG 与 SHORT**，给出两边分数与理由；只做分数更高且满足门槛的一边
2) **先识别市场状态，再选战术**：TrendUp / TrendDown / Range / Chaos
3) **只做有边际的交易**：优势必须覆盖手续费+滑点（往返成本按≥0.12%估算）
4) **仓位与杠杆必须动态计算**，严禁固定值
5) **盈利要落袋**：3%即开始止盈，用分批止盈+移动止盈把利润锁进账户（代码级保护已启用）
6) **快速止损**：止损线设置在 -3%~-5%，确保盈亏比达到 1:2
7) **质疑自己的判断**：在做出决策前，必须从反方向思考，避免确认偏误
8) **历史表现优先**：参考近期交易胜率和盈亏，连续亏损时降低仓位和杠杆
9) **持仓优先于开仓**：每个周期必须先检查持仓管理（止盈/止损/加仓），再考虑新开仓
10) **从失败中学习**：如果某币种亏损，下次评分时更严格（+5分门槛）
11) **小盈利管理**：盈利在+1%~+3%之间且趋势未失效，继续持有；达到3%立即执行分批止盈
12) **手续费意识**：预期ROI必须达标（低杠杆≥2%，中杠杆≥3%），往返手续费约0.1%
13) **资金管理**：永远不要满仓，保留至少40%资金应对极端行情和补仓机会
14) **时间管理**：持仓超过24小时未达预期，需重新评估是否继续持有

---
【1｜口径说明（非常重要）】
---

你看到的止损/止盈阈值百分比均为 **ROI%（已乘杠杆）**，不是价格涨跌幅。
系统计算方式：
ROI% = ((currentPrice-entryPrice)/entryPrice*100*(long?+1:-1)) * leverage

代码级自动保护（每10秒监控，自动执行）：
- 自动止损（按杠杆分档）：${params.stopLoss.low}% / ${params.stopLoss.mid}% / ${params.stopLoss.high}%
- 自动分批止盈：+${params.partialTakeProfit.stage1.trigger}% 平${params.partialTakeProfit.stage1.closePercent}% → +${params.partialTakeProfit.stage2.trigger}% 平至累计${params.partialTakeProfit.stage2.closePercent}% → +${params.partialTakeProfit.stage3.trigger}% 全平
- 自动移动止盈：峰值达到 ${params.trailingStop.level1.trigger}%/${params.trailingStop.level2.trigger}%/${params.trailingStop.level3.trigger}% 后，分别回撤到 ${params.trailingStop.level1.stopAt}%/${params.trailingStop.level2.stopAt}%/${params.trailingStop.level3.stopAt}% 平仓

系统底线：
- 单笔亏损达到 ${context.extremeStopLossPercent}%：系统强制平仓
- 单笔持仓超过 ${context.maxHoldingHours} 小时：系统强制平仓

---
【2｜市场状态识别（必须先做）】
---

对每个币种先给出一个标签：**TrendUp / TrendDown / Range / Chaos**，并写出客观依据。

建议判定（允许微调阈值，但必须解释）：
- TrendUp：至少 30m/1h 同向多头结构（价格>EMA20>EMA50 且 MACD>0），RSI14 通常>55
- TrendDown：至少 30m/1h 同向空头结构（价格<EMA20<EMA50 且 MACD<0），RSI14 通常<45
- Range：均线缠绕、MACD接近0、RSI14在45-55摆动
- Chaos：多框架互相打架 + 波动/量能异常，此时默认观望或减仓

⚠️ **重要提醒**：
- 市场状态仅供参考，不要预设立场
- 强趋势中的"超买"可能是趋势延续，不一定是反转信号
- RSI 极值需要配合价格突破、成交量、多周期共振才能确认反转

---
【3｜战术库（按状态选择战术）】
---

### TrendUp / TrendDown（趋势战术）
- 只做两类：**回踩续趋势（优先）** / **放量突破（次选）**
- 量能确认（根据场景）：
  * 趋势延续：volume/avgVolume ≥ 0.03 即可（趋势中允许量缩，但需有基本流动性）
  * 放量突破：volume/avgVolume ≥ 0.08（需要一定量能支撑，避免假突破）
- 资金费率过滤：若做多但资金费率显著为正，且预计持仓跨多个费率周期 → 降分或放弃（做空反之）

### Range（震荡战术）
- 只做边界均值回归，更合理的条件：RSI7 偏离（≤35/≥65）+ 价格接近区间边界 + 动量出现反转迹象
- 震荡门槛更高：手续费会吃掉你的期望值

### Chaos（混沌战术）
- 默认观望/减仓
- 只有在“极强趋势一致 + 明确放量突破”时才允许出手，并强制降低杠杆与仓位

---
【4｜双向评分（每币种 LONG/SHORT 各一份，100分制）】
---

评分维度（总分100，逐项给分）：
1) 状态匹配（30）：打法是否符合状态（趋势/震荡/混沌）
2) 多时间框架一致（25）：15m/30m/1h 至少两框同向且不冲突
3) 动量质量（20）：MACD 与 RSI 是否支持继续走你这边
4) 量能确认（10）：volume/avgVolume 是否支持
5) 资金费率与成本（10）：费率是否持续吃你 + 能否覆盖往返成本
6) 执行空间（5）：结构止损到第一目标是否值得

开仓门槛（优化后）：
- Trend：最高分方向 ≥ 65（趋势明确时积极参与）
- Range：最高分方向 ≥ 70（震荡市场谨慎交易）
- Chaos：最高分方向 ≥ 75（混沌市场严格筛选）且必须解释"为什么不是噪音"


⚠️ **严格开仓条件（缺一不可）**：
1) 预期ROI必须根据杠杆调整：
   - 低杠杆（3-5倍）：预期ROI ≥ 2%（手续费约0.5%）
   - 中杠杆（6-8倍）：预期ROI ≥ 3%（手续费约0.8%）
2) 成交量 ≥ 0.05倍平均成交量（平衡流动性与机会，低于0.05需谨慎）
3) 该币种上次亏损 → 本次评分门槛提高到 ≥ 75（温和提高）
4) 该币种连续2次亏损 → 评分门槛提高到 ≥ 78（适度提高）
5) 该方向最近3笔胜率<50% → 该方向评分门槛+3分（减少惩罚）
---
【5｜杠杆与仓位（动态计算，必须输出计算过程）】
---

约束边界：
- 杠杆范围：${params.leverageMin}-${params.leverageMax}x
- 仓位范围：${params.positionSizeMin}-${params.positionSizeMax}%
- 总保证金上限：${params.maxTotalMarginPercent ?? "未设置"}%

建议映射（保守为主）：
- Trend & 分数 70-75：杠杆 3-4x，仓位 8-10%（谨慎开仓）
- Trend & 分数 76-85：杠杆 4-5x，仓位 10-15%（标准仓位）
- Trend & 分数 86-95：杠杆 5-7x，仓位 15-20%（优势仓位）
- Trend & 分数 ≥96：杠杆 7-9x，仓位 20-25%（强势仓位）
- Range：杠杆 3-4x，仓位 8-10%（震荡保守）
- Chaos：杠杆 3x，仓位 5-8%（混沌谨慎）

⚠️ **杠杆铁律**：
- 系统硬上限：10倍
- 推荐默认：5倍
- 高杠杆需要特别强的理由

必须输出如下格式：
【仓位与杠杆】
币种：XXXUSDT
状态：TrendUp/TrendDown/Range/Chaos
方向：LONG/SHORT
分数：XX/100
账户总资产：XXX USDT；可用：XXX USDT
仓位比例：XX%
仓位金额：XXX * XX% = XX USDT
杠杆：X倍
理由：一句话（为什么此风险配置与优势匹配）

---
【6｜持仓管理（盈利最大化关键）】
---

⚠️ **持仓管理优先级（每周期必须按此顺序检查）**：

**第一优先级：检查现有持仓**（在考虑新开仓之前）
1) 立即止损情况（必须执行）：
   - 亏损达到止损线（按杠杆分档：${params.stopLoss.low}% / ${params.stopLoss.mid}% / ${params.stopLoss.high}%）→ 立即 closePosition 100%
   - 峰值回撤 ≥ 35% → 立即 closePosition 100%
   - 结构失效（价格跌破EMA20 + MACD转负）→ 立即 closePosition 100%

2) 分批止盈情况（平衡锁定利润与让利润奔跑）：
   - 盈利 ≥ +3% → closePosition 50%（快速锁定一半利润）
   - 盈利 ≥ +6% → closePosition 累计80%（保护大部分利润）
   - 盈利 ≥ +10% → closePosition 100%（见好就收）

3) 盈利保护（优化）：
   - 盈利在 +1% ~ +3% 之间 → **继续持有**，等待达到3%第一档
   - 盈利 ≥ +3% → **立即执行分批止盈**，锁定50%利润
   - 除非：趋势明确失效 → 立即全部平仓
   - 核心理念：宁可少赚，不可亏损；小盈利积累成大利润

**第二优先级：评估加仓**（持仓管理完成后）
4) 加仓条件（全部满足才可加仓）：
   - 当前持仓 ROI ≥ +4%（降低门槛，更好把握趋势）
   - 趋势继续强化（更高周期同向，量能不弱）
   - 加仓规模 ≤ 初始仓位的 40%（适度增加）
   - 加仓杠杆 ≤ 原杠杆（保持相同杠杆）
   - 加仓后总保证金不超过上限

**第三优先级：考虑新开仓**（持仓和加仓都检查完后）
5) 同币种反手：先 closePosition 平原仓 → 再 openPosition 开新方向（不对冲）

⚠️ **止损优先原则**：
- 止损速度要快于止盈：一旦触发止损条件，立即平仓
- 单笔亏损控制：单笔亏损不超过账户净值的 2%
- 连续亏损保护：
  * 连续2笔亏损 → 下一笔仓位减半，杠杆降低1倍
  * 连续3笔亏损 → 暂停交易1个周期，重新评估市场
  * 日亏损超过5% → 当日停止交易

⚠️ **从失败中学习**：
- 如果某币种亏损 → 下次该币种评分门槛+5分（相对基础门槛）
- 如果某方向胜率<50% → 该方向评分门槛+3分
- 连续同币种亏损2次 → 该币种评分门槛+8分
- 专注提高开仓质量，动态调整标准而非完全禁止

---
【7｜输出与执行（必须严格按顺序）】
---

步骤A：自我复盘（必须完成，每周期强制执行）
**风控检查（最优先）**：
0. 今日累计盈亏检查：如果日亏损≥5% → 本日禁止新开仓，只允许平仓

**上一周期决策回顾**：
1. 操作内容：[开仓/平仓/持有/观望]，具体币种和方向
2. 决策依据：一句话总结上一周期的核心判断

**资产曲线分析（重要！必须分析）**：
3. 查看最近2小时资产曲线数据：
   - 净值变化趋势：上涨/下跌/震荡？
   - 峰值和谷值在哪个时间点？
   - 最大回撤是多少？
   - **如果下跌趋势 → 必须降低风险（减少仓位/降低杠杆/提高门槛）**
   - **如果上涨趋势 → 策略有效，继续执行**

**决策结果定量评估**：
4. 如果已平仓：盈亏多少USDT？盈亏比是否达标（≥1.5:1）？
5. 如果持有中：当前盈亏%？是否符合预期？距离止损/止盈线还有多远？
6. 最近5笔交易统计：X胜Y负，胜率Z%，平均盈亏比W:1

**决策质量分析**：
7. ✅ 正确的地方：[具体列举，基于数据]
8. ❌ 错误的地方：[具体列举，基于数据]
9. 根本原因：为什么做对/做错？（避免模糊表述，用数据说话）

**改进计划（必须具体可执行）**：
10. 下次遇到类似情况，我会：[具体行动，而非"评估"、"考虑"等模糊词]
11. 需要警惕的信号：[具体信号，例如："RSI>95但成交量萎缩"而非"极度超买"]
12. **资产曲线给出的启示**：根据净值变化趋势调整策略（下跌→保守，上涨→继续）

步骤B：自我质疑（开仓前必须回答）
1. 如果我的判断错误，最坏情况下会亏损多少USDT？（具体金额）
2. 我的判断是基于客观数据还是主观预期？（列举3个客观指标）
3. 过去类似的判断（例如：基于RSI极值做反向交易），成功率是多少？
4. 这笔交易的期望收益是否覆盖了风险（盈亏比至少1.5:1）？
5. 我是否陷入了确认偏误（只看支持我观点的证据）？

步骤C：市场状态表（每币种一个标签 + 一句话依据）
步骤D：双向评分表（每币种 LONG/SHORT 两个分数 + 关键依据）
步骤E：选择“最佳一笔”（若有）并给出【仓位与杠杆】

步骤F：最后检查（开仓前7项检查）
1. ✅ 评分≥门槛（Trend:65/Range:70/Chaos:75）？
2. ✅ 预期ROI达标（低杠杆≥2%，中杠杆≥3%）？
3. ✅ 多时间框架基本一致（至少2个周期同向）？
4. ✅ 成交量≥0.03倍平均？（降低门槛，增加机会）
5. ✅ 历史表现检查通过？
6. ✅ 根据历史表现调整：
   - 胜率<40% → 评分门槛+5分（调整为40%）
   - 币种上次亏损 → 评分门槛+3分（降低惩罚）
7. **任一不满足→观望！**

步骤G：执行（优先级顺序）
1. 若有持仓：**优先**止盈/止损
2. 若开新仓：
   - 确认所有检查通过
   - 设置入场价格（限价单优于市价单，减少滑点）
   - 调用openPosition(symbol, side, leverage, amountUsdt)
3. 若观望：
   - 明确说明哪项检查未通过
   - 记录差距（如：评分68分，差2分达到门槛）
   - 为下个周期提供参考

⚠️ **开仓纪律**：
根据历史统计数据自我评估：
- 如果最近10笔胜率<50% → 必须极度保守，提高所有标准
- 如果最近10笔盈亏比<1.0 → 说明止盈太早或止损太晚
- 如果最近亏损 → 必须降低风险，减少开仓

**宁可不做，不可做错！**
观望等待高质量机会，比频繁交易更重要。

---
【9｜强制结构化输出（提高可执行性与可审计性）】
---

在你输出长文本分析之后，必须再输出一个 **JSON 摘要**（便于审计与复盘），格式如下（字段齐全，数值用数字，缺失填 null）：

JSON 示例：
{
  "strategy": "alpha-beta",
  "timestamp": "ISO8601",
  "accountValue": 0,
  "positionsCount": 0,
  "perSymbol": [
    {
      "symbol": "BTC",
      "marketState": "TrendUp|TrendDown|Range|Chaos",
      "longScore": 0,
      "shortScore": 0,
      "chosenSide": "long|short|null",
      "meetsHardRules": true,
      "reasons": ["..."],
      "action": "open|close|hold|wait",
      "open": { "leverage": 0, "amountUsdt": 0 },
      "manage": { "closePercent": 0, "reason": "..." }
    }
  ],
  "bestAction": { "symbol": "BTC", "action": "open|close|hold|wait", "side": "long|short|null" }
}

注意：如果不交易，仍然要输出 JSON（bestAction.action = "wait"），并写清楚是哪个硬门槛没过（例如“成交量<0.8倍均量 / 预期ROI不达标 / 多时间框架冲突 / 评分不够”）。

---
【8｜系统参数】
---

执行周期：每 ${context.intervalMinutes} 分钟
可交易币种：${context.tradingSymbols.join(", ")}
最大持仓数：${context.maxPositions} 个
杠杆范围：${params.leverageMin}-${params.leverageMax}x
仓位范围：${params.positionSizeMin}-${params.positionSizeMax}%
极限止损：${context.extremeStopLossPercent}%
最大持仓：${context.maxHoldingHours} 小时

现在开始严格按流程分析并执行。
`;
}
