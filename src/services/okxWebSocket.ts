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
 * OKX WebSocket 客户端
 * 用于订阅行情数据，避免 REST API 速率限制
 */
import WebSocket from "ws";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
  name: "okx-websocket",
  level: "info",
});

interface SubscriptionCallback {
  (data: any): void;
}

interface CandleCache {
  data: any[];
  lastUpdate: number;
}

/**
 * OKX WebSocket 客户端
 * 支持订阅 ticker、candles 等行情数据
 */
export class OkxWebSocketClient {
  private ws: WebSocket | null = null;
  private readonly wsUrl: string;
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private readonly reconnectDelay: number = 5000;
  private readonly pingInterval: number = 20000;
  private shouldReconnect: boolean = true;

  // 缓存最新的行情数据
  private tickerCache: Map<string, any> = new Map();
  private candleCache: Map<string, CandleCache> = new Map();

  constructor() {
    // OKX 公共频道 WebSocket 地址
    this.wsUrl = "wss://ws.okx.com:8443/ws/v5/public";
    logger.info("OKX WebSocket 客户端初始化");
  }

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnected || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info("连接 OKX WebSocket...");
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          logger.info("OKX WebSocket 连接成功");
          this.isConnected = true;
          this.startPing();
          
          // 重新订阅所有频道
          this.resubscribeAll();
          
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("error", (error) => {
          logger.error("OKX WebSocket 错误:", error);
          reject(error);
        });

        this.ws.on("close", () => {
          logger.warn("OKX WebSocket 连接关闭");
          this.isConnected = false;
          this.stopPing();
          
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        });

