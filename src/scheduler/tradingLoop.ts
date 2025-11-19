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
 * 交易循环 - 定时执行交易决策
 */
import cron from "node-cron";
import { createLogger } from "../utils/loggerUtils";
import { createClient } from "@libsql/client";
import { createTradingAgent, generateTradingPrompt, getAccountRiskConfig, getTradingStrategy, getStrategyParams } from "../agents/tradingAgent";
import { createExchangeClient } from "../services/exchangeClient";
import { getChinaTimeISO } from "../utils/timeUtils";
import { RISK_PARAMS } from "../config/riskParams";
import { getQuantoMultiplier } from "../utils/contractUtils";

const logger = createLogger({
  name: "trading-loop",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

// 支持的币种 - 从配置中读取
const SYMBOLS = [...RISK_PARAMS.TRADING_SYMBOLS] as string[];

// 交易开始时间
let tradingStartTime = new Date();
let iterationCount = 0;

// 账户风险配置
let accountRiskConfig = getAccountRiskConfig();

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
 * 收集所有市场数据（包含多时间框架分析和时序数据）
 * 优化：增加数据验证和错误处理，返回时序数据用于提示词
 */
async function collectMarketData() {
  const exchangeClient = createExchangeClient();
  const marketData: Record<string, any> = {};

  for (const symbol of SYMBOLS) {
    try {
      const contract = `${symbol}_USDT`;
      
      // 获取价格（带重试）
      let ticker: any = null;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          ticker = await exchangeClient.getFuturesTicker(contract);
          
          // 验证价格数据有效性
          const price = Number.parseFloat(ticker.last || "0");
          if (price === 0 || !Number.isFinite(price)) {
            throw new Error(`价格无效: ${ticker.last}`);
          }
          
          break; // 成功，跳出重试循环
        } catch (error) {
          retryCount++;
          if (retryCount > maxRetries) {
            logger.error(`${symbol} 价格获取失败（${maxRetries}次重试）:`, error as any);
            throw error;
          }
          logger.warn(`${symbol} 价格获取失败，重试 ${retryCount}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // 获取所有时间框架的K线数据（优化后的配置，确保技术指标准确性）
      const candles1m = await exchangeClient.getFuturesCandles(contract, "1m", 150);   // 2.5小时，EMA50有充足验证数据
      const candles3m = await exchangeClient.getFuturesCandles(contract, "3m", 120);   // 6小时，覆盖半个交易日
      const candles5m = await exchangeClient.getFuturesCandles(contract, "5m", 100);   // 8.3小时，日内趋势分析
      const candles15m = await exchangeClient.getFuturesCandles(contract, "15m", 96);  // 24小时，完整一天
      const candles30m = await exchangeClient.getFuturesCandles(contract, "30m", 120); // 2.5天，中期趋势
      const candles1h = await exchangeClient.getFuturesCandles(contract, "1h", 168);   // 7天完整一周，周级别分析
      
      // 计算每个时间框架的指标
      const indicators1m = calculateIndicators(candles1m);
      const indicators3m = calculateIndicators(candles3m);
      const indicators5m = calculateIndicators(candles5m);
      const indicators15m = calculateIndicators(candles15m);
      const indicators30m = calculateIndicators(candles30m);
      const indicators1h = calculateIndicators(candles1h);
      
      // 计算3分钟时序指标（使用全部60个数据计算，但只显示最近10个数据点）
      const intradaySeries = calculateIntradaySeries(candles3m);
      
      // 计算1小时指标作为更长期上下文
      const longerTermContext = calculateLongerTermContext(candles1h);
      
      // 使用5分钟K线数据作为主要指标（兼容性）
      const indicators = indicators5m;
      
      // 验证技术指标有效性和数据完整性
      const dataTimestamp = getChinaTimeISO();
      const dataQuality = {
        price: Number.isFinite(Number.parseFloat(ticker.last || "0")),
        ema20: Number.isFinite(indicators.ema20),
        macd: Number.isFinite(indicators.macd),
        rsi14: Number.isFinite(indicators.rsi14) && indicators.rsi14 >= 0 && indicators.rsi14 <= 100,
        volume: Number.isFinite(indicators.volume) && indicators.volume >= 0,
        candleCount: {
          "1m": candles1m.length,
          "3m": candles3m.length,
          "5m": candles5m.length,
          "15m": candles15m.length,
          "30m": candles30m.length,
          "1h": candles1h.length,
        }
      };
      
      // 记录数据质量问题
      const issues: string[] = [];
      if (!dataQuality.price) issues.push("价格无效");
      if (!dataQuality.ema20) issues.push("EMA20无效");
      if (!dataQuality.macd) issues.push("MACD无效");
      if (!dataQuality.rsi14) issues.push("RSI14无效或超出范围");
      if (!dataQuality.volume) issues.push("成交量无效");
      if (indicators.volume === 0) issues.push("当前成交量为0");
      
      if (issues.length > 0) {
        logger.warn(`${symbol} 数据质量问题 [${dataTimestamp}]: ${issues.join(", ")}`);
        logger.debug(`${symbol} K线数量:`, dataQuality.candleCount);
      } else {
        logger.debug(`${symbol} 数据质量检查通过 [${dataTimestamp}]`);
      }
      
      // 获取资金费率
      let fundingRate = 0;
      try {
        const fr = await exchangeClient.getFundingRate(contract);
        fundingRate = Number.parseFloat(fr.r || "0");
        if (!Number.isFinite(fundingRate)) {
          fundingRate = 0;
        }
      } catch (error) {
        logger.warn(`获取 ${symbol} 资金费率失败:`, error as any);
      }
      
      // 获取未平仓合约（Open Interest）- Gate.io ticker中没有openInterest字段，暂时跳过
      let openInterest = { latest: 0, average: 0 };
      // Note: Gate.io ticker 数据中没有开放持仓量字段，如需可以使用其他API或外部数据源
      
      // 将各时间框架指标添加到市场数据
      marketData[symbol] = {
        price: Number.parseFloat(ticker.last || "0"),
        change24h: Number.parseFloat(ticker.change_percentage || "0"),
        volume24h: Number.parseFloat(ticker.volume_24h || "0"),
        fundingRate,
        openInterest,
        ...indicators,
        // 添加时序数据（参照 1.md 格式）
        intradaySeries,
        longerTermContext,
        // 直接添加各时间框架指标
        timeframes: {
          "1m": indicators1m,
          "3m": indicators3m,
          "5m": indicators5m,
          "15m": indicators15m,
          "30m": indicators30m,
          "1h": indicators1h,
        },
      };
      
      // 保存技术指标到数据库（确保所有数值都是有效的）
      await dbClient.execute({
        sql: `INSERT INTO trading_signals 
              (symbol, timestamp, price, ema_20, ema_50, macd, rsi_7, rsi_14, volume, funding_rate)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          symbol,
          getChinaTimeISO(),
          ensureFinite(marketData[symbol].price),
          ensureFinite(indicators.ema20),
          ensureFinite(indicators.ema50),
          ensureFinite(indicators.macd),
          ensureFinite(indicators.rsi7, 50), // RSI 默认 50
          ensureFinite(indicators.rsi14, 50),
          ensureFinite(indicators.volume),
          ensureFinite(fundingRate),
        ],
      });
    } catch (error) {
      logger.error(`收集 ${symbol} 市场数据失败:`, error as any);
    }
  }

  return marketData;
}

/**
 * 计算日内时序数据（3分钟级别）
 * 参照 1.md 格式
 * @param candles 全部历史数据（至少60个数据点）
 */
