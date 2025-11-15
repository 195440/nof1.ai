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
 * OKX API 客户端封装
 */
import * as crypto from "crypto";
import { createLogger } from "../utils/loggerUtils";
import { RISK_PARAMS } from "../config/riskParams";
import { getOkxWebSocketClient } from "./okxWebSocket";

const logger = createLogger({
  name: "okx-client",
  level: "info",
});

export class OkxClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly passphrase: string;
  private readonly baseUrl: string;
  private readonly isTestnet: boolean;
  private readonly useWebSocket: boolean;
  private positionModeSet: boolean = false;

  constructor(apiKey: string, apiSecret: string, passphrase: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
    
    // OKX 测试网和正式网使用相同的域名，通过 header 区分
    this.baseUrl = "https://www.okx.com";
    
    // 根据环境变量决定使用测试网还是正式网
    this.isTestnet = process.env.OKX_USE_TESTNET === "true";
    
    // 是否使用 WebSocket 获取行情数据（默认开启）
    this.useWebSocket = process.env.OKX_USE_WEBSOCKET !== "false";
    
    if (this.isTestnet) {
      logger.info("使用 OKX 测试网 (x-simulated-trading: 1)");
    } else {
      logger.info("使用 OKX 正式网");
    }

    if (this.useWebSocket) {
      logger.info("使用 WebSocket 获取行情数据");
      // 初始化 WebSocket 连接
      this.initWebSocket();
    } else {
      logger.info("使用 REST API 获取行情数据");
    }

    logger.info("OKX API 客户端初始化完成");
  }

  /**
   * 初始化 WebSocket 连接
   */
  private async initWebSocket(): Promise<void> {
    try {
      const wsClient = getOkxWebSocketClient();
      await wsClient.connect();
      logger.info("WebSocket 连接初始化成功");
    } catch (error) {
      logger.error("WebSocket 连接初始化失败:", error);
      // 不抛出错误，允许降级到 REST API
    }
  }

  /**
   * 生成 OKX API 签名
   */
  private sign(timestamp: string, method: string, requestPath: string, body: string = ""): string {
    const message = timestamp + method + requestPath + body;
    const hmac = crypto.createHmac("sha256", this.apiSecret);
    hmac.update(message);
    return hmac.digest("base64");
  }

  /**
   * 发送 HTTP 请求
   */
  private async request(
    method: string,
    endpoint: string,
    params?: Record<string, any>,
    body?: Record<string, any>
  ): Promise<any> {
    const timestamp = new Date().toISOString();
    
    // 构建查询字符串
    let queryString = "";
    if (params && Object.keys(params).length > 0) {
      queryString = "?" + new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString();
    }
    
    const requestPath = endpoint + queryString;
    const bodyStr = body ? JSON.stringify(body) : "";
    const sign = this.sign(timestamp, method, requestPath, bodyStr);
    
    // 构建请求头
    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": this.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.passphrase,
      "Content-Type": "application/json",
    };
    
    // 测试网标识
    if (this.isTestnet) {
      headers["x-simulated-trading"] = "1";
    }
    
    const url = this.baseUrl + requestPath;
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
      });
      
      const data = await response.json();
      
      // 记录详细的请求和响应信息（仅在出错时）
      if (data.code !== "0") {
        logger.error(`OKX API 错误响应: ${method} ${endpoint}`, {
          requestBody: bodyStr ? JSON.parse(bodyStr) : undefined,
          responseCode: data.code,
          responseMsg: data.msg,
          responseData: data.data,
          httpStatus: response.status,
        });
      }
      
      // OKX API 返回格式: {code, msg, data}
      if (data.code !== "0") {
        // 如果有详细的错误数据，提取出来
        let detailedError = data.msg;
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          const firstError = data.data[0];
          if (firstError.sMsg) {
            detailedError = `${data.msg} - ${firstError.sMsg} (sCode: ${firstError.sCode})`;
          }
        }
        throw new Error(`OKX API Error: ${detailedError} (code: ${data.code})`);
      }
      
      return data.data;
    } catch (error: any) {
      logger.error(`OKX API 请求失败: ${method} ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * 将 Gate 格式的合约名转换为 OKX 格式
   * Gate: BTC_USDT -> OKX: BTC-USDT-SWAP
   */
  private toOkxContract(gateContract: string): string {
    const symbol = gateContract.replace("_USDT", "");
    return `${symbol}-USDT-SWAP`;
  }

  /**
   * 将 OKX 格式的合约名转换为 Gate 格式
   * OKX: BTC-USDT-SWAP -> Gate: BTC_USDT
   */
  private toGateContract(okxContract: string): string {
    const symbol = okxContract.replace("-USDT-SWAP", "");
    return `${symbol}_USDT`;
  }

  /**
   * 获取合约ticker价格（带重试机制）
   * 优先使用 WebSocket，失败时降级到 REST API
   */
  async getFuturesTicker(contract: string, retries: number = 2): Promise<any> {
    const instId = this.toOkxContract(contract);
    
    // 尝试使用 WebSocket
    if (this.useWebSocket) {
      try {
        const wsClient = getOkxWebSocketClient();
        
        // 检查缓存
        let ticker = wsClient.getCachedTicker(instId);
        
        if (!ticker) {
          // 订阅并等待数据
          await wsClient.subscribe("tickers", instId);
          ticker = await wsClient.waitForTicker(instId, 3000);
        }
        
        if (ticker) {
          // 转换为 Gate 格式的返回值
          return {
            contract,
            last: ticker.last,
            markPrice: ticker.idxPx, // OKX 使用 idxPx 作为指数价格
            indexPrice: ticker.idxPx,
            high24h: ticker.high24h,
            low24h: ticker.low24h,
            volume24h: ticker.vol24h,
            changePercentage: ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h) * 100).toFixed(2),
          };
        }
      } catch (error) {
        logger.warn(`WebSocket 获取 ${contract} 价格失败，降级到 REST API:`, error);
      }
    }
    
    // 降级到 REST API
    let lastError: any;
    for (let i = 0; i <= retries; i++) {
      try {
        const data = await this.request("GET", "/api/v5/market/ticker", {
          instId,
        });
        
        if (!data || data.length === 0) {
          throw new Error("No ticker data returned");
        }
        
        const ticker = data[0];
        
        // 转换为 Gate 格式的返回值
        return {
          contract,
          last: ticker.last,
          markPrice: ticker.idxPx, // OKX 使用 idxPx 作为指数价格
          indexPrice: ticker.idxPx,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          volume24h: ticker.vol24h,
          changePercentage: ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h) * 100).toFixed(2),
        };
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取 ${contract} 价格失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
        }
      }
    }
    
    logger.error(`获取 ${contract} 价格失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取合约K线数据（带重试机制）
   * K线数据使用 REST API 获取，因为需要获取历史数据
   */
  async getFuturesCandles(
    contract: string,
    interval: string = "5m",
    limit: number = 100,
    retries: number = 2
  ): Promise<any[]> {
    const instId = this.toOkxContract(contract);
    
    // 转换时间周期格式: Gate (5m) -> OKX (5m)
    // OKX 支持: 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M
    let bar = interval;
    if (interval === "1h") bar = "1H";
    else if (interval === "4h") bar = "4H";
    
    // K线数据直接使用 REST API，避免 WebSocket 复杂性
    // WebSocket 主要用于实时 ticker 推送
    let lastError: any;
    for (let i = 0; i <= retries; i++) {
      try {
        const data = await this.request("GET", "/api/v5/market/candles", {
          instId,
          bar,
          limit: Math.min(limit, 300), // OKX 最大 300
        });
        
        // OKX K线格式: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
        // 转换为 Gate 格式: {t, o, h, l, c, v, sum}
        return data.map((candle: string[]) => ({
          t: parseInt(candle[0]) / 1000, // OKX 返回毫秒时间戳
          o: candle[1],
          h: candle[2],
          l: candle[3],
          c: candle[4],
          v: candle[5],
          sum: candle[7], // volCcyQuote
        })).reverse(); // OKX 返回倒序，需要反转
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取 ${contract} K线数据失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
        }
      }
    }
    
    logger.error(`获取 ${contract} K线数据失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取账户余额（带重试机制）
   */
  async getFuturesAccount(retries: number = 2): Promise<any> {
    let lastError: any;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const data = await this.request("GET", "/api/v5/account/balance");
        
        if (!data || data.length === 0) {
          throw new Error("No account data returned");
        }
        
        const account = data[0];
        const usdtDetail = account.details?.find((d: any) => d.ccy === "USDT");
        
        if (!usdtDetail) {
          throw new Error("USDT account not found");
        }
        
        // 转换为 Gate 格式
        return {
          currency: "USDT",
          total: usdtDetail.eq, // 币种总权益
          available: usdtDetail.availBal, // 可用保证金
          positionMargin: usdtDetail.frozenBal, // 持仓占用保证金
          orderMargin: usdtDetail.ordFrozen || "0", // 挂单占用保证金
          unrealisedPnl: account.details.reduce((sum: number, d: any) => {
            return sum + parseFloat(d.upl || "0");
          }, 0).toString(),
        };
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取账户余额失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
        }
      }
    }
    
    logger.error(`获取账户余额失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取当前持仓（带重试机制，只返回允许的币种）
   */
  async getPositions(retries: number = 2): Promise<any[]> {
    let lastError: any;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const data = await this.request("GET", "/api/v5/account/positions", {
          instType: "SWAP",
        });
        
        // 过滤：只保留允许的币种
        const allowedSymbols = RISK_PARAMS.TRADING_SYMBOLS;
        
        // 记录原始持仓数据（用于调试）
        if (data && data.length > 0) {
          logger.info(`OKX 原始持仓数据 (${data.length} 个):`, 
            data.slice(0, 3).map((p: any) => ({
              instId: p.instId,
              pos: p.pos,
              posSide: p.posSide,
              avgPx: p.avgPx,
              notionalUsd: p.notionalUsd,
              margin: p.margin,
              lever: p.lever,
            }))
          );
        }
        
        const filteredPositions = data
          ?.filter((p: any) => {
            const gateContract = this.toGateContract(p.instId);
            const symbol = gateContract.split("_")[0];
            return symbol && allowedSymbols.includes(symbol) && parseFloat(p.pos || "0") !== 0;
          })
          .map((p: any) => {
            const gateContract = this.toGateContract(p.instId);
            
            // OKX 使用双向持仓模式
            // posSide: long/short/net
            // pos: 持仓数量（正数）
            // 转换为 Gate 格式的 size（正数=多，负数=空）
            let size = parseFloat(p.pos || "0");
            if (p.posSide === "short") {
              size = -size;
            }
            
            // 计算开仓价值（保证金）
            // OKX: notionalUsd = 持仓价值（USD）, margin = 保证金余额
            // 保证金 = 持仓价值 / 杠杆
            const notionalUsd = parseFloat(p.notionalUsd || "0");
            const leverage = parseFloat(p.lever || "1");
            const marginValue = notionalUsd / leverage;
            
            const result = {
              contract: gateContract,
              size: size.toString(),
              leverage: p.lever,
              entryPrice: p.avgPx,
              markPrice: p.markPx,
              liqPrice: p.liqPx || "0",
              unrealisedPnl: p.upl,
              realisedPnl: p.realizedPnl || "0",
              margin: marginValue.toString(), // 使用计算的保证金
              notionalUsd: p.notionalUsd, // 持仓价值（USD）
            };
            
            // 记录转换后的数据
            logger.debug(`持仓转换: ${gateContract}`, {
              原始notionalUsd: p.notionalUsd,
              杠杆: leverage,
              计算保证金: marginValue,
              未实现盈亏: p.upl,
            });
            
            return result;
          }) || [];
        
        return filteredPositions;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取持仓失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
        }
      }
    }
    
    logger.error(`获取持仓失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 设置持仓模式（单向/双向）
   */
  async setPositionMode(posMode: "long_short_mode" | "net_mode" = "long_short_mode"): Promise<void> {
    // 如果已经设置过，跳过
    if (this.positionModeSet) {
      return;
    }
    
    try {
      logger.info(`设置持仓模式为: ${posMode}`);
      
      const data = await this.request("POST", "/api/v5/account/set-position-mode", undefined, {
        posMode,
      });
      
      logger.info("持仓模式设置成功");
      this.positionModeSet = true;
    } catch (error: any) {
      // 如果已经设置过，可能会报错，这是正常的
      if (error.message.includes("Position mode is already") || 
          error.message.includes("59120") || // OKX 错误码：持仓模式已存在
          error.message.includes("59121")) { // OKX 错误码：有持仓时不能修改
        logger.info("持仓模式已经设置，跳过");
        this.positionModeSet = true;
      } else {
        logger.warn(`设置持仓模式失败:`, error.message);
        // 不抛出异常，允许继续下单尝试
      }
    }
  }

  /**
   * 下单 - 开仓或平仓
   */
  async placeOrder(params: {
    contract: string;
    size: number;
    price?: number;
    tif?: string;
    reduceOnly?: boolean;
    autoSize?: string;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<any> {
    const instId = this.toOkxContract(params.contract);
    
    // 验证 size 参数
    if (params.size === 0 || !Number.isFinite(params.size)) {
      throw new Error(`Invalid order size: ${params.size}. Size must be a non-zero finite number.`);
    }
    
    try {
      // 首次下单前确保持仓模式已设置（双向持仓）
      // 这个调用会被缓存，不会重复设置
      await this.setPositionMode("long_short_mode");
      // 确定订单方向和持仓方向
      const side = params.size > 0 ? "buy" : "sell";
      const posSide = params.reduceOnly 
        ? (params.size > 0 ? "short" : "long") // 平仓时方向相反
        : (params.size > 0 ? "long" : "short"); // 开仓时方向一致
      
      // OKX 订单类型
      let ordType = "market";
      let px = "";
      
      if (params.price && params.price > 0) {
        ordType = "limit";
        px = params.price.toString();
      }
      
      // 构建订单参数
      const order: any = {
        instId,
        tdMode: "cross", // 全仓模式
        side,
        posSide,
        ordType,
        sz: Math.abs(params.size).toString(),
      };
      
      if (ordType === "limit") {
        order.px = px;
      }
      
      // 平仓标识
      if (params.reduceOnly) {
        order.reduceOnly = true;
      }
      
      logger.info(`OKX 下单请求:`, {
        contract: params.contract,
        instId,
        size: params.size,
        price: params.price,
        reduceOnly: params.reduceOnly,
        orderParams: order,
      });
      
      const data = await this.request("POST", "/api/v5/trade/order", undefined, order);
      
      if (!data || data.length === 0) {
        throw new Error("No order response");
      }
      
      const result = data[0];
      
      logger.info(`OKX 下单响应:`, {
        ordId: result.ordId,
        sCode: result.sCode,
        sMsg: result.sMsg,
      });
      
      if (result.sCode !== "0") {
        throw new Error(`Order failed: ${result.sMsg} (code: ${result.sCode})`);
      }
      
      // 转换为 Gate 格式
      return {
        id: result.ordId,
        contract: params.contract,
        size: params.size,
        price: params.price || 0,
        status: "open",
      };
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error";
      logger.error("OKX 下单失败:", errorMessage);
      throw new Error(`下单失败: ${errorMessage}`);
    }
  }

  /**
   * 获取订单详情
   * @param orderId 订单ID
   * @param contract 合约名称（可选）。如果提供，将直接查询；否则将遍历未完成订单和历史订单查找
   */
  async getOrder(orderId: string, contract?: string): Promise<any> {
    try {
      let order: any = null;
      
      if (contract) {
        // 如果提供了合约名称，直接查询（OKX API 要求同时提供 instId 和 ordId）
        const instId = this.toOkxContract(contract);
        const data = await this.request("GET", "/api/v5/trade/order", {
          instId,
          ordId: orderId,
        });
        
        if (!data || data.length === 0) {
          throw new Error("Order not found");
        }
        order = data[0];
      } else {
        // 如果没有提供合约名称，先从未完成订单中查找
        logger.debug(`未提供合约名称，从订单列表中查找订单 ${orderId}`);
        
        const openOrders = await this.getOpenOrders();
        order = openOrders.find((o: any) => o.id === orderId);
        
        // 如果未完成订单中找不到，再从历史订单中查找（最近100条）
        if (!order) {
          logger.debug(`未完成订单中未找到，查询历史订单`);
          const historyOrders = await this.getOrderHistory(undefined, 100);
          order = historyOrders.find((o: any) => o.id === orderId);
        }
        
        if (!order) {
          throw new Error("Order not found in open orders or recent history");
        }
        
        // 如果从列表中找到，已经是转换后的格式，直接返回
        return order;
      }
      
      // 转换原始 OKX 订单格式为统一格式
      const gateContract = this.toGateContract(order.instId);
      
      // OKX 订单状态: live, partially_filled, filled, canceled
      let status = "open";
      if (order.state === "filled") status = "finished";
      else if (order.state === "canceled") status = "cancelled";
      
      // 计算已成交数量
      const totalSize = parseFloat(order.sz || "0");
      const filledSize = parseFloat(order.accFillSz || "0");
      const leftSize = totalSize - filledSize;
      
      // 转换为 Gate 格式（带符号的 size）
      let size = totalSize;
      if (order.side === "sell") {
        size = -size;
      }
      
      let left = leftSize;
      if (order.side === "sell") {
        left = -left;
      }
      
      return {
        id: order.ordId,
        contract: gateContract,
        size: size.toString(),
        left: left.toString(),
        price: order.px || "0",
        fill_price: order.avgPx || "0",
        status,
        create_time: parseInt(order.cTime) / 1000,
        finish_time: order.uTime ? parseInt(order.uTime) / 1000 : undefined,
      };
    } catch (error: any) {
      logger.error(`获取订单 ${orderId} 详情失败:`, error);
      throw error;
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<any> {
    try {
      // 需要先获取订单信息以获取 instId
      const orderInfo = await this.getOrder(orderId);
      const instId = this.toOkxContract(orderInfo.contract);
      
      const data = await this.request("POST", "/api/v5/trade/cancel-order", undefined, {
        instId,
        ordId: orderId,
      });
      
      if (!data || data.length === 0) {
        throw new Error("Cancel order failed");
      }
      
      const result = data[0];
      
      if (result.sCode !== "0") {
        throw new Error(`Cancel failed: ${result.sMsg}`);
      }
      
      return {
        id: result.ordId,
        status: "cancelled",
      };
    } catch (error: any) {
      logger.error(`取消订单 ${orderId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取未成交订单
   */
  async getOpenOrders(contract?: string): Promise<any[]> {
    try {
      const params: any = {
        instType: "SWAP",
      };
      
      if (contract) {
        params.instId = this.toOkxContract(contract);
      }
      
      const data = await this.request("GET", "/api/v5/trade/orders-pending", params);
      
      return (data || []).map((order: any) => {
        const gateContract = this.toGateContract(order.instId);
        
        let size = parseFloat(order.sz || "0");
        if (order.side === "sell") {
          size = -size;
        }
        
        let left = parseFloat(order.sz || "0") - parseFloat(order.accFillSz || "0");
        if (order.side === "sell") {
          left = -left;
        }
        
        return {
          id: order.ordId,
          contract: gateContract,
          size: size.toString(),
          left: left.toString(),
          price: order.px || "0",
          status: "open",
          is_reduce_only: order.reduceOnly === "true",
          create_time: parseInt(order.cTime) / 1000,
        };
      });
    } catch (error: any) {
      logger.error("获取未成交订单失败:", error);
      throw error;
    }
  }

  /**
   * 设置仓位杠杆
   */
  async setLeverage(contract: string, leverage: number): Promise<any> {
    try {
      const instId = this.toOkxContract(contract);
      
      logger.info(`设置 ${contract} 杠杆为 ${leverage}x`);
      
      const data = await this.request("POST", "/api/v5/account/set-leverage", undefined, {
        instId,
        lever: leverage.toString(),
        mgnMode: "cross", // 全仓模式
      });
      
      if (!data || data.length === 0) {
        throw new Error("Set leverage failed");
      }
      
      const result = data[0];
      
      if (result.sCode !== "0") {
        throw new Error(`Set leverage failed: ${result.sMsg}`);
      }
      
      return {
        leverage: result.lever,
      };
    } catch (error: any) {
      logger.warn(`设置 ${contract} 杠杆失败（可能已有持仓）:`, error.message);
      return null;
    }
  }

  /**
   * 获取资金费率
   */
  async getFundingRate(contract: string): Promise<any> {
    try {
      const instId = this.toOkxContract(contract);
      
      const data = await this.request("GET", "/api/v5/public/funding-rate", {
        instId,
      });
      
      if (!data || data.length === 0) {
        throw new Error("No funding rate data");
      }
      
      const fundingRate = data[0];
      
      return {
        r: fundingRate.fundingRate,
        t: parseInt(fundingRate.fundingTime) / 1000,
      };
    } catch (error: any) {
      logger.error(`获取 ${contract} 资金费率失败:`, error);
      throw error;
    }
  }

  /**
   * 获取合约信息（包含持仓量等）
   */
  async getContractInfo(contract: string): Promise<any> {
    try {
      const instId = this.toOkxContract(contract);
      
      const data = await this.request("GET", "/api/v5/public/instruments", {
        instType: "SWAP",
        instId,
      });
      
      if (!data || data.length === 0) {
        throw new Error("Contract not found");
      }
      
      const info = data[0];
      
      // 转换为 Gate 格式
      return {
        name: contract,
        orderSizeMin: parseFloat(info.minSz || "1"),
        orderSizeMax: parseFloat(info.maxLmtSz || "1000000"),
        quantoMultiplier: parseFloat(info.ctVal || "0.01"), // 合约乘数（使用驼峰命名与 Gate 保持一致）
        lotSize: parseFloat(info.lotSz || "1"), // 下单数量精度
      };
    } catch (error: any) {
      logger.error(`获取 ${contract} 合约信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取所有合约列表
   */
  async getAllContracts(): Promise<any[]> {
    try {
      const data = await this.request("GET", "/api/v5/public/instruments", {
        instType: "SWAP",
      });
      
      return (data || [])
        .filter((inst: any) => inst.instId.endsWith("-USDT-SWAP"))
        .map((inst: any) => {
          const gateContract = this.toGateContract(inst.instId);
          return {
            name: gateContract,
            orderSizeMin: parseFloat(inst.minSz || "1"),
            orderSizeMax: parseFloat(inst.maxLmtSz || "1000000"),
            lotSize: parseFloat(inst.lotSz || "1"),
          };
        });
    } catch (error: any) {
      logger.error("获取合约列表失败:", error);
      throw error;
    }
  }

  /**
   * 获取订单簿
   */
  async getOrderBook(contract: string, limit: number = 10): Promise<any> {
    try {
      const instId = this.toOkxContract(contract);
      
      const data = await this.request("GET", "/api/v5/market/books", {
        instId,
        sz: Math.min(limit, 400).toString(),
      });
      
      if (!data || data.length === 0) {
        throw new Error("No order book data");
      }
      
      const book = data[0];
      
      // OKX 格式: [price, size, deprecated, orders]
      // 转换为 Gate 格式: {p: price, s: size}
      return {
        bids: (book.bids || []).map((bid: string[]) => ({
          p: bid[0],
          s: bid[1],
        })),
        asks: (book.asks || []).map((ask: string[]) => ({
          p: ask[0],
          s: ask[1],
        })),
      };
    } catch (error: any) {
      logger.error(`获取 ${contract} 订单簿失败:`, error);
      throw error;
    }
  }

  /**
   * 获取历史成交记录（我的成交）
   */
  async getMyTrades(contract?: string, limit: number = 10): Promise<any[]> {
    try {
      const params: any = {
        instType: "SWAP",
        limit: Math.min(limit, 100).toString(),
      };
      
      if (contract) {
        params.instId = this.toOkxContract(contract);
      }
      
      const data = await this.request("GET", "/api/v5/trade/fills", params);
      
      return (data || []).map((trade: any) => {
        const gateContract = this.toGateContract(trade.instId);
        return {
          contract: gateContract,
          id: trade.tradeId,
          order_id: trade.ordId,
          size: trade.side === "sell" ? `-${trade.fillSz}` : trade.fillSz,
          price: trade.fillPx,
          fee: trade.fee,
          time: parseInt(trade.ts) / 1000,
        };
      });
    } catch (error: any) {
      logger.error("获取我的历史成交记录失败:", error);
      throw error;
    }
  }

  /**
   * 获取历史仓位记录（已平仓的仓位结算记录）
   */
  async getPositionHistory(contract?: string, limit: number = 100, offset: number = 0): Promise<any[]> {
    try {
      const params: any = {
        instType: "SWAP",
        limit: Math.min(limit, 100).toString(),
      };
      
      if (contract) {
        params.instId = this.toOkxContract(contract);
      }
      
      // OKX 使用 positions-history API
      const data = await this.request("GET", "/api/v5/account/positions-history", params);
      
      return (data || []).map((pos: any) => {
        const gateContract = this.toGateContract(pos.instId);
        return {
          contract: gateContract,
          size: pos.posSide === "short" ? `-${pos.closeAvgPx}` : pos.closeAvgPx,
          pnl: pos.pnl,
          close_time: parseInt(pos.uTime) / 1000,
        };
      });
    } catch (error: any) {
      logger.error("获取历史仓位记录失败:", error);
      throw error;
    }
  }

  /**
   * 获取历史结算记录（更详细的历史仓位信息）
   */
  async getSettlementHistory(contract?: string, limit: number = 100, offset: number = 0): Promise<any[]> {
    // OKX 没有单独的结算历史API，使用仓位历史代替
    return this.getPositionHistory(contract, limit, offset);
  }

  /**
   * 获取已完成的订单历史
   */
  async getOrderHistory(contract?: string, limit: number = 10): Promise<any[]> {
    try {
      const params: any = {
        instType: "SWAP",
        limit: Math.min(limit, 100).toString(),
        state: "filled",
      };
      
      if (contract) {
        params.instId = this.toOkxContract(contract);
      }
      
      const data = await this.request("GET", "/api/v5/trade/orders-history", params);
      
      return (data || []).map((order: any) => {
        const gateContract = this.toGateContract(order.instId);
        
        let size = parseFloat(order.sz || "0");
        if (order.side === "sell") {
          size = -size;
        }
        
        return {
          id: order.ordId,
          contract: gateContract,
          size: size.toString(),
          price: order.px || "0",
          fill_price: order.avgPx || "0",
          status: "finished",
          create_time: parseInt(order.cTime) / 1000,
          finish_time: parseInt(order.uTime) / 1000,
        };
      });
    } catch (error: any) {
      logger.error("获取订单历史失败:", error);
      throw error;
    }
  }
}

/**
 * 全局 OKX 客户端实例（单例模式）
 */
let okxClientInstance: OkxClient | null = null;

/**
 * 创建全局 OKX 客户端实例（单例模式）
 */
export function createOkxClient(): OkxClient {
  // 如果已存在实例，直接返回
  if (okxClientInstance) {
    return okxClientInstance;
  }

  const apiKey = process.env.OKX_API_KEY;
  const apiSecret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error("OKX_API_KEY、OKX_API_SECRET 和 OKX_API_PASSPHRASE 必须在环境变量中设置");
  }

  // 创建并缓存实例
  okxClientInstance = new OkxClient(apiKey, apiSecret, passphrase);
  return okxClientInstance;
}

