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
 * 统一的交易所客户端接口
 * 
 * 此接口定义了所有交易所客户端必须实现的通用方法
 * 确保不同交易所可以无缝切换
 */

/**
 * 统一的订单参数类型
 */
export interface PlaceOrderParams {
  contract: string;
  size: number;
  price?: number;
  tif?: string;
  reduceOnly?: boolean;
  autoSize?: string;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * 统一的交易所客户端接口
 * 所有交易所客户端都必须实现这些方法
 */
export interface IExchangeClient {
  /**
   * 获取合约ticker价格（带重试机制）
   */
  getFuturesTicker(contract: string, retries?: number): Promise<any>;

  /**
   * 获取合约K线数据（带重试机制）
   */
  getFuturesCandles(
    contract: string,
    interval?: string,
    limit?: number,
    retries?: number
  ): Promise<any[]>;

  /**
   * 获取账户余额（带重试机制）
   */
  getFuturesAccount(retries?: number): Promise<any>;

  /**
   * 获取当前持仓（带重试机制，只返回允许的币种）
   */
  getPositions(retries?: number): Promise<any[]>;

  /**
   * 下单 - 开仓或平仓
   */
  placeOrder(params: PlaceOrderParams): Promise<any>;

  /**
   * 获取订单详情
   */
  getOrder(orderId: string): Promise<any>;

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
   * 获取合约信息（包含持仓量等）
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
   * 获取历史仓位记录（已平仓的仓位结算记录）
   */
  getPositionHistory(contract?: string, limit?: number, offset?: number): Promise<any[]>;

  /**
   * 获取历史结算记录（更详细的历史仓位信息）
   */
  getSettlementHistory(contract?: string, limit?: number, offset?: number): Promise<any[]>;

  /**
   * 获取已完成的订单历史
   */
  getOrderHistory(contract?: string, limit?: number): Promise<any[]>;
}

