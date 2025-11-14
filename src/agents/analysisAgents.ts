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

import { Agent } from "@voltagent/core";
import { createOpenAI } from "@ai-sdk/openai";
import * as tradingTools from "../tools/trading";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
  name: "analysis-agents",
  level: "info",
});

/**
 * 创建技术分析Agent
 * 专注于技术指标分析
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createTechnicalAnalystAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是技术分析专家，专注于加密货币技术指标分析。

你的任务：
- 分析技术指标（EMA、MACD、RSI、成交量等）
- 给出技术评分（1-10分）和建议方向（做多/做空/观望）
- 结合持仓情况给出操作建议

可以建议做多（Long）或做空（Short）：
- 技术指标看涨 → 建议做多
- 技术指标看跌 → 建议做空`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "技术分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "技术分析Agent" }),
  });

  return agent;
}

/**
 * 创建趋势分析Agent
 * 专注于多时间框架趋势分析
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createTrendAnalystAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是趋势分析专家，专注于多时间框架趋势识别。

你的任务：
- 分析多时间框架趋势（1m、5m、15m、30m、1h）
- 给出趋势评分（1-10分）和建议方向（做多/做空/观望）
- 结合持仓情况给出操作建议

可以建议做多（Long）或做空（Short）：
- 上涨趋势 → 建议做多
- 下跌趋势 → 建议做空`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "趋势分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "趋势分析Agent" }),
  });

  return agent;
}

/**
 * 创建风险评估Agent
 * 专注于市场风险评估
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createRiskAssessorAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是风险评估专家，专注于市场风险识别和评估。

你的任务：
- 评估市场风险（波动率、资金费率、市场深度等）
- 给出风险评分（1-10分，越低越安全）和风险建议
- 结合持仓情况给出风控建议

做多和做空都可以，评估两个方向的风险：
- 做多风险：上涨空间 vs 下跌风险
- 做空风险：下跌空间 vs 上涨风险`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "风险评估Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "风险评估Agent" }),
  });

  return agent;
}
