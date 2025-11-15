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
 * 统一交易所接口
 * 提供统一的API，屏蔽不同交易所的差异
 */
import { createGateClient, GateClient } from "./gateClient";
import { createOkxClient, OkxClient } from "./okxClient";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
  name: "exchange-client",
  level: "info",
});

/**
 * 统一交易所客户端接口
 * 定义所有交易所必须实现的方法
 */
export interface IExchangeClient {
  /**
   * 获取合约ticker价格
   */
  getFuturesTicker(contract: string, retries?: number): Promise<any>;

  /**
   * 获取合约K线数据
   */
  getFuturesCandles(
    contract: string,
    interval?: string,
    limit?: number,
    retries?: number
  ): Promise<any[]>;

  /**
   * 获取账户余额
   */
  getFuturesAccount(retries?: number): Promise<any>;

  /**
   * 获取当前持仓
   */
  getPositions(retries?: number): Promise<any[]>;

  /**
   * 下单 - 开仓或平仓
   */
  placeOrder(params: {
    contract: string;
    size: number;
    price?: number;
    tif?: string;
    reduceOnly?: boolean;
    autoSize?: string;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<any>;

  /**
   * 获取订单详情
   * @param orderId 订单ID
   * @param contract 合约名称（可选，某些交易所如OKX需要此参数）
   */
  getOrder(orderId: string, contract?: string): Promise<any>;

  /**
   * 取消订单
   */
  cancelOrder(orderId: string): Promise<any>;

  /**
   * 获取未成交订单
   */
  getOpenOrders(contract?: string): Promise<any[]>;

  /**
   * 设置仓位杠杆
   */
  setLeverage(contract: string, leverage: number): Promise<any>;

  /**
   * 获取资金费率
   */
  getFundingRate(contract: string): Promise<any>;

  /**
   * 获取合约信息
   */
  getContractInfo(contract: string): Promise<any>;

  /**
   * 获取所有合约列表
   */
  getAllContracts(): Promise<any[]>;

  /**
   * 获取订单簿
   */
  getOrderBook(contract: string, limit?: number): Promise<any>;

  /**
   * 获取历史成交记录（我的成交）
   */
  getMyTrades(contract?: string, limit?: number): Promise<any[]>;

  /**
   * 获取历史仓位记录
   */
  getPositionHistory(contract?: string, limit?: number, offset?: number): Promise<any[]>;

  /**
   * 获取历史结算记录
   */
  getSettlementHistory(contract?: string, limit?: number, offset?: number): Promise<any[]>;

  /**
   * 获取已完成的订单历史
   */
  getOrderHistory(contract?: string, limit?: number): Promise<any[]>;
}

/**
 * 全局交易所客户端实例（单例模式）
 */
let exchangeClientInstance: IExchangeClient | null = null;

/**
 * 获取当前配置的交易所类型
 */
export function getExchangeType(): "gate" | "okx" {
  const exchange = (process.env.EXCHANGE || "gate").toLowerCase();
  if (exchange === "okx") {
    return "okx";
  }
  return "gate";
}

/**
 * 创建统一交易所客户端实例（单例模式）
 * 根据环境变量 EXCHANGE 决定使用哪个交易所
 * - EXCHANGE=gate (默认) - 使用 Gate.io
 * - EXCHANGE=okx - 使用 OKX
 */
export function createExchangeClient(): IExchangeClient {
  // 如果已存在实例，直接返回
  if (exchangeClientInstance) {
    return exchangeClientInstance;
  }

  const exchangeType = getExchangeType();

  if (exchangeType === "okx") {
    logger.info("使用 OKX 交易所");
    exchangeClientInstance = createOkxClient() as IExchangeClient;
  } else {
    logger.info("使用 Gate.io 交易所");
    exchangeClientInstance = createGateClient() as IExchangeClient;
  }

  return exchangeClientInstance;
}

/**
 * 重置交易所客户端实例（用于测试或重新配置）
 */
export function resetExchangeClient(): void {
  exchangeClientInstance = null;
  logger.info("交易所客户端实例已重置");
}

/**
 * 导出具体的客户端类型（用于需要访问特定交易所功能的场景）
 */
export type { GateClient, OkxClient };

