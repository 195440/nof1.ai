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

/**
 * 策略模块统一导出
 * 
 * 本模块提供了系统所有交易策略的统一入口，包括：
 * - 类型定义导出
 * - 各个策略实现导出
 * - 策略选择逻辑
 * - 提示词生成逻辑
 * 
 * 使用方式：
 * ```typescript
 * import { getStrategyParams, generateStrategySpecificPrompt } from "./strategies";
 * 
 * const params = getStrategyParams("aggressive", 25);  // 获取激进策略参数（最大杠杆25倍）
 * const prompt = generateStrategySpecificPrompt("aggressive", params, context);  // 生成AI提示词
 * ```
 */

// ==================== 类型定义导出 ====================
export type { TradingStrategy, StrategyParams, StrategyPromptContext } from "./types";
// ==================== 各策略实现导出 ====================
export { getUltraShortStrategy, generateUltraShortPrompt } from "./ultraShort";          // 超短线策略
export { getSwingTrendStrategy, generateSwingTrendPrompt } from "./swingTrend";        // 波段趋势策略
export { getMediumLongStrategy, generateMediumLongPrompt } from "./mediumLong";        // 中长线策略
export { getConservativeStrategy, generateConservativePrompt } from "./conservative";  // 稳健策略
export { getBalancedStrategy, generateBalancedPrompt } from "./balanced";              // 平衡策略
export { getAggressiveStrategy, generateAggressivePrompt } from "./aggressive";        // 激进策略
export { getAggressiveTeamStrategy, generateAggressiveTeamPrompt } from "./aggressiveTeam";  // 激进团策略
export { getRebateFarmingStrategy, generateRebateFarmingPrompt } from "./rebateFarming";  // 返佣套利策略
export { getAiAutonomousStrategy, generateAiAutonomousPrompt } from "./aiAutonomous";  // AI自主策略
export { getMultiAgentConsensusStrategy, generateMultiAgentConsensusPrompt } from "./multiAgentConsensus";  // 多Agent共识策略
export { getAlphaBetaStrategy, generateAlphaBetaPrompt } from "./alphaBeta";  // Alpha Beta策略

import type { TradingStrategy, StrategyParams, StrategyPromptContext } from "./types";
import { getUltraShortStrategy, generateUltraShortPrompt } from "./ultraShort";
import { getSwingTrendStrategy, generateSwingTrendPrompt } from "./swingTrend";
import { getMediumLongStrategy, generateMediumLongPrompt } from "./mediumLong";
import { getConservativeStrategy, generateConservativePrompt } from "./conservative";
import { getBalancedStrategy, generateBalancedPrompt } from "./balanced";
import { getAggressiveStrategy, generateAggressivePrompt } from "./aggressive";
import { getAggressiveTeamStrategy, generateAggressiveTeamPrompt } from "./aggressiveTeam";
import { getRebateFarmingStrategy, generateRebateFarmingPrompt } from "./rebateFarming";
import { getAiAutonomousStrategy, generateAiAutonomousPrompt } from "./aiAutonomous";
import { getMultiAgentConsensusStrategy, generateMultiAgentConsensusPrompt } from "./multiAgentConsensus";
import { getAlphaBetaStrategy, generateAlphaBetaPrompt } from "./alphaBeta";

/**
 * 获取策略参数（基于 MAX_LEVERAGE 动态计算）
 * 
 * 根据策略类型和系统最大杠杆，动态计算策略的完整参数配置。
 * 各策略的杠杆范围会根据 maxLeverage 按比例调整。
 * 
 * @param strategy - 策略类型（"ultra-short" | "swing-trend" | "conservative" | "balanced" | "aggressive"）
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取，如 MAX_LEVERAGE=25）
 * @returns 策略的完整参数配置（包含杠杆、仓位、止损止盈等所有参数）
 * 
 * @example
 * ```typescript
 * // 获取激进策略参数（系统最大杠杆25倍）
 * const params = getStrategyParams("aggressive", 25);
 * console.log(params.leverageMin);  // 22（85% * 25）
 * console.log(params.leverageMax);  // 25（100% * 25）
 * ```
 */
export function getStrategyParams(strategy: TradingStrategy, maxLeverage: number): StrategyParams {
  switch (strategy) {
    case "ultra-short":
      return getUltraShortStrategy(maxLeverage);
    case "swing-trend":
      return getSwingTrendStrategy(maxLeverage);
    case "medium-long":
      return getMediumLongStrategy(maxLeverage);
    case "conservative":
      return getConservativeStrategy(maxLeverage);
    case "balanced":
      return getBalancedStrategy(maxLeverage);
    case "aggressive":
      return getAggressiveStrategy(maxLeverage);
    case "aggressive-team":
      return getAggressiveTeamStrategy(maxLeverage);
    case "rebate-farming":
      return getRebateFarmingStrategy(maxLeverage);
    case "ai-autonomous":
      return getAiAutonomousStrategy(maxLeverage);
    case "multi-agent-consensus":
      return getMultiAgentConsensusStrategy(maxLeverage);
    case "alpha-beta":
      return getAlphaBetaStrategy(maxLeverage);
    default:
      return getAiAutonomousStrategy(maxLeverage);
  }
}

/**
 * 根据策略类型生成特有提示词
 * 
 * 为AI生成特定策略的决策提示词。不同策略有不同的交易理念和规则，
 * 生成的提示词会指导AI按照对应策略的原则进行交易决策。
 * 
 * @param strategy - 策略类型（"ultra-short" | "swing-trend" | "conservative" | "balanced" | "aggressive"）
 * @param params - 策略参数配置（从 getStrategyParams 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量、止损阈值等）
 * @returns 策略专属的AI提示词（字符串格式，会被插入到AI的系统提示词中）
 * 
 * @example
 * ```typescript
 * const params = getStrategyParams("aggressive", 25);
 * const context = {
 *   intervalMinutes: 5,
 *   maxPositions: 5,
 *   extremeStopLossPercent: -30,
 *   maxHoldingHours: 36,
 *   tradingSymbols: ['BTC', 'ETH']
 * };
 * const prompt = generateStrategySpecificPrompt("aggressive", params, context);
 * // prompt 包含激进策略的交易规则、风控要求等
 * ```
 */
export function generateStrategySpecificPrompt(
  strategy: TradingStrategy,
  params: StrategyParams,
  context: StrategyPromptContext
): string {
  switch (strategy) {
    case "aggressive":
      return generateAggressivePrompt(params, context);
    case "aggressive-team":
      return generateAggressiveTeamPrompt(params, context);
    case "balanced":
      return generateBalancedPrompt(params, context);
    case "conservative":
      return generateConservativePrompt(params, context);
    case "ultra-short":
      return generateUltraShortPrompt(params, context);
    case "swing-trend":
      return generateSwingTrendPrompt(params, context);
    case "medium-long":
      return generateMediumLongPrompt(params, context);
    case "rebate-farming":
      return generateRebateFarmingPrompt(params, context);
    case "ai-autonomous":
      return generateAiAutonomousPrompt(params, context);
    case "multi-agent-consensus":
      return generateMultiAgentConsensusPrompt(params, context);
    case "alpha-beta":
      return generateAlphaBetaPrompt(params, context);
    default:
      return generateAiAutonomousPrompt(params, context);
  }
}