        // 连接超时处理
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error("WebSocket 连接超时"));
          }
        }, 10000);
      } catch (error) {
        logger.error("WebSocket 连接失败:", error);
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPing();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    logger.info("OKX WebSocket 已断开");
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleMessage(message: string): void {
    try {
      // 处理 pong 响应（pong 是纯字符串，不是 JSON）
      if (message === "pong") {
        return;
      }

      const data = JSON.parse(message);

      // 处理订阅响应
      if (data.event === "subscribe") {
        logger.info(`订阅成功: ${data.arg?.channel} ${data.arg?.instId || ""}`);
        return;
      }

      // 处理错误
      if (data.event === "error") {
        logger.error(`WebSocket 错误: ${data.msg} (code: ${data.code})`);
        return;
      }

      // 处理推送数据
      if (data.data && Array.isArray(data.data)) {
        const channel = data.arg?.channel;
        const instId = data.arg?.instId;

        if (channel === "tickers" && instId) {
          this.handleTickerUpdate(instId, data.data[0]);
        } else if (channel && channel.startsWith("candle") && instId) {
          this.handleCandleUpdate(instId, channel, data.data);
        }

        // 通知订阅者
        const key = this.getSubscriptionKey(channel, instId);
        const callbacks = this.subscriptions.get(key);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(data.data);
            } catch (error) {
              logger.error("订阅回调执行失败:", error);
            }
          });
        }
      }
    } catch (error) {
      logger.error("处理 WebSocket 消息失败:", error);
    }
  }

  /**
   * 处理 ticker 更新
   */
  private handleTickerUpdate(instId: string, ticker: any): void {
    this.tickerCache.set(instId, {
      ...ticker,
      updateTime: Date.now(),
    });
  }

  /**
   * 处理 candle 更新
   */
  private handleCandleUpdate(instId: string, channel: string, candles: any[]): void {
    const key = `${instId}:${channel}`;
    const existing = this.candleCache.get(key);

    if (existing) {
      // 更新或添加新的 K 线数据
      candles.forEach(newCandle => {
        const idx = existing.data.findIndex(c => c[0] === newCandle[0]);
        if (idx >= 0) {
          existing.data[idx] = newCandle;
        } else {
          existing.data.push(newCandle);
          // 保持最多 300 条数据
          if (existing.data.length > 300) {
            existing.data.shift();
          }
        }
      });
      existing.lastUpdate = Date.now();
    } else {
      this.candleCache.set(key, {
        data: candles,
        lastUpdate: Date.now(),
      });
    }
  }

  /**
   * 订阅频道
   */
  async subscribe(channel: string, instId?: string, callback?: SubscriptionCallback): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const arg: any = { channel };
    if (instId) {
      arg.instId = instId;
    }

    const subscribeMsg = {
      op: "subscribe",
      args: [arg],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscribeMsg));
      logger.info(`发送订阅请求: ${channel} ${instId || ""}`);

      // 保存回调
      if (callback) {
        const key = this.getSubscriptionKey(channel, instId);
        if (!this.subscriptions.has(key)) {
          this.subscriptions.set(key, new Set());
        }
        this.subscriptions.get(key)!.add(callback);
      }
    } else {
      throw new Error("WebSocket 未连接");
    }
  }

  /**
   * 取消订阅频道
   */
  async unsubscribe(channel: string, instId?: string): Promise<void> {
    const arg: any = { channel };
    if (instId) {
      arg.instId = instId;
    }

    const unsubscribeMsg = {
      op: "unsubscribe",
      args: [arg],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(unsubscribeMsg));
      logger.info(`取消订阅: ${channel} ${instId || ""}`);

      // 移除回调
      const key = this.getSubscriptionKey(channel, instId);
      this.subscriptions.delete(key);
    }
  }

  /**
   * 获取缓存的 ticker 数据
   */
  getCachedTicker(instId: string): any | null {
    const ticker = this.tickerCache.get(instId);
    
    // 如果数据超过 5 秒，认为过期
    if (ticker && Date.now() - ticker.updateTime < 5000) {
      return ticker;
    }
    
    return null;
  }

  /**
   * 获取缓存的 candles 数据
   */
  getCachedCandles(instId: string, interval: string): any[] | null {
    const channel = `candle${interval}`;
    const key = `${instId}:${channel}`;
    const cache = this.candleCache.get(key);
    
    // 如果数据超过 1 分钟，认为过期
    if (cache && Date.now() - cache.lastUpdate < 60000) {
      return cache.data;
    }
    
    return null;
  }

  /**
   * 等待 ticker 数据
   */
  async waitForTicker(instId: string, timeout: number = 5000): Promise<any> {
    // 先检查缓存
    const cached = this.getCachedTicker(instId);
    if (cached) {
      return cached;
    }

    // 订阅并等待数据
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`等待 ticker 数据超时: ${instId}`));
      }, timeout);

      const callback = (data: any) => {
        clearTimeout(timer);
        if (data && data.length > 0) {
          resolve(data[0]);
        }
      };

      this.subscribe("tickers", instId, callback).catch(reject);
    });
  }

  /**
   * 等待 candles 数据
   */
  async waitForCandles(instId: string, interval: string, timeout: number = 10000): Promise<any[]> {
    // 先检查缓存
    const cached = this.getCachedCandles(instId, interval);
    if (cached && cached.length > 0) {
      return cached;
    }

    // 订阅并等待数据
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`等待 candles 数据超时: ${instId} ${interval}`));
      }, timeout);

      const channel = `candle${interval}`;
      const callback = (data: any) => {
        clearTimeout(timer);
        if (data && data.length > 0) {
          resolve(data);
        }
      };

      this.subscribe(channel, instId, callback).catch(reject);
    });
  }

  /**
   * 重新订阅所有频道
   */
  private resubscribeAll(): void {
    this.subscriptions.forEach((callbacks, key) => {
      const [channel, instId] = this.parseSubscriptionKey(key);
      const arg: any = { channel };
      if (instId) {
        arg.instId = instId;
      }

      const subscribeMsg = {
        op: "subscribe",
        args: [arg],
      };

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(subscribeMsg));
        logger.info(`重新订阅: ${channel} ${instId || ""}`);
      }
    });
  }

  /**
   * 启动 ping
   */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, this.pingInterval);
  }

  /**
   * 停止 ping
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    logger.info(`${this.reconnectDelay / 1000} 秒后尝试重连...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(error => {
        logger.error("重连失败:", error);
      });
    }, this.reconnectDelay);
  }

  /**
   * 获取订阅键
   */
  private getSubscriptionKey(channel: string, instId?: string): string {
    return instId ? `${channel}:${instId}` : channel;
  }

  /**
   * 解析订阅键
   */
  private parseSubscriptionKey(key: string): [string, string | undefined] {
    const parts = key.split(":");
    return [parts[0], parts[1]];
  }

  /**
   * 获取连接状态
   */
  isWebSocketConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * 全局 WebSocket 客户端实例（单例模式）
 */
let wsClientInstance: OkxWebSocketClient | null = null;

/**
 * 获取全局 WebSocket 客户端实例
 */
export function getOkxWebSocketClient(): OkxWebSocketClient {
  if (!wsClientInstance) {
    wsClientInstance = new OkxWebSocketClient();
  }
  return wsClientInstance;
}

/**
 * 关闭全局 WebSocket 客户端
 */
export function closeOkxWebSocketClient(): void {
  if (wsClientInstance) {
    wsClientInstance.disconnect();
    wsClientInstance = null;
  }
}

