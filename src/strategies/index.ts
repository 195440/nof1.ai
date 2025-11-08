/**
 * 策略模块统一导出
 */

export type { TradingStrategy, StrategyParams, StrategyPromptContext } from "./types";
export { getUltraShortStrategy, generateUltraShortPrompt } from "./ultraShort";
export { getSwingTrendStrategy, generateSwingTrendPrompt } from "./swingTrend";
export { getConservativeStrategy, generateConservativePrompt } from "./conservative";
export { getBalancedStrategy, generateBalancedPrompt } from "./balanced";
export { getAggressiveStrategy, generateAggressivePrompt } from "./aggressive";

import type { TradingStrategy, StrategyParams, StrategyPromptContext } from "./types";
import { getUltraShortStrategy, generateUltraShortPrompt } from "./ultraShort";
import { getSwingTrendStrategy, generateSwingTrendPrompt } from "./swingTrend";
import { getConservativeStrategy, generateConservativePrompt } from "./conservative";
import { getBalancedStrategy, generateBalancedPrompt } from "./balanced";
import { getAggressiveStrategy, generateAggressivePrompt } from "./aggressive";

/**
 * 获取策略参数（基于 MAX_LEVERAGE 动态计算）
 */
export function getStrategyParams(strategy: TradingStrategy, maxLeverage: number): StrategyParams {
  switch (strategy) {
    case "ultra-short":
      return getUltraShortStrategy(maxLeverage);
    case "swing-trend":
      return getSwingTrendStrategy(maxLeverage);
    case "conservative":
      return getConservativeStrategy(maxLeverage);
    case "balanced":
      return getBalancedStrategy(maxLeverage);
    case "aggressive":
      return getAggressiveStrategy(maxLeverage);
    default:
      return getBalancedStrategy(maxLeverage);
  }
}

/**
 * 根据策略类型生成特有提示词
 */
export function generateStrategySpecificPrompt(
  strategy: TradingStrategy,
  params: StrategyParams,
  context: StrategyPromptContext
): string {
  switch (strategy) {
    case "aggressive":
      return generateAggressivePrompt(params, context);
    case "balanced":
      return generateBalancedPrompt(params, context);
    case "conservative":
      return generateConservativePrompt(params, context);
    case "ultra-short":
      return generateUltraShortPrompt(params, context);
    case "swing-trend":
      return generateSwingTrendPrompt(params, context);
    default:
      return generateBalancedPrompt(params, context);
  }
}