function calculateIntradaySeries(candles: any[]) {
  if (!candles || candles.length === 0) {
    return {
      midPrices: [],
      ema20Series: [],
      macdSeries: [],
      rsi7Series: [],
      rsi14Series: [],
    };
  }

  // 提取收盘价
  const closes = candles.map((c) => Number.parseFloat(c.c || "0")).filter(n => Number.isFinite(n));
  
  if (closes.length === 0) {
    return {
      midPrices: [],
      ema20Series: [],
      macdSeries: [],
      rsi7Series: [],
      rsi14Series: [],
    };
  }

  // 计算每个时间点的指标
  const midPrices = closes;
  const ema20Series: number[] = [];
  const macdSeries: number[] = [];
  const rsi7Series: number[] = [];
  const rsi14Series: number[] = [];

  // 为每个数据点计算指标（使用截至该点的所有历史数据）
  for (let i = 0; i < closes.length; i++) {
    const historicalPrices = closes.slice(0, i + 1);
    
    // EMA20 - 需要至少20个数据点
    ema20Series.push(historicalPrices.length >= 20 ? calcEMA(historicalPrices, 20) : historicalPrices[historicalPrices.length - 1]);
    
    // MACD - 需要至少26个数据点
    macdSeries.push(historicalPrices.length >= 26 ? calcMACD(historicalPrices) : 0);
    
    // RSI7 - 需要至少8个数据点
    rsi7Series.push(historicalPrices.length >= 8 ? calcRSI(historicalPrices, 7) : 50);
    
    // RSI14 - 需要至少15个数据点
    rsi14Series.push(historicalPrices.length >= 15 ? calcRSI(historicalPrices, 14) : 50);
  }

  // 只返回最近10个数据点
  const sliceIndex = Math.max(0, midPrices.length - 10);
  return {
    midPrices: midPrices.slice(sliceIndex),
    ema20Series: ema20Series.slice(sliceIndex),
    macdSeries: macdSeries.slice(sliceIndex),
    rsi7Series: rsi7Series.slice(sliceIndex),
    rsi14Series: rsi14Series.slice(sliceIndex),
  };
}

/**
 * 计算更长期的上下文数据（1小时级别 - 用于短线交易）
 * 参照 1.md 格式
 */
function calculateLongerTermContext(candles: any[]) {
  if (!candles || candles.length < 26) {
    return {
      ema20: 0,
      ema50: 0,
      atr3: 0,
      atr14: 0,
      currentVolume: 0,
      avgVolume: 0,
      macdSeries: [],
      rsi14Series: [],
    };
  }

  const closes = candles.map((c) => Number.parseFloat(c.c || "0")).filter(n => Number.isFinite(n));
  const highs = candles.map((c) => Number.parseFloat(c.h || "0")).filter(n => Number.isFinite(n));
  const lows = candles.map((c) => Number.parseFloat(c.l || "0")).filter(n => Number.isFinite(n));
  const volumes = candles.map((c) => Number.parseFloat(c.v || "0")).filter(n => Number.isFinite(n));

  // 计算 EMA
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);

  // 计算 ATR
  const atr3 = calcATR(highs, lows, closes, 3);
  const atr14 = calcATR(highs, lows, closes, 14);

  // 计算成交量
  const currentVolume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
  const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;

  // 计算最近10个数据点的 MACD 和 RSI14
  const macdSeries: number[] = [];
  const rsi14Series: number[] = [];
  
  const recentPoints = Math.min(10, closes.length);
  for (let i = closes.length - recentPoints; i < closes.length; i++) {
    const historicalPrices = closes.slice(0, i + 1);
    macdSeries.push(calcMACD(historicalPrices));
    rsi14Series.push(calcRSI(historicalPrices, 14));
  }

  return {
    ema20,
    ema50,
    atr3,
    atr14,
    currentVolume,
    avgVolume,
    macdSeries,
    rsi14Series,
  };
}

/**
 * 计算 ATR (Average True Range)
 */
function calcATR(highs: number[], lows: number[], closes: number[], period: number) {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // 计算平均
  const recentTR = trueRanges.slice(-period);
  const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
  
  return Number.isFinite(atr) ? atr : 0;
}

// 计算 EMA
function calcEMA(prices: number[], period: number) {
  if (prices.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return Number.isFinite(ema) ? ema : 0;
}

// 计算 RSI
function calcRSI(prices: number[], period: number) {
  if (prices.length < period + 1) return 50; // 数据不足，返回中性值
  
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  
  // 确保RSI在0-100范围内
  return ensureRange(rsi, 0, 100, 50);
}

// 计算 MACD
function calcMACD(prices: number[]) {
  if (prices.length < 26) return 0; // 数据不足
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macd = ema12 - ema26;
  return Number.isFinite(macd) ? macd : 0;
}

/**
 * 计算技术指标
 * 
 * K线数据格式：FuturesCandlestick 对象
 * {
 *   t: number,    // 时间戳
 *   v: number,    // 成交量
 *   c: string,    // 收盘价
 *   h: string,    // 最高价
 *   l: string,    // 最低价
 *   o: string,    // 开盘价
 *   sum: string   // 总成交额
 * }
 */
function calculateIndicators(candles: any[]) {
  if (!candles || candles.length === 0) {
    return {
      currentPrice: 0,
      ema20: 0,
      ema50: 0,
      macd: 0,
      rsi7: 50,
      rsi14: 50,
      volume: 0,
      avgVolume: 0,
    };
  }

  // 处理对象格式的K线数据（Gate.io API返回的是对象，不是数组）
  const closes = candles
    .map((c) => {
      // 如果是对象格式（FuturesCandlestick）
      if (c && typeof c === 'object' && 'c' in c) {
        return Number.parseFloat(c.c);
      }
      // 如果是数组格式（兼容旧代码）
      if (Array.isArray(c)) {
        return Number.parseFloat(c[2]);
      }
      return NaN;
    })
    .filter(n => Number.isFinite(n));

  const volumes = candles
    .map((c) => {
      // 如果是对象格式（FuturesCandlestick）
      if (c && typeof c === 'object' && 'v' in c) {
        const vol = Number.parseFloat(c.v);
        // 验证成交量：必须是有限数字且非负
        return Number.isFinite(vol) && vol >= 0 ? vol : 0;
      }
      // 如果是数组格式（兼容旧代码）
      if (Array.isArray(c)) {
        const vol = Number.parseFloat(c[1]);
        return Number.isFinite(vol) && vol >= 0 ? vol : 0;
      }
      return 0;
    })
    .filter(n => n >= 0); // 过滤掉负数成交量

  if (closes.length === 0 || volumes.length === 0) {
    return {
      currentPrice: 0,
      ema20: 0,
      ema50: 0,
      macd: 0,
      rsi7: 50,
      rsi14: 50,
      volume: 0,
      avgVolume: 0,
    };
  }

  return {
    currentPrice: ensureFinite(closes.at(-1) || 0),
    ema20: ensureFinite(calcEMA(closes, 20)),
    ema50: ensureFinite(calcEMA(closes, 50)),
    macd: ensureFinite(calcMACD(closes)),
    rsi7: ensureRange(calcRSI(closes, 7), 0, 100, 50),
    rsi14: ensureRange(calcRSI(closes, 14), 0, 100, 50),
    volume: ensureFinite(volumes.at(-1) || 0),
    avgVolume: ensureFinite(volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0),
  };
}

/**
 * 计算 Sharpe Ratio
 * 使用最近30天的账户历史数据
 */
async function calculateSharpeRatio(): Promise<number> {
  try {
    // 尝试获取所有账户历史数据（不限制30天）
    const result = await dbClient.execute({
      sql: `SELECT total_value, timestamp FROM account_history 
            ORDER BY timestamp ASC`,
      args: [],
    });
    
    if (!result.rows || result.rows.length < 2) {
      return 0; // 数据不足，返回0
    }
    
    // 计算每次交易的收益率（而不是每日）
    const returns: number[] = [];
    for (let i = 1; i < result.rows.length; i++) {
      const prevValue = Number.parseFloat(result.rows[i - 1].total_value as string);
      const currentValue = Number.parseFloat(result.rows[i].total_value as string);
      
      if (prevValue > 0) {
        const returnRate = (currentValue - prevValue) / prevValue;
        returns.push(returnRate);
      }
    }
    
    if (returns.length < 2) {
      return 0;
    }
    
    // 计算平均收益率
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // 计算收益率的标准差
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) {
      return avgReturn > 0 ? 10 : 0; // 无波动但有收益，返回高值
    }
    
    // Sharpe Ratio = (平均收益率 - 无风险利率) / 标准差
    // 假设无风险利率为0
    const sharpeRatio = avgReturn / stdDev;
    
    return Number.isFinite(sharpeRatio) ? sharpeRatio : 0;
  } catch (error) {
    logger.error("计算 Sharpe Ratio 失败:", error as any);
    return 0;
  }
}

