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
 * 交易工具集导出
 */

// 市场数据工具
export {
  getMarketPriceTool,
  getTechnicalIndicatorsTool,
  getFundingRateTool,
  getOrderBookTool,
  getOpenInterestTool,
} from "./marketData";

// 交易执行工具
export {
  openPositionTool,
  closePositionTool,
  cancelOrderTool,
} from "./tradeExecution";

// 账户管理工具
export {
  getAccountBalanceTool,
  getPositionsTool,
  getOpenOrdersTool,
  checkOrderStatusTool,
  calculateRiskTool,
  syncPositionsTool,
} from "./accountManagement";

// 消息面数据工具（Gate MCP News）
export {
  getCryptoNewsTool,
  getExchangeAnnouncementsTool,
  getLatestEventsTool,
} from "./newsData";

