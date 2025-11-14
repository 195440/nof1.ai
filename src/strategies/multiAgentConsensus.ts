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
 * 陪审团策略配置（法官与陪审团合议决策模式）
 * 
 * 策略特点：
 * - 风险等级：中等风险
 * - 杠杆范围：55%-80% 最大杠杆（如最大25倍，则使用14-20倍）
 * - 仓位大小：20-30%
 * - 适用人群：追求稳健决策的投资者
 * - 目标月回报：35-50%
 * - 交易频率：积极寻找机会，陪审团达成共识后立即执行
 * 
 * 核心策略：
 * - 法官（主Agent）：有独立分析和判断能力，做出最终决策
 * - 陪审团（三个子Agent）：技术分析、趋势分析、风险评估
 * - 合议决策：法官先独立分析，倾听陪审团意见，综合权衡后做出判决
 * - 不是简单投票，而是权衡各方意见的说服力
 * - 风控方式：双重防护（enableCodeLevelProtection = true + allowAiOverrideProtection = true）
 *   - 代码级自动止损：每10秒监控，触发阈值自动平仓（安全网）
 *   - AI主动决策：法官可以在代码级保护之前主动止盈止损（灵活性）
 * 
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 陪审团策略的完整参数配置
 */
export function getMultiAgentConsensusStrategy(maxLeverage: number): StrategyParams {
  // 计算策略的杠杆范围：使用 55%-80% 的最大杠杆
  const levMin = Math.max(2, Math.ceil(maxLeverage * 0.55));  // 最小杠杆：55%最大杠杆，至少2倍
  const levMax = Math.max(3, Math.ceil(maxLeverage * 0.80));  // 最大杠杆：80%最大杠杆，至少3倍
  
  // 计算不同信号强度下推荐的杠杆倍数
  const levNormal = levMin;  // 普通信号：使用最小杠杆
  const levGood = Math.ceil((levMin + levMax) / 2);  // 良好信号：使用中等杠杆
  const levStrong = levMax;  // 强信号：使用最大杠杆
  
  return {
    // ==================== 策略基本信息 ====================
    name: "陪审团策略",
    description: "法官与陪审团合议决策，主Agent独立分析+三个专业Agent辅助，追求高质量决策",
    
    // ==================== 杠杆配置 ====================
    leverageMin: levMin,
    leverageMax: levMax,
    leverageRecommend: {
      normal: `${levNormal}倍`,
      good: `${levGood}倍`,
      strong: `${levStrong}倍`,
    },
    
    // ==================== 仓位配置 ====================
    positionSizeMin: 20,
    positionSizeMax: 30,
    positionSizeRecommend: {
      normal: "20-23%",
      good: "23-27%",
      strong: "27-30%",
    },
    
    // ==================== 止损配置 ====================
    stopLoss: {
      low: -8,    // 低杠杆时：亏损8%止损（给予更大波动空间）
      mid: -10,   // 中杠杆时：亏损10%止损
      high: -12,  // 高杠杆时：亏损12%止损
    },
    
    // ==================== 移动止盈配置 ====================
    trailingStop: {
      level1: { trigger: 4, stopAt: 2 },   // 盈利达到 +10% 时，止损线移至 +4%
      level2: { trigger: 6, stopAt: 4 },  // 盈利达到 +18% 时，止损线移至 +10%
      level3: { trigger: 8, stopAt: 6 },  // 盈利达到 +28% 时，止损线移至 +18%
    },
    
    // ==================== 分批止盈配置 ====================
    partialTakeProfit: {
      stage1: { trigger: 8, closePercent: 50 },   // +8%时平仓30%（让利润充分发挥）
      stage2: { trigger: 12, closePercent: 100 },  // +15%时平仓至60%（累计）
      stage3: { trigger: 25, closePercent: 100 }, // +25%时全部清仓
    },
    
    // ==================== 峰值回撤保护 ====================
    peakDrawdownProtection: 25,
    
    // ==================== 波动率调整 ====================
    volatilityAdjustment: {
      highVolatility: { 
        leverageFactor: 0.75,
        positionFactor: 0.8
      },
      normalVolatility: { 
        leverageFactor: 1.0,
        positionFactor: 1.0
      },
      lowVolatility: { 
        leverageFactor: 1.15,
        positionFactor: 1.05
      },
    },
    
    // ==================== 策略规则描述 ====================
    entryCondition: "三个分析Agent达成一致意见，且信号强度足够",
    riskTolerance: "单笔交易风险控制在20-30%之间，通过多Agent共识降低错误决策",
    tradingStyle: "积极寻找机会，及时入场出场，追求高频率与合理胜率的平衡",
    
    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,
 
    allowAiOverrideProtection: true
  };
}