/**
 * 获取账户信息
 * 
 * Gate.io 的 account.total 不包含未实现盈亏
 * 总资产（不含未实现盈亏）= account.total = available + positionMargin
 * 
 * 因此：
 * - totalBalance 不包含未实现盈亏
 * - returnPercent 反映已实现盈亏
 * - 前端显示时需加上 unrealisedPnl
 */
async function getAccountInfo() {
  const exchangeClient = createExchangeClient();
  
  try {
    const account = await exchangeClient.getFuturesAccount();
    
    // 从数据库获取初始资金
    const initialResult = await dbClient.execute(
      "SELECT total_value FROM account_history ORDER BY timestamp ASC LIMIT 1"
    );
    const initialBalance = initialResult.rows[0]
      ? Number.parseFloat(initialResult.rows[0].total_value as string)
      : 100;
    
    // 从数据库获取峰值净值
    const peakResult = await dbClient.execute(
      "SELECT MAX(total_value) as peak FROM account_history"
    );
    const peakBalance = peakResult.rows[0]?.peak 
      ? Number.parseFloat(peakResult.rows[0].peak as string)
      : initialBalance;
    
    // 从 Gate.io API 返回的数据中提取字段
    const accountTotal = Number.parseFloat(account.total || "0");
    const availableBalance = Number.parseFloat(account.available || "0");
    const unrealisedPnl = Number.parseFloat(account.unrealisedPnl || "0");
    
    // Gate.io 的 account.total 不包含未实现盈亏
    // totalBalance 直接使用 account.total（不包含未实现盈亏）
    const totalBalance = accountTotal;
    
    // 实时收益率 = (总资产 - 初始资金) / 初始资金 * 100
    // 总资产不包含未实现盈亏，收益率反映已实现盈亏
    const returnPercent = ((totalBalance - initialBalance) / initialBalance) * 100;
    
    // 计算 Sharpe Ratio
    const sharpeRatio = await calculateSharpeRatio();
    
    return {
      totalBalance,      // 总资产（不包含未实现盈亏）
      availableBalance,  // 可用余额
      unrealisedPnl,     // 未实现盈亏
      returnPercent,     // 收益率（不包含未实现盈亏）
      sharpeRatio,       // 夏普比率
      initialBalance,    // 初始净值（用于计算回撤）
      peakBalance,       // 峰值净值（用于计算回撤）
    };
  } catch (error) {
    logger.error("获取账户信息失败:", error as any);
    return {
      totalBalance: 0,
      availableBalance: 0,
      unrealisedPnl: 0,
      returnPercent: 0,
      sharpeRatio: 0,
      initialBalance: 0,
      peakBalance: 0,
    };
  }
}

/**
 * 从 Gate.io 同步持仓到数据库
 * 优化：确保持仓数据的准确性和完整性
 * 数据库中的持仓记录主要用于：
 * 1. 保存止损止盈订单ID等元数据
 * 2. 提供历史查询和监控页面展示
 * 实时持仓数据应该直接从 Gate.io 获取
 */
