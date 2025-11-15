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
 * 多时间框架分析模块（极简版 - 只提供原始数据）
 */

import { createLogger } from "../utils/loggerUtils";
import { createExchangeClient } from "./exchangeClient";

const logger = createLogger({
  name: "multi-timeframe",
  level: "info",
});

/**
 * 时间框架定义
 */
export interface TimeframeConfig {
  interval: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  candleCount: number;
  description: string;
}

// 标准时间框架配置 - 短线交易配置
export const TIMEFRAMES: Record<string, TimeframeConfig> = {
  VERY_SHORT: {
    interval: "1m",
    candleCount: 60,
    description: "1分钟",
  },
  SHORT_1: {
    interval: "3m",
    candleCount: 100,
    description: "3分钟",
  },
  SHORT: {
    interval: "5m",
    candleCount: 100,
    description: "5分钟",
  },
  SHORT_CONFIRM: {
    interval: "15m",
    candleCount: 96,
    description: "15分钟",
  },
  MEDIUM_SHORT: {
    interval: "30m",
    candleCount: 90,
    description: "30分钟",
  },
  MEDIUM: {
    interval: "1h",
    candleCount: 120,
    description: "1小时",
  },
};

/**
 * 确保数值是有效的有限数字，否则返回默认值
 */
function ensureFinite(value: number, defaultValue: number = 0): number {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}

/**
 * 确保数值在指定范围内
 */
function ensureRange(value: number, min: number, max: number, defaultValue?: number): number {
  if (!Number.isFinite(value)) {
    return defaultValue !== undefined ? defaultValue : (min + max) / 2;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 计算EMA
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ensureFinite(ema);
}

/**
 * 计算RSI
 */
function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) {
      gains += changes[i];
    } else {
      losses -= changes[i];
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period; i < changes.length; i++) {
    if (changes[i] >= 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - changes[i]) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  // 确保RSI在0-100范围内
  return ensureRange(rsi, 0, 100, 50);
}

/**
 * 计算MACD
 */
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  
  const macdLine = [];
  for (let i = 26; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    macdLine.push(e12 - e26);
  }
  
  const signal = calculateEMA(macdLine, 9);
  const histogram = macd - signal;
  
  return { 
    macd: ensureFinite(macd), 
    signal: ensureFinite(signal), 
    histogram: ensureFinite(histogram) 
  };
}

/**
 * 单个时间框架的原始数据
 */
export interface TimeframeIndicators {
  interval: string;
  currentPrice: number;
  
  // 均线
  ema20: number;
  ema50: number;
  
  // MACD
  macd: number;
  
  // RSI
  rsi14: number;
  
  // 成交量
  volume: number;
  avgVolume: number;
  
  // 价格变化
  priceChange20: number; // 最近20根K线变化%
}

/**
 * 分析单个时间框架（只计算原始指标）
 */
export async function analyzeTimeframe(
  symbol: string,
  config: TimeframeConfig
): Promise<TimeframeIndicators> {
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;
  
  // 获取K线数据
  const candles = await exchangeClient.getFuturesCandles(
    contract,
    config.interval,
    config.candleCount
  );
  
  if (!candles || candles.length === 0) {
    throw new Error(`无法获取 ${symbol} 的 ${config.interval} K线数据`);
  }
  
  // 提取价格和成交量数据
  const closes = candles.map((c: any) => Number.parseFloat(c.c)).filter((n: number) => Number.isFinite(n));
  const volumes = candles.map((c: any) => {
    const vol = Number.parseFloat(c.v);
    return Number.isFinite(vol) && vol >= 0 ? vol : 0;
  }).filter((n: number) => n >= 0);
  
  const currentPrice = closes[closes.length - 1] || 0;
  
  // 计算技术指标（原始值）
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  
  const { macd } = calculateMACD(closes);
  
  const rsi14 = calculateRSI(closes, 14);
  
  const avgVolume = volumes.length > 0 
    ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length 
    : 0;
  const currentVolume = volumes[volumes.length - 1] || 0;
  
  // 价格变化
  const priceChange20 = closes.length >= 21 && closes[closes.length - 21] !== 0
    ? ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100
    : 0;
  
  return {
    interval: config.interval,
    currentPrice: ensureFinite(currentPrice),
    ema20: ensureFinite(ema20),
    ema50: ensureFinite(ema50),
    macd: ensureFinite(macd),
    rsi14: ensureRange(rsi14, 0, 100, 50),
    volume: ensureFinite(currentVolume),
    avgVolume: ensureFinite(avgVolume),
    priceChange20: ensureFinite(priceChange20),
  };
}

/**
 * 多时间框架原始数据
 */
export interface MultiTimeframeAnalysis {
  symbol: string;
  timestamp: string;
  
  // 各时间框架原始数据
  timeframes: {
    veryshort?: TimeframeIndicators;
    short1?: TimeframeIndicators;
    short?: TimeframeIndicators;
    shortconfirm?: TimeframeIndicators;
    mediumshort?: TimeframeIndicators;
    medium?: TimeframeIndicators;
  };
  
  // 关键价位（支撑阻力）
  keyLevels: {
    resistance: number[];
    support: number[];
  };
}

/**
 * 执行多时间框架分析（极简版 - 只提供原始数据）
 */
export async function performMultiTimeframeAnalysis(
  symbol: string,
  timeframesToUse: string[] = ["VERY_SHORT", "SHORT_1", "SHORT", "SHORT_CONFIRM", "MEDIUM_SHORT", "MEDIUM"]
): Promise<MultiTimeframeAnalysis> {
  logger.info(`获取 ${symbol} 多时间框架数据...`);
  
  const timeframes: MultiTimeframeAnalysis["timeframes"] = {};
  
  // 并行获取所有时间框架数据
  const promises: Promise<any>[] = [];
  
  for (const tfName of timeframesToUse) {
    const config = TIMEFRAMES[tfName];
    if (!config) continue;
    
    promises.push(
      analyzeTimeframe(symbol, config)
        .then(data => {
          const key = tfName.toLowerCase().replace(/_/g, "");
          timeframes[key as keyof typeof timeframes] = data;
        })
        .catch(error => {
          logger.error(`获取 ${symbol} ${config.interval} 数据失败:`, error);
        })
    );
  }
  
  await Promise.all(promises);
  
  // 计算支撑阻力位（基于价格数据）
  const keyLevels = calculateKeyLevels(timeframes);
  
  const analysis: MultiTimeframeAnalysis = {
    symbol,
    timestamp: new Date().toISOString(),
    timeframes,
    keyLevels,
  };
  
  logger.info(`${symbol} 多时间框架数据获取完成`);
  
  return analysis;
}

/**
 * 计算关键价位（支撑阻力）
 */
function calculateKeyLevels(
  timeframes: MultiTimeframeAnalysis["timeframes"]
): MultiTimeframeAnalysis["keyLevels"] {
  const prices: number[] = [];
  
  // 收集所有时间框架的关键价格
  for (const [_, data] of Object.entries(timeframes)) {
    if (!data) continue;
    prices.push(data.currentPrice);
    prices.push(data.ema20);
    prices.push(data.ema50);
  }
  
  if (prices.length === 0) {
    return { resistance: [], support: [] };
  }
  
  // 简单的支撑阻力位计算（基于价格聚类）
  const currentPrice = timeframes.short?.currentPrice || timeframes.short1?.currentPrice || timeframes.medium?.currentPrice || 0;
  
  const resistance = prices
    .filter(p => p > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 3);
  
  const support = prices
    .filter(p => p < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 3);
  
  return {
    resistance,
    support,
  };
}