/**
 * 生成陪审团策略特有的提示词
 * 
 * @param params - 策略参数配置
 * @param context - 运行时上下文
 * @returns 陪审团策略专属的AI提示词
 */
export function generateMultiAgentConsensusPrompt(params: StrategyParams, context: StrategyPromptContext): string {
  return `
【陪审团策略】

你的角色：法官（主Agent）
- 你有独立判断能力，需要先分析市场形成初步判断
- 倾听三个专业Agent（技术分析、趋势分析、风险评估）的意见
- 综合所有意见进行合议决策
- 你可以采纳多数意见，也可以坚持自己的判断

重要：你可以做多（Long）和做空（Short）
- 上涨趋势 → 做多获利
- 下跌趋势 → 做空获利
- 不要只做单一方向，根据市场趋势灵活选择

陪审团成员：
1. 技术分析Agent - 分析技术指标
2. 趋势分析Agent - 分析多时间框架趋势
3. 风险评估Agent - 评估市场风险

工作流程：
1. 法官先复盘历史交易和决策，总结经验教训
2. 独立分析市场，形成初步判断
3. 使用delegate_task调用三个Agent，只传递简短的任务描述
4. 汇总三个Agent的意见
5. 法官综合所有意见做出最终决策
6. ⚠️ 【必须执行】调用交易工具执行开仓/平仓，不能只是观望和分析

重要：子Agent已经有市场数据了
- 三个子Agent在创建时已经接收了完整的市场数据上下文
- 在delegate_task中只需传递简短的任务描述即可
- 示例："分析BTC技术指标" 或 "分析BTC趋势" 或 "评估BTC风险"
- 不需要在task中重复传递市场数据，这样可以节省大量输出token

⚠️ 【关键执行要求】：
- 每个周期必须做出实际操作，不能只是"分析"和"观望"
- 咨询完陪审团后，必须立即调用 open_position 或 close_position 工具
- 如果当前无持仓且市场有机会，必须开仓
- 如果持仓盈利或亏损达到条件，必须平仓或部分平仓
- 不要犹豫不决，相信陪审团的分析并果断执行
- 不要因为小幅亏损就快速止损，给持仓一定的波动空间

其他提示：
- 三个Agent只能使用分析工具，不能执行交易
- 只有你（法官）才能执行开仓和平仓操作
- 紧急情况（如持仓亏损接近止损线）可跳过陪审团直接决策
- 当前持仓数限制：< ${context.maxPositions}个
- 保持积极交易，维持60-80%资金在持仓状态，多币种分散
- 每个周期尽量开1-2个新仓（如果有合适机会）
- 重要：系统已预加载持仓数据，请仔细查看【当前持仓】部分，不要误判为空仓

风控参数（仅供参考）：
- 杠杆范围：${params.leverageMin}-${params.leverageMax}倍
- 仓位范围：${params.positionSizeMin}-${params.positionSizeMax}%
- 止损：低杠杆${params.stopLoss.low}%，中杠杆${params.stopLoss.mid}%，高杠杆${params.stopLoss.high}%
- 移动止盈：+${params.trailingStop.level1.trigger}%移至+${params.trailingStop.level1.stopAt}%，+${params.trailingStop.level2.trigger}%移至+${params.trailingStop.level2.stopAt}%，+${params.trailingStop.level3.trigger}%移至+${params.trailingStop.level3.stopAt}%
- 分批止盈：+${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，+${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，+${params.partialTakeProfit.stage3.trigger}%平${params.partialTakeProfit.stage3.closePercent}%

注：以上参数仅供参考，你可以根据实际市场情况灵活调整。
`;
}