async function syncPositionsFromGate(cachedPositions?: any[]) {
  const exchangeClient = createExchangeClient();
  
  try {
    // 如果提供了缓存数据，使用缓存；否则重新获取
    const gatePositions = cachedPositions || await exchangeClient.getPositions();
    const dbResult = await dbClient.execute("SELECT symbol, sl_order_id, tp_order_id, stop_loss, profit_target, entry_order_id, opened_at, peak_pnl_percent, partial_close_percentage FROM positions");
    const dbPositionsMap = new Map(
      dbResult.rows.map((row: any) => [row.symbol, row])
    );
    
    // 检查 Gate.io 是否有持仓（可能 API 有延迟）
    const activeGatePositions = gatePositions.filter((p: any) => Number.parseInt(p.size || "0") !== 0);
    
    // 如果 Gate.io 返回0个持仓但数据库有持仓，可能是 API 延迟，不清空数据库
    if (activeGatePositions.length === 0 && dbResult.rows.length > 0) {
      logger.warn(`Gate.io 返回0个持仓，但数据库有 ${dbResult.rows.length} 个持仓，可能是 API 延迟，跳过同步`);
      return;
    }
    
    await dbClient.execute("DELETE FROM positions");
    
    let syncedCount = 0;
    
    for (const pos of gatePositions) {
      const size = Number.parseInt(pos.size || "0");
      if (size === 0) continue;
      
      const symbol = pos.contract.replace("_USDT", "");
      let entryPrice = Number.parseFloat(pos.entryPrice || "0");
      let currentPrice = Number.parseFloat(pos.markPrice || "0");
      const leverage = Number.parseInt(pos.leverage || "1");
      const side = size > 0 ? "long" : "short";
      const quantity = Math.abs(size);
      const unrealizedPnl = Number.parseFloat(pos.unrealisedPnl || "0");
      let liquidationPrice = Number.parseFloat(pos.liqPrice || "0");
      
      if (entryPrice === 0 || currentPrice === 0) {
        try {
          const ticker = await exchangeClient.getFuturesTicker(pos.contract);
          if (currentPrice === 0) {
            currentPrice = Number.parseFloat(ticker.markPrice || ticker.last || "0");
          }
          if (entryPrice === 0) {
            entryPrice = currentPrice;
          }
        } catch (error) {
          logger.error(`获取 ${symbol} 行情失败:`, error as any);
        }
      }
      
      if (liquidationPrice === 0 && entryPrice > 0) {
        liquidationPrice = side === "long" 
          ? entryPrice * (1 - 0.9 / leverage)
          : entryPrice * (1 + 0.9 / leverage);
      }
      
      const dbPos = dbPositionsMap.get(symbol);
      
      // 保留原有的 entry_order_id，不要覆盖
      const entryOrderId = dbPos?.entry_order_id || `synced-${symbol}-${Date.now()}`;
      
      await dbClient.execute({
        sql: `INSERT INTO positions 
              (symbol, quantity, entry_price, current_price, liquidation_price, unrealized_pnl, 
               leverage, side, stop_loss, profit_target, sl_order_id, tp_order_id, entry_order_id, opened_at, peak_pnl_percent, partial_close_percentage)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          symbol,
          quantity,
          entryPrice,
          currentPrice,
          liquidationPrice,
          unrealizedPnl,
          leverage,
          side,
          dbPos?.stop_loss || null,
          dbPos?.profit_target || null,
          dbPos?.sl_order_id || null,
          dbPos?.tp_order_id || null,
          entryOrderId, // 保留原有的订单ID
          dbPos?.opened_at || getChinaTimeISO(), // 保留原有的开仓时间
          dbPos?.peak_pnl_percent || 0, // 保留峰值盈利
          dbPos?.partial_close_percentage || 0, // 保留已平仓百分比（关键修复）
        ],
      });
      
      syncedCount++;
    }
    
    const activeGatePositionsCount = gatePositions.filter((p: any) => Number.parseInt(p.size || "0") !== 0).length;
    if (activeGatePositionsCount > 0 && syncedCount === 0) {
      logger.error(`Gate.io 有 ${activeGatePositionsCount} 个持仓，但数据库同步失败！`);
    }
    
  } catch (error) {
    logger.error("同步持仓失败:", error as any);
  }
}

/**
 * 获取持仓信息 - 直接从 Gate.io 获取最新数据
 * @param cachedGatePositions 可选，已获取的原始Gate持仓数据，避免重复调用API
 * @returns 格式化后的持仓数据
 */
async function getPositions(cachedGatePositions?: any[]) {
  const exchangeClient = createExchangeClient();
  
  try {
    // 如果提供了缓存数据，使用缓存；否则重新获取
    const gatePositions = cachedGatePositions || await exchangeClient.getPositions();
    
    // 从数据库获取持仓的开仓时间、峰值盈利和杠杆数（数据库中保存了正确的数据）
    const dbResult = await dbClient.execute("SELECT symbol, opened_at, peak_pnl_percent, leverage FROM positions");
    const dbDataMap = new Map(
      dbResult.rows.map((row: any) => [row.symbol, {
        opened_at: row.opened_at,
        peak_pnl_percent: Number.parseFloat(row.peak_pnl_percent as string || "0"),
        leverage: Number.parseInt(row.leverage as string || "1")
      }])
    );
    
    // 过滤并格式化持仓
    const positions = gatePositions
      .filter((p: any) => Number.parseInt(p.size || "0") !== 0)
      .map((p: any) => {
        const size = Number.parseInt(p.size || "0");
        const symbol = p.contract.replace("_USDT", "");
        
        // 从数据库读取开仓时间、峰值盈利和杠杆数
        const dbData = dbDataMap.get(symbol);
        let openedAt = dbData?.opened_at;
        const peakPnlPercent = dbData?.peak_pnl_percent || 0;
        const gateLeverage = Number.parseInt(p.leverage || "1");
        
        // 🔧 修复：优先使用数据库中记录的杠杆数（开仓时的杠杆数），而不是 Gate.io 的实时杠杆数
        const leverage = dbData?.leverage || gateLeverage;
        
        // 如果杠杆数不一致，记录警告
        if (dbData && gateLeverage !== leverage) {
          logger.warn(
            `⚠️ ${symbol} 杠杆数不一致: Gate.io=${gateLeverage}x, 数据库(开仓时)=${leverage}x. ` +
            `将使用开仓时的杠杆数 ${leverage}x。`
          );
        }
        
        // 如果数据库中没有开仓时间，尝试从Gate.io的create_time获取
        if (!openedAt && p.create_time) {
          // Gate.io的create_time是UNIX时间戳（秒），需要转换为ISO字符串
          if (typeof p.create_time === 'number') {
            openedAt = new Date(p.create_time * 1000).toISOString();
          } else {
            openedAt = p.create_time;
          }
        }
        
        // 如果还是没有，使用当前时间（这种情况不应该发生）
        if (!openedAt) {
          openedAt = getChinaTimeISO();
          logger.warn(`${symbol} 持仓的开仓时间缺失，使用当前时间`);
        }
        
        return {
          symbol,
          contract: p.contract,
          quantity: Math.abs(size),
          side: size > 0 ? "long" : "short",
          entry_price: Number.parseFloat(p.entryPrice || "0"),
          current_price: Number.parseFloat(p.markPrice || "0"),
          liquidation_price: Number.parseFloat(p.liqPrice || "0"),
          unrealized_pnl: Number.parseFloat(p.unrealisedPnl || "0"),
          leverage, // 使用数据库中的杠杆数
          margin: Number.parseFloat(p.margin || "0"),
          opened_at: openedAt,
          peak_pnl_percent: peakPnlPercent, // 添加峰值盈利字段
        };
      });
    
    return positions;
  } catch (error) {
    logger.error("获取持仓失败:", error as any);
    return [];
  }
}

/**
 * 获取历史成交记录（最近10条）
 * 从数据库获取历史交易记录（监控页的交易历史）
 */
async function getTradeHistory(limit: number = 10) {
  try {
    // 从数据库获取历史交易记录
    const result = await dbClient.execute({
      sql: `SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`,
      args: [limit],
    });
    
    if (!result.rows || result.rows.length === 0) {
      return [];
    }
    
    // 转换数据库格式到提示词需要的格式
    const trades = result.rows.map((row: any) => {
      return {
        symbol: row.symbol,
        side: row.side, // long/short
        type: row.type, // open/close
        price: Number.parseFloat(row.price || "0"),
        quantity: Number.parseFloat(row.quantity || "0"),
        leverage: Number.parseInt(row.leverage || "1"),
        pnl: row.pnl ? Number.parseFloat(row.pnl) : null,
        fee: Number.parseFloat(row.fee || "0"),
        timestamp: row.timestamp,
        status: row.status,
      };
    });
    
    // 按时间正序排列（最旧 → 最新）
    trades.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    return trades;
  } catch (error) {
    logger.error("获取历史成交记录失败:", error as any);
    return [];
  }
}

/**
 * 获取最近N次的AI决策记录
 */
async function getRecentDecisions(limit: number = 3) {
  try {
    const result = await dbClient.execute({
      sql: `SELECT timestamp, iteration, decision, account_value, positions_count 
            FROM agent_decisions 
            ORDER BY timestamp DESC 
            LIMIT ?`,
      args: [limit],
    });
    
    if (!result.rows || result.rows.length === 0) {
      return [];
    }
    
    // 返回格式化的决策记录（从旧到新）
    return result.rows.reverse().map((row: any) => ({
      timestamp: row.timestamp,
      iteration: row.iteration,
      decision: row.decision,
      account_value: Number.parseFloat(row.account_value || "0"),
      positions_count: Number.parseInt(row.positions_count || "0"),
    }));
  } catch (error) {
    logger.error("获取最近决策记录失败:", error as any);
    return [];
  }
}


/**
 * 同步风险配置到数据库
 */
async function syncConfigToDatabase() {
  try {
    const config = getAccountRiskConfig();
    const timestamp = getChinaTimeISO();
    
    // 更新或插入配置
    await dbClient.execute({
      sql: `INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)`,
      args: ['account_stop_loss_usdt', config.stopLossUsdt.toString(), timestamp],
    });
    
    await dbClient.execute({
      sql: `INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, ?)`,
      args: ['account_take_profit_usdt', config.takeProfitUsdt.toString(), timestamp],
    });
    
    logger.info(`配置已同步到数据库: 止损线=${config.stopLossUsdt} USDT, 止盈线=${config.takeProfitUsdt} USDT`);
  } catch (error) {
    logger.error("同步配置到数据库失败:", error as any);
  }
}

/**
 * 从数据库加载风险配置
 */
async function loadConfigFromDatabase() {
  try {
    const stopLossResult = await dbClient.execute({
      sql: `SELECT value FROM system_config WHERE key = ?`,
      args: ['account_stop_loss_usdt'],
    });
    
    const takeProfitResult = await dbClient.execute({
      sql: `SELECT value FROM system_config WHERE key = ?`,
      args: ['account_take_profit_usdt'],
    });
    
    if (stopLossResult.rows.length > 0 && takeProfitResult.rows.length > 0) {
      accountRiskConfig = {
        stopLossUsdt: Number.parseFloat(stopLossResult.rows[0].value as string),
        takeProfitUsdt: Number.parseFloat(takeProfitResult.rows[0].value as string),
        syncOnStartup: accountRiskConfig.syncOnStartup,
      };
      
      logger.info(`从数据库加载配置: 止损线=${accountRiskConfig.stopLossUsdt} USDT, 止盈线=${accountRiskConfig.takeProfitUsdt} USDT`);
    }
  } catch (error) {
    logger.warn("从数据库加载配置失败，使用环境变量配置:", error as any);
  }
}

/**
 * 修复历史盈亏记录
 * 每个周期结束时自动调用，确保所有交易记录的盈亏计算正确
 */
async function fixHistoricalPnlRecords() {
  try {
    // 查询所有平仓记录
    const result = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE type = 'close' ORDER BY timestamp DESC LIMIT 50`,
      args: [],
    });

    if (!result.rows || result.rows.length === 0) {
      return;
    }

    let fixedCount = 0;

    for (const closeTrade of result.rows) {
      const id = closeTrade.id;
      const symbol = closeTrade.symbol as string;
      const side = closeTrade.side as string;
      const closePrice = Number.parseFloat(closeTrade.price as string);
      const quantity = Number.parseFloat(closeTrade.quantity as string);
      const recordedPnl = Number.parseFloat(closeTrade.pnl as string || "0");
      const recordedFee = Number.parseFloat(closeTrade.fee as string || "0");
      const timestamp = closeTrade.timestamp as string;

      // 查找对应的开仓记录
      const openResult = await dbClient.execute({
        sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'open' AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`,
        args: [symbol, timestamp],
      });

      if (!openResult.rows || openResult.rows.length === 0) {
        continue;
      }

      const openTrade = openResult.rows[0];
      const openPrice = Number.parseFloat(openTrade.price as string);

      // 获取合约乘数
      const contract = `${symbol}_USDT`;
      const quantoMultiplier = await getQuantoMultiplier(contract);

      // 重新计算正确的盈亏
      const priceChange = side === "long" 
        ? (closePrice - openPrice) 
        : (openPrice - closePrice);
      
      const grossPnl = priceChange * quantity * quantoMultiplier;
      const openFee = openPrice * quantity * quantoMultiplier * 0.0005;
      const closeFee = closePrice * quantity * quantoMultiplier * 0.0005;
      const totalFee = openFee + closeFee;
      const correctPnl = grossPnl - totalFee;

      // 计算差异
      const pnlDiff = Math.abs(recordedPnl - correctPnl);
      const feeDiff = Math.abs(recordedFee - totalFee);

      // 如果差异超过0.5 USDT，就需要修复
      if (pnlDiff > 0.5 || feeDiff > 0.1) {
        logger.warn(`修复交易记录 ID=${id} (${symbol} ${side})`);
        logger.warn(`  盈亏: ${recordedPnl.toFixed(2)} → ${correctPnl.toFixed(2)} USDT (差异: ${pnlDiff.toFixed(2)})`);
        
        // 更新数据库
        await dbClient.execute({
          sql: `UPDATE trades SET pnl = ?, fee = ? WHERE id = ?`,
          args: [correctPnl, totalFee, id],
        });
        
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      logger.info(`修复了 ${fixedCount} 条历史盈亏记录`);
    }
  } catch (error) {
    logger.error("修复历史盈亏记录失败:", error as any);
  }
}

/**
 * 清仓所有持仓
 */
async function closeAllPositions(reason: string): Promise<void> {
  const exchangeClient = createExchangeClient();
  
  try {
    logger.warn(`清仓所有持仓，原因: ${reason}`);
    
    const positions = await exchangeClient.getPositions();
    const activePositions = positions.filter((p: any) => Number.parseInt(p.size || "0") !== 0);
    
    if (activePositions.length === 0) {
      return;
    }
    
    for (const pos of activePositions) {
      const size = Number.parseFloat(pos.size || "0"); // 修复：使用 parseFloat 而非 parseInt
      const contract = pos.contract;
      const symbol = contract.replace("_USDT", "");
      
      // 跳过无效的持仓
      if (size === 0 || !Number.isFinite(size)) {
        logger.warn(`跳过无效持仓: ${symbol}, size=${pos.size}`);
        continue;
      }
      
      try {
        await exchangeClient.placeOrder({
          contract,
          size: -size,
          price: 0, // 市价单必须传 price: 0
          reduceOnly: true, // 只减仓，不开新仓
        });
        
        logger.info(`已平仓: ${symbol} ${Math.abs(size)}张`);
      } catch (error) {
        logger.error(`平仓失败: ${symbol}`, error as any);
      }
    }
    
    logger.warn(`清仓完成`);
  } catch (error) {
    logger.error("清仓失败:", error as any);
    throw error;
  }
}

/**
 * 检查账户余额是否触发止损或止盈
 * @returns true: 触发退出条件, false: 继续运行
 */
async function checkAccountThresholds(accountInfo: any): Promise<boolean> {
  const totalBalance = accountInfo.totalBalance;
  
  // 检查止损线
  if (totalBalance <= accountRiskConfig.stopLossUsdt) {
    logger.error(`触发止损线！余额: ${totalBalance.toFixed(2)} USDT <= ${accountRiskConfig.stopLossUsdt} USDT`);
    await closeAllPositions(`账户余额触发止损线 (${totalBalance.toFixed(2)} USDT)`);
    return true;
  }
  
  // 检查止盈线
  if (totalBalance >= accountRiskConfig.takeProfitUsdt) {
    logger.warn(`触发止盈线！余额: ${totalBalance.toFixed(2)} USDT >= ${accountRiskConfig.takeProfitUsdt} USDT`);
    await closeAllPositions(`账户余额触发止盈线 (${totalBalance.toFixed(2)} USDT)`);
    return true;
  }
  
  return false;
}

/**
 * 执行交易决策
 * 优化：增强错误处理和数据验证，确保数据实时准确
 */
async function executeTradingDecision() {
  iterationCount++;
  const minutesElapsed = Math.floor((Date.now() - tradingStartTime.getTime()) / 60000);
  const intervalMinutes = Number.parseInt(process.env.TRADING_INTERVAL_MINUTES || "5");
  
  logger.info(`\n${"=".repeat(80)}`);
  logger.info(`交易周期 #${iterationCount} (运行${minutesElapsed}分钟)`);
  logger.info(`${"=".repeat(80)}\n`);

  let marketData: any = {};
  let accountInfo: any = null;
  let positions: any[] = [];

  try {
    // 1. 收集市场数据
    try {
      marketData = await collectMarketData();
      const validSymbols = SYMBOLS.filter(symbol => {
        const data = marketData[symbol];
        if (!data || data.price === 0) {
          return false;
        }
        return true;
      });
      
      if (validSymbols.length === 0) {
        logger.error("市场数据获取失败，跳过本次循环");
        return;
      }
    } catch (error) {
      logger.error("收集市场数据失败:", error as any);
      return;
    }
    
    // 2. 获取账户信息
    try {
      accountInfo = await getAccountInfo();
      
      if (!accountInfo || accountInfo.totalBalance === 0) {
        logger.error("账户数据异常，跳过本次循环");
        return;
      }
      
      // 检查账户余额是否触发止损或止盈
      const shouldExit = await checkAccountThresholds(accountInfo);
      if (shouldExit) {
        logger.error("账户余额触发退出条件，系统即将停止！");
        setTimeout(() => {
          process.exit(0);
        }, 5000);
        return;
      }
      
    } catch (error) {
      logger.error("获取账户信息失败:", error as any);
      return;
    }
    
    // 3. 同步持仓信息（优化：只调用一次API，避免重复）
    try {
      const exchangeClient = createExchangeClient();
      const rawGatePositions = await exchangeClient.getPositions();
      
      // 添加详细日志：显示原始持仓数据
      logger.info(`Gate.io 原始持仓数据: ${JSON.stringify(rawGatePositions.map((p: any) => ({
        contract: p.contract,
        size: p.size,
        entryPrice: p.entryPrice,
        unrealisedPnl: p.unrealisedPnl
      })))}`);
      
      // 使用同一份数据进行处理和同步，避免重复调用API
      positions = await getPositions(rawGatePositions);
      
      // 添加详细日志：显示处理后的持仓数据
      logger.info(`处理后的持仓数量: ${positions.length}`);
      if (positions.length > 0) {
        logger.info(`持仓详情: ${JSON.stringify(positions.map(p => ({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity,
          entry_price: p.entry_price,
          unrealized_pnl: p.unrealized_pnl
        })))}`);
      }
      
      await syncPositionsFromGate(rawGatePositions);
      
      const dbPositions = await dbClient.execute("SELECT COUNT(*) as count FROM positions");
      const dbCount = (dbPositions.rows[0] as any).count;
      
      if (positions.length !== dbCount) {
        logger.warn(`持仓同步不一致: Gate=${positions.length}, DB=${dbCount}`);
        // 再次同步，使用同一份数据
        await syncPositionsFromGate(rawGatePositions);
      }
    } catch (error) {
      logger.error("持仓同步失败:", error as any);
    }
    
    // 4. ====== 强制风控检查（在AI执行前） ======
    const exchangeClient = createExchangeClient();
    
    for (const pos of positions) {
      const symbol = pos.symbol;
      const side = pos.side;
      const leverage = pos.leverage;
      const entryPrice = pos.entry_price;
      const currentPrice = pos.current_price;
      
      // 计算盈亏百分比（考虑杠杆）
      const priceChangePercent = entryPrice > 0 
        ? ((currentPrice - entryPrice) / entryPrice * 100 * (side === 'long' ? 1 : -1))
        : 0;
      const pnlPercent = priceChangePercent * leverage;
      
      // 获取并更新峰值盈利
      let peakPnlPercent = 0;
      try {
        const dbPosResult = await dbClient.execute({
          sql: "SELECT peak_pnl_percent FROM positions WHERE symbol = ?",
          args: [symbol],
        });
        
        if (dbPosResult.rows.length > 0) {
          peakPnlPercent = Number.parseFloat(dbPosResult.rows[0].peak_pnl_percent as string || "0");
          
          // 如果当前盈亏超过历史峰值，更新峰值
          if (pnlPercent > peakPnlPercent) {
            peakPnlPercent = pnlPercent;
            await dbClient.execute({
              sql: "UPDATE positions SET peak_pnl_percent = ? WHERE symbol = ?",
              args: [peakPnlPercent, symbol],
            });
            logger.info(`${symbol} 峰值盈利更新: ${peakPnlPercent.toFixed(2)}%`);
          }
        }
      } catch (error: any) {
        logger.warn(`获取峰值盈利失败 ${symbol}: ${error.message}`);
      }
      
      let shouldClose = false;
      let closeReason = "";
      
      // a) 最大持仓时间强制平仓检查（从环境变量读取）
      const openedTime = new Date(pos.opened_at);
      const now = new Date();
      const holdingHours = (now.getTime() - openedTime.getTime()) / (1000 * 60 * 60);
      const MAX_HOLDING_HOURS = RISK_PARAMS.MAX_HOLDING_HOURS;
      
      if (holdingHours >= MAX_HOLDING_HOURS) {
        shouldClose = true;
        closeReason = `持仓时间已达 ${holdingHours.toFixed(1)} 小时，超过${MAX_HOLDING_HOURS}小时限制`;
      }
      
      // b) 极端止损保护（防止爆仓，最后的安全网）
      // 只在极端情况下强制平仓，避免账户爆仓
      // 常规止损由AI决策，这里只是最后的安全网
      const EXTREME_STOP_LOSS = RISK_PARAMS.EXTREME_STOP_LOSS_PERCENT; // 从环境变量读取
      
      logger.info(`${symbol} 极端止损检查: 当前盈亏=${pnlPercent.toFixed(2)}%, 极端止损线=${EXTREME_STOP_LOSS}%`);
      
      if (pnlPercent <= EXTREME_STOP_LOSS) {
        shouldClose = true;
        closeReason = `触发极端止损保护 (${pnlPercent.toFixed(2)}% ≤ ${EXTREME_STOP_LOSS}%，防止爆仓)`;
        logger.error(`${closeReason}`);
      }
      
      // c) 超短线策略专属风控规则
      const strategy = getTradingStrategy();
      if (strategy === 'ultra-short' && !shouldClose) {
        const holdingMinutes = holdingHours * 60;
        
        // 计算手续费成本（开仓 + 平仓，总共约 0.1%）
        // 考虑杠杆后，需要的盈利百分比 = 0.1% * 杠杆
        const feeThreshold = 0.1 * leverage;
        
        // 移动止盈的第一档触发阈值
        const params = getStrategyParams(strategy);
        const trailingStopTrigger = params.trailingStop.level1.trigger; // 4%
        
        // 规则1：每周期2%锁利规则（优先级最高）
        // 每个交易周期内，如果盈利 >2% 但未触发移动止盈（<4%），立即平仓锁定利润
        if (pnlPercent > 2 && pnlPercent < trailingStopTrigger) {
          shouldClose = true;
          closeReason = `超短线策略周期锁利规则：盈利${pnlPercent.toFixed(2)}% >2%，未达到移动止盈触发线${trailingStopTrigger}%，立即平仓锁定利润`;
          logger.info(`【超短线周期锁利】${symbol} ${closeReason}`);
        }
        
        // 规则2：30分钟盈利平仓规则（保底规则）
        // 如果持仓超过30分钟，处于盈利状态，但没有触发移动止盈，且覆盖了交易费，进行平仓
        if (!shouldClose && holdingMinutes >= 30 && pnlPercent > feeThreshold && pnlPercent < trailingStopTrigger) {
          shouldClose = true;
          closeReason = `超短线策略30分钟盈利平仓规则：持仓${holdingMinutes.toFixed(1)}分钟，盈利${pnlPercent.toFixed(2)}%（已覆盖手续费${feeThreshold.toFixed(2)}%），但未达到移动止盈触发线${trailingStopTrigger}%，执行保守平仓`;
          logger.info(`【超短线30分钟规则】${symbol} ${closeReason}`);
        }
      }
      
      // d) 其他风控检查已移除，交由AI全权决策
      // AI负责：止损、移动止盈、分批止盈、时间止盈、峰值回撤等策略性决策
      // 系统只保留底线安全保护（极端止损、最大持仓时间强制平仓、账户回撤保护）
      
      logger.info(`${symbol} 持仓监控: 盈亏=${pnlPercent.toFixed(2)}%, 持仓时间=${holdingHours.toFixed(1)}h, 峰值盈利=${peakPnlPercent.toFixed(2)}%, 杠杆=${leverage}x`);
      
      // 执行强制平仓
      if (shouldClose) {
        logger.warn(`【强制平仓】${symbol} ${side} - ${closeReason}`);
        
        // 验证持仓数量是否有效
        if (pos.quantity === 0 || !Number.isFinite(pos.quantity)) {
          logger.error(`无效的持仓数量: ${symbol}, quantity=${pos.quantity}`);
          continue;
        }
        
        try {
          const contract = `${symbol}_USDT`;
          const size = side === 'long' ? -pos.quantity : pos.quantity;
          
          // 1. 执行平仓订单
          const order = await exchangeClient.placeOrder({
            contract,
            size,
            price: 0,
            reduceOnly: true,
          });
          
          logger.info(`已下达强制平仓订单 ${symbol}，订单ID: ${order.id}`);
          
          // 2. 等待订单完成并获取成交信息（最多重试5次）
          let actualExitPrice = 0;
          let actualQuantity = Math.abs(pos.quantity);
          let pnl = 0;
          let totalFee = 0;
          let orderFilled = false;
          
          for (let retry = 0; retry < 5; retry++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
              const orderStatus = await exchangeClient.getOrder(order.id?.toString() || "");
              
              if (orderStatus.status === 'finished') {
                actualExitPrice = Number.parseFloat(orderStatus.fill_price || orderStatus.price || "0");
                actualQuantity = Math.abs(Number.parseFloat(orderStatus.size || "0"));
                orderFilled = true;
                
                // 获取合约乘数
                const quantoMultiplier = await getQuantoMultiplier(contract);
                
                // 计算盈亏
                const entryPrice = pos.entry_price;
                const priceChange = side === "long" 
                  ? (actualExitPrice - entryPrice) 
                  : (entryPrice - actualExitPrice);
                
                const grossPnl = priceChange * actualQuantity * quantoMultiplier;
                
                // 计算手续费（开仓 + 平仓）
                const openFee = entryPrice * actualQuantity * quantoMultiplier * 0.0005;
                const closeFee = actualExitPrice * actualQuantity * quantoMultiplier * 0.0005;
                totalFee = openFee + closeFee;
                
                // 净盈亏
                pnl = grossPnl - totalFee;
                
                logger.info(`平仓成交: 价格=${actualExitPrice}, 数量=${actualQuantity}, 盈亏=${pnl.toFixed(2)} USDT`);
                break;
              }
            } catch (statusError: any) {
              logger.warn(`查询订单状态失败 (重试${retry + 1}/5): ${statusError.message}`);
            }
          }
          
          // 3. 记录到trades表（无论是否成功获取详细信息都要记录）
          try {
            // 关键验证：检查盈亏计算是否正确
            const finalPrice = actualExitPrice || pos.current_price;
            const quantoMultiplier = await getQuantoMultiplier(contract);
            const notionalValue = finalPrice * actualQuantity * quantoMultiplier;
            const priceChangeCheck = side === "long" 
              ? (finalPrice - pos.entry_price) 
              : (pos.entry_price - finalPrice);
            const expectedPnl = priceChangeCheck * actualQuantity * quantoMultiplier - totalFee;
            
            // 检测盈亏是否被错误地设置为名义价值
            if (Math.abs(pnl - notionalValue) < Math.abs(pnl - expectedPnl)) {
              logger.error(`【强制平仓】检测到盈亏计算异常！`);
              logger.error(`  当前pnl: ${pnl.toFixed(2)} USDT 接近名义价值 ${notionalValue.toFixed(2)} USDT`);
              logger.error(`  预期pnl: ${expectedPnl.toFixed(2)} USDT`);
              logger.error(`  开仓价: ${pos.entry_price}, 平仓价: ${finalPrice}, 数量: ${actualQuantity}, 合约乘数: ${quantoMultiplier}`);
              
              // 强制修正为正确值
              pnl = expectedPnl;
              logger.warn(`  已自动修正pnl为: ${pnl.toFixed(2)} USDT`);
            }
            
            // 详细日志
            logger.info(`【强制平仓盈亏详情】${symbol} ${side}`);
            logger.info(`  原因: ${closeReason}`);
            logger.info(`  开仓价: ${pos.entry_price.toFixed(4)}, 平仓价: ${finalPrice.toFixed(4)}, 数量: ${actualQuantity}张`);
            logger.info(`  净盈亏: ${pnl.toFixed(2)} USDT, 手续费: ${totalFee.toFixed(4)} USDT`);
            
            await dbClient.execute({
              sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                order.id?.toString() || "",
                symbol,
                side,
                "close",
                finalPrice, // 使用验证后的价格
                actualQuantity,
                pos.leverage || 1,
                pnl, // 已验证和修正的盈亏
                totalFee,
                getChinaTimeISO(),
                orderFilled ? "filled" : "pending",
              ],
            });
            logger.info(`已记录强制平仓交易到数据库: ${symbol}, 盈亏=${pnl.toFixed(2)} USDT, 原因=${closeReason}`);
          } catch (dbError: any) {
            logger.error(`记录强制平仓交易失败: ${dbError.message}`);
            // 即使数据库写入失败，也记录到日志以便后续补救
            logger.error(`缺失的交易记录: ${JSON.stringify({
              order_id: order.id,
              symbol,
              side,
              type: "close",
              price: actualExitPrice,
              quantity: actualQuantity,
              pnl,
              reason: closeReason,
            })}`);
          }
          
          // 4. 从数据库删除持仓记录
          await dbClient.execute({
            sql: "DELETE FROM positions WHERE symbol = ?",
            args: [symbol],
          });
          
          logger.info(`强制平仓完成 ${symbol}，原因：${closeReason}`);
          
        } catch (closeError: any) {
          logger.error(`强制平仓失败 ${symbol}: ${closeError.message}`);
          // 即使失败也记录到日志
          logger.error(`强制平仓失败详情: symbol=${symbol}, side=${side}, quantity=${pos.quantity}, reason=${closeReason}`);
        }
      }
    }
    
    // 重新获取持仓（可能已经被强制平仓）
    positions = await getPositions();
    
    // 4. 不再保存账户历史（已移除资金曲线模块）
    // try {
    //   await saveAccountHistory(accountInfo);
    // } catch (error) {
    //   logger.error("保存账户历史失败:", error as any);
    //   // 不影响主流程
    // }
    
    // 5. 数据完整性最终检查
    const dataValid = 
      marketData && Object.keys(marketData).length > 0 &&
      accountInfo && accountInfo.totalBalance > 0 &&
      Array.isArray(positions);
    
    if (!dataValid) {
      logger.error("数据完整性检查失败，跳过本次循环");
      logger.error(`市场数据: ${Object.keys(marketData).length}, 账户: ${accountInfo?.totalBalance}, 持仓: ${positions.length}`);
      return;
    }
    
    // 6. 修复历史盈亏记录
    try {
      await fixHistoricalPnlRecords();
    } catch (error) {
      logger.warn("修复历史盈亏记录失败:", error as any);
      // 不影响主流程，继续执行
    }
    
    // 7. 获取历史成交记录（最近20条）
    let tradeHistory: any[] = [];
    try {
      tradeHistory = await getTradeHistory(20);
    } catch (error) {
      logger.warn("获取历史成交记录失败:", error as any);
      // 不影响主流程，继续执行
    }
    
    // 8. 获取最近的AI决策（最近5次）
    let recentDecisions: any[] = [];
    try {
      recentDecisions = await getRecentDecisions(5);
    } catch (error) {
      logger.warn("获取最近决策记录失败:", error as any);
      // 不影响主流程，继续执行
    }
    
    // 9. 生成提示词并调用 Agent
    const prompt = generateTradingPrompt({
      minutesElapsed,
      iteration: iterationCount,
      intervalMinutes,
      marketData,
      accountInfo,
      positions,
      tradeHistory,
      recentDecisions,
      positionCount: positions.length,
    });
    
    // 输出完整提示词到日志
    logger.info("【入参 - AI 提示词】");
    logger.info("=".repeat(80));
    logger.info(prompt);
    logger.info("=".repeat(80) + "\n");
    
    // 传递市场数据给Agent（用于子Agent）
    const agent = await createTradingAgent(intervalMinutes, marketData);
    
    try {
      // 设置足够大的 maxOutputTokens 以避免输出被截断
      // DeepSeek API 限制: max_tokens 范围为 [1, 8192]
      const response = await agent.generateText(prompt, {
        maxOutputTokens: 8192,
        maxSteps: 20,
        temperature: 0.4,
      });
      
      // 从响应中提取AI的完整回复，不进行任何切分
      let decisionText = "";
      
      // 添加调试日志，查看响应的原始结构
      logger.debug(`响应类型: ${typeof response}`);
      if (response && typeof response === 'object') {
        logger.debug(`响应结构: ${JSON.stringify(Object.keys(response))}`);
        const steps = (response as any).steps || [];
        logger.debug(`步骤数量: ${steps.length}`);
      }
      
      if (typeof response === 'string') {
        decisionText = response;
        logger.debug(`字符串响应长度: ${decisionText.length}`);
      } else if (response && typeof response === 'object') {
        const steps = (response as any).steps || [];
        
        // 收集所有AI的文本回复（完整保存，不切分）
        const allTexts: string[] = [];
        
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          logger.debug(`处理步骤 ${i + 1}/${steps.length}`);
          
          let stepText = "";
          
          // 优先从 step.content 中提取文本
          if (step.content && Array.isArray(step.content)) {
            logger.debug(`  内容项数量: ${step.content.length}`);
            const textItems: string[] = [];
            for (const item of step.content) {
              if (item.type === 'text' && item.text) {
                const textLength = item.text.length;
                logger.debug(`  提取文本内容，长度: ${textLength}`);
                textItems.push(item.text.trim());
              }
            }
            if (textItems.length > 0) {
              stepText = textItems.join('\n\n');
            }
          }
          
          // 如果 step.content 中没有内容，才检查 step.text
          if (!stepText && step.text && typeof step.text === 'string') {
            logger.debug(`  从 step.text 提取内容，长度: ${step.text.length}`);
            stepText = step.text.trim();
          }
          
          // 只添加非空文本，避免重复
          if (stepText) {
            allTexts.push(stepText);
          }
        }
        
        // 完整合并所有文本，用双换行分隔
        if (allTexts.length > 0) {
          decisionText = allTexts.join('\n\n');
          logger.debug(`合并后文本总长度: ${decisionText.length}`);
        }
        
        // 如果没有找到文本消息，尝试其他字段
        if (!decisionText) {
          decisionText = (response as any).text || (response as any).message || (response as any).content || "";
          logger.debug(`从备用字段提取，长度: ${decisionText.length}`);
        }
        
        // 如果还是没有文本回复，说明AI只是调用了工具，没有做出决策
        if (!decisionText && steps.length > 0) {
          decisionText = "AI调用了工具但未产生决策结果";
          logger.warn("AI 响应中未找到任何文本内容");
        }
      }
      
      logger.info("【输出 - AI 决策】");
      logger.info("=".repeat(80));
      logger.info(decisionText || "无决策输出");
      logger.info("=".repeat(80) + "\n");
      
      // 保存决策记录
      await dbClient.execute({
        sql: `INSERT INTO agent_decisions 
              (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          getChinaTimeISO(),
          iterationCount,
          JSON.stringify(marketData),
          decisionText,
          "[]",
          accountInfo.totalBalance,
          positions.length,
        ],
      });
      
      // Agent 执行后重新同步持仓数据（优化：只调用一次API）
      const updatedRawPositions = await exchangeClient.getPositions();
      await syncPositionsFromGate(updatedRawPositions);
      const updatedPositions = await getPositions(updatedRawPositions);
      
      // 重新获取更新后的账户信息，包含最新的未实现盈亏
      const updatedAccountInfo = await getAccountInfo();
      const finalUnrealizedPnL = updatedPositions.reduce((sum: number, pos: any) => sum + (pos.unrealized_pnl || 0), 0);
      
      logger.info("【最终 - 持仓状态】");
      logger.info("=".repeat(80));
      logger.info(`账户: ${updatedAccountInfo.totalBalance.toFixed(2)} USDT (可用: ${updatedAccountInfo.availableBalance.toFixed(2)}, 收益率: ${updatedAccountInfo.returnPercent.toFixed(2)}%)`);
      
      if (updatedPositions.length === 0) {
        logger.info("持仓: 无");
      } else {
        logger.info(`持仓: ${updatedPositions.length} 个`);
        updatedPositions.forEach((pos: any) => {
          // 计算盈亏百分比：考虑杠杆倍数
          // 对于杠杆交易：盈亏百分比 = (价格变动百分比) × 杠杆倍数
          const priceChangePercent = pos.entry_price > 0 
            ? ((pos.current_price - pos.entry_price) / pos.entry_price * 100 * (pos.side === 'long' ? 1 : -1))
            : 0;
          const pnlPercent = priceChangePercent * pos.leverage;
          logger.info(`  ${pos.symbol} ${pos.side === 'long' ? '做多' : '做空'} ${pos.quantity}张 (入场: ${pos.entry_price.toFixed(2)}, 当前: ${pos.current_price.toFixed(2)}, 盈亏: ${pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)} USDT / ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
        });
      }
      
      logger.info(`未实现盈亏: ${finalUnrealizedPnL >= 0 ? '+' : ''}${finalUnrealizedPnL.toFixed(2)} USDT`);
      logger.info("=".repeat(80) + "\n");
      
    } catch (agentError) {
      logger.error("Agent 执行失败:", agentError as any);
      try {
        await syncPositionsFromGate();
      } catch (syncError) {
        logger.error("同步失败:", syncError as any);
      }
    }
    
    // 每个周期结束时自动修复历史盈亏记录
    try {
      logger.info("检查并修复历史盈亏记录...");
      await fixHistoricalPnlRecords();
    } catch (fixError) {
      logger.error("修复历史盈亏失败:", fixError as any);
      // 不影响主流程，继续执行
    }
    
  } catch (error) {
    logger.error("交易循环执行失败:", error as any);
    try {
      await syncPositionsFromGate();
    } catch (recoveryError) {
      logger.error("恢复失败:", recoveryError as any);
    }
  }
}

/**
 * 初始化交易系统配置
 */
export async function initTradingSystem() {
  logger.info("初始化交易系统配置...");
  
  // 1. 加载配置
  accountRiskConfig = getAccountRiskConfig();
  logger.info(`环境变量配置: 止损线=${accountRiskConfig.stopLossUsdt} USDT, 止盈线=${accountRiskConfig.takeProfitUsdt} USDT`);
  
  // 2. 如果启用了启动时同步，则同步配置到数据库
  if (accountRiskConfig.syncOnStartup) {
    await syncConfigToDatabase();
  } else {
    // 否则从数据库加载配置
    await loadConfigFromDatabase();
  }
  
  logger.info(`最终配置: 止损线=${accountRiskConfig.stopLossUsdt} USDT, 止盈线=${accountRiskConfig.takeProfitUsdt} USDT`);
}

/**
 * 启动交易循环
 */
export function startTradingLoop() {
  const intervalMinutes = Number.parseInt(
    process.env.TRADING_INTERVAL_MINUTES || "5"
  );
  
  logger.info(`启动交易循环，间隔: ${intervalMinutes} 分钟`);
  logger.info(`支持币种: ${SYMBOLS.join(", ")}`);
  
  // 立即执行一次
  executeTradingDecision();
  
  // 设置定时任务
  const cronExpression = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpression, () => {
    executeTradingDecision();
  });
  
  logger.info(`定时任务已设置: ${cronExpression}`);
}

/**
 * 重置交易开始时间（用于恢复之前的交易）
 */
export function setTradingStartTime(time: Date) {
  tradingStartTime = time;
}

/**
 * 重置迭代计数（用于恢复之前的交易）
 */
export function setIterationCount(count: number) {
  iterationCount = count;
}

