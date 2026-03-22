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
 * 交易执行工具
 */
import { createTool } from "@voltagent/core";
import { z } from "zod";
import { createExchangeClient } from "../../services/exchangeClient";
import { createClient } from "@libsql/client";
import { createLogger } from "../../utils/loggerUtils";
import { getChinaTimeISO } from "../../utils/timeUtils";
import { RISK_PARAMS } from "../../config/riskParams";
import { getQuantoMultiplier } from "../../utils/contractUtils";

const logger = createLogger({
  name: "trade-execution",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

function calculateLeveragedPnlPercent(
  entryPrice: number,
  currentPrice: number,
  side: "long" | "short",
  leverage: number,
): number {
  if (entryPrice <= 0 || currentPrice <= 0 || leverage <= 0) {
    return 0;
  }

  const priceChangePercent =
    ((currentPrice - entryPrice) / entryPrice) * 100 * (side === "long" ? 1 : -1);

  return priceChangePercent * leverage;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergePartialClosePercentage(
  alreadyClosedPercent: number,
  currentQuantity: number,
  closedQuantity: number,
): number {
  if (currentQuantity <= 0 || closedQuantity <= 0) {
    return alreadyClosedPercent;
  }

  const remainingPercent = Math.max(0, 100 - alreadyClosedPercent);
  const closedShareOfRemaining = Math.min(1, closedQuantity / currentQuantity);

  return Math.min(
    100,
    Number.parseFloat((alreadyClosedPercent + remainingPercent * closedShareOfRemaining).toFixed(4)),
  );
}

async function getProfitProtectionStopPercent(currentPnlPercent: number): Promise<number> {
  const { getTradingStrategy, getStrategyParams } = await import("../../agents/tradingAgent.js");
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  if (currentPnlPercent >= params.trailingStop.level3.trigger) {
    return params.trailingStop.level3.stopAt;
  }

  if (currentPnlPercent >= params.trailingStop.level2.trigger) {
    return params.trailingStop.level2.stopAt;
  }

  if (currentPnlPercent >= params.trailingStop.level1.trigger) {
    return params.trailingStop.level1.stopAt;
  }

  if (currentPnlPercent >= 1.5) {
    return 0.5;
  }

  if (currentPnlPercent >= 0.5) {
    return 0.2;
  }

  return 0;
}

const MIN_SAME_SYMBOL_COOLDOWN_CYCLES = 3;
const configuredSameSymbolCooldownCycles = Number.parseFloat(
  process.env.SAME_SYMBOL_COOLDOWN_CYCLES || `${MIN_SAME_SYMBOL_COOLDOWN_CYCLES}`,
);
const SAME_SYMBOL_COOLDOWN_CYCLES = Number.isFinite(configuredSameSymbolCooldownCycles)
  ? Math.max(MIN_SAME_SYMBOL_COOLDOWN_CYCLES, configuredSameSymbolCooldownCycles)
  : MIN_SAME_SYMBOL_COOLDOWN_CYCLES;

/**
 * 开仓工具
 */
export const openPositionTool = createTool({
  name: "openPosition",
  description: "开仓 - 做多或做空指定币种（使用市价单，立即以当前市场价格成交）。IMPORTANT: 开仓前必须先用getAccountBalance和getPositions工具查询可用资金和现有持仓，避免资金不足。交易手续费约0.05%，避免频繁交易。开仓时不设置止盈止损，你需要在每个周期主动决策是否平仓。",
  parameters: z.object({
    symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
    side: z.enum(["long", "short"]).describe("方向：long=做多，short=做空"),
    leverage: z.number().min(1).max(RISK_PARAMS.MAX_LEVERAGE).describe(`杠杆倍数（1-${RISK_PARAMS.MAX_LEVERAGE}倍，根据环境变量MAX_LEVERAGE配置）`),
    amountUsdt: z.number().describe("开仓金额（USDT）"),
  }),
  execute: async ({ symbol, side, leverage, amountUsdt }) => {
    // 开仓时不设置止盈止损，由 AI 在每个周期主动决策
    const stopLoss = undefined;
    const takeProfit = undefined;
    const client = createExchangeClient();
    const contract = `${symbol}_USDT`;
    
    try {
      const { getStrategyParams: getStrategyParamsForCheck, getTradingStrategy: getTradingStrategyForCheck } = await import("../../agents/tradingAgent.js");
      const currentStrategy = getTradingStrategyForCheck();
      const currentStrategyParams = getStrategyParamsForCheck(currentStrategy);

      //  参数验证
      if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
        return {
          success: false,
          message: `无效的开仓金额: ${amountUsdt}`,
        };
      }
      
      const effectiveMaxLeverage = Math.min(RISK_PARAMS.MAX_LEVERAGE, currentStrategyParams.leverageMax);

      if (!Number.isFinite(leverage) || leverage < currentStrategyParams.leverageMin || leverage > effectiveMaxLeverage) {
        return {
          success: false,
          message: `无效的杠杆倍数: ${leverage}（当前策略 ${currentStrategyParams.name} 必须在${currentStrategyParams.leverageMin}-${effectiveMaxLeverage}倍之间）`,
        };
      }
      
      // ====== 开仓前强制风控检查 ======
      
      // 1. 检查持仓数量（最多5个）
      const allPositions = await client.getPositions();
      const activePositions = allPositions.filter((p: any) => Math.abs(Number.parseInt(p.size || "0")) !== 0);
      
      if (activePositions.length >= RISK_PARAMS.MAX_POSITIONS) {
        return {
          success: false,
          message: `已达到最大持仓数量限制（${RISK_PARAMS.MAX_POSITIONS}个），当前持仓 ${activePositions.length} 个，无法开新仓`,
        };
      }
      
      // 2. 检查该币种是否已有持仓（禁止双向持仓）
      const existingPosition = activePositions.find((p: any) => {
        const posSymbol = p.contract.replace("_USDT", "");
        return posSymbol === symbol;
      });
      
      if (existingPosition) {
        const existingSize = Number.parseInt(existingPosition.size || "0");
        const existingSide = existingSize > 0 ? "long" : "short";
        
        if (existingSide !== side) {
          return {
            success: false,
            message: `${symbol} 已有${existingSide === "long" ? "多" : "空"}单持仓，禁止同时持有双向持仓。请先平掉${existingSide === "long" ? "多" : "空"}单后再开${side === "long" ? "多" : "空"}单。`,
          };
        }
        
        // 如果方向相同，允许加仓（但需要注意总持仓限制）
        logger.info(`${symbol} 已有${side === "long" ? "多" : "空"}单持仓，允许加仓`);
      }
      
      // 3. 🔒 检查该币种是否在同一周期内刚平仓（防止平仓后立即重新开仓）
      const recentCloseResult = await dbClient.execute({
        sql: `SELECT timestamp FROM trades 
              WHERE symbol = ? AND type = 'close' 
              ORDER BY timestamp DESC LIMIT 1`,
        args: [symbol],
      });
      
      if (recentCloseResult.rows.length > 0) {
        const closeTime = new Date(recentCloseResult.rows[0].timestamp as string).getTime();
        const now = Date.now();
        const minutesSinceClose = (now - closeTime) / (1000 * 60);
        const intervalMinutes = Number.parseInt(process.env.TRADING_INTERVAL_MINUTES || "5");
        const cooldownMinutes = intervalMinutes * SAME_SYMBOL_COOLDOWN_CYCLES;

        // 如果距离上次平仓时间不足 3 个交易周期，拒绝开仓
        if (minutesSinceClose < cooldownMinutes) {
          return {
            success: false,
            message: `拒绝开仓 ${symbol}：该币种在 ${minutesSinceClose.toFixed(1)} 分钟前刚平仓，需要等待至少 ${cooldownMinutes.toFixed(1)} 分钟（${SAME_SYMBOL_COOLDOWN_CYCLES} 个交易周期）后才能重新开仓。这是为了防止同一币种短时间内连续试错。`,
          };
        }
        
        logger.info(`${symbol} 距离上次平仓已 ${minutesSinceClose.toFixed(1)} 分钟，通过冷静期检查（冷静期：${cooldownMinutes.toFixed(1)}分钟 / ${SAME_SYMBOL_COOLDOWN_CYCLES}个周期）`);
      }
      
      // 4. 获取账户信息
      const account = await client.getFuturesAccount();
      const unrealisedPnl = Number.parseFloat(account.unrealisedPnl || "0");
      const totalBalance = Number.parseFloat(account.total || "0") - unrealisedPnl;
      const availableBalance = Number.parseFloat(account.available || "0");
      
      if (!Number.isFinite(availableBalance) || availableBalance <= 0) {
        return {
          success: false,
          message: `账户可用资金异常: ${availableBalance} USDT`,
        };
      }

      const positionSizeMinPercent = Math.max(
        0,
        Math.min(currentStrategyParams.positionSizeMin || 0, currentStrategyParams.positionSizeMax || 100),
      );
      const minSinglePosition = totalBalance * (positionSizeMinPercent / 100);

      if (amountUsdt < minSinglePosition) {
        logger.info(
          `提升 ${symbol} 开仓金额 ${amountUsdt.toFixed(2)} → ${minSinglePosition.toFixed(2)} USDT，匹配 ${currentStrategyParams.name} 策略最小仓位 ${positionSizeMinPercent}%`,
        );
        amountUsdt = minSinglePosition;
      }
      
      // 5. 检查账户回撤（从峰值回撤超过阈值时禁止开仓）
      const peakBalanceResult = await dbClient.execute(
        "SELECT MAX(total_value) as peak FROM account_history"
      );
      const peakBalance = peakBalanceResult.rows[0]?.peak
        ? Number.parseFloat(peakBalanceResult.rows[0].peak as string)
        : totalBalance;

      const drawdownFromPeak = peakBalance > 0
        ? ((peakBalance - totalBalance) / peakBalance) * 100
        : 0;

      if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT) {
        return {
          success: false,
          message: `账户回撤已达 ${drawdownFromPeak.toFixed(2)}% ≥ ${RISK_PARAMS.ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT}%，触发风控保护，禁止新开仓。请等待账户回升后再交易。`,
        };
      }

      if (drawdownFromPeak >= RISK_PARAMS.ACCOUNT_DRAWDOWN_WARNING_PERCENT) {
        logger.warn(`⚠️ 账户回撤 ${drawdownFromPeak.toFixed(2)}% 已达警告阈值 ${RISK_PARAMS.ACCOUNT_DRAWDOWN_WARNING_PERCENT}%，请谨慎交易`);
      }

      // 6. 检查总敞口（不超过账户净值的15倍）
      let currentTotalExposure = 0;
      for (const pos of activePositions) {
        const posSize = Math.abs(Number.parseInt(pos.size || "0"));
        const entryPrice = Number.parseFloat(pos.entryPrice || "0");
        const posLeverage = Number.parseInt(pos.leverage || "1");
        // 获取合约乘数
        const posQuantoMultiplier = await getQuantoMultiplier(pos.contract);
        const posValue = posSize * entryPrice * posQuantoMultiplier;
        currentTotalExposure += posValue;
      }
      
      const newExposure = amountUsdt * leverage;
      const totalExposure = currentTotalExposure + newExposure;
      const maxAllowedExposure = totalBalance * RISK_PARAMS.MAX_LEVERAGE; // 使用配置的最大杠杆
      
      if (totalExposure > maxAllowedExposure) {
        return {
          success: false,
          message: `新开仓将导致总敞口 ${totalExposure.toFixed(2)} USDT 超过限制 ${maxAllowedExposure.toFixed(2)} USDT（账户净值的${RISK_PARAMS.MAX_LEVERAGE}倍），拒绝开仓`,
        };
      }
      
      // 7. 检查单笔仓位（强制不超过策略的 positionSizeMax）
      const positionSizeMaxPercent = currentStrategyParams.positionSizeMax || 30;
      const maxSinglePosition = totalBalance * (positionSizeMaxPercent / 100);
      if (amountUsdt > maxSinglePosition) {
        return {
          success: false,
          message: `开仓金额 ${amountUsdt.toFixed(2)} USDT 超过策略允许的最大仓位 ${maxSinglePosition.toFixed(2)} USDT（账户净值的${positionSizeMaxPercent}%），拒绝开仓`,
        };
      }

      // 8. 检查总保证金占比（如果策略定义了 maxTotalMarginPercent）
      if (currentStrategyParams.maxTotalMarginPercent) {
        let currentTotalMargin = 0;
        for (const pos of activePositions) {
          const posSize = Math.abs(Number.parseInt(pos.size || "0"));
          const entryPrice = Number.parseFloat(pos.entryPrice || "0");
          const posLeverage = Number.parseInt(pos.leverage || "1");
          const posQuantoMult = await getQuantoMultiplier(pos.contract);
          const posMargin = (posSize * entryPrice * posQuantoMult) / posLeverage;
          currentTotalMargin += posMargin;
        }
        const newMargin = amountUsdt;
        const totalMargin = currentTotalMargin + newMargin;
        const maxTotalMargin = totalBalance * (currentStrategyParams.maxTotalMarginPercent / 100);

        if (totalMargin > maxTotalMargin) {
          return {
            success: false,
            message: `新开仓将导致总保证金 ${totalMargin.toFixed(2)} USDT 超过策略限制 ${maxTotalMargin.toFixed(2)} USDT（账户净值的${currentStrategyParams.maxTotalMarginPercent}%），拒绝开仓`,
          };
        }
      }
      
      // ====== 流动性保护检查 ======
      
      // 1. 检查交易时段（UTC时间）
      const now = new Date();
      const hourUTC = now.getUTCHours();
      const dayOfWeek = now.getUTCDay(); // 0=周日，6=周六
      
      // 低流动性时段警告（UTC 2:00-6:00，亚洲时段凌晨）
      if (hourUTC >= 2 && hourUTC <= 6) {
        logger.warn(`⚠️  当前处于低流动性时段 (UTC ${hourUTC}:00)，建议谨慎交易`);
        // 在低流动性时段降低仓位
        amountUsdt = Math.max(10, amountUsdt * 0.7);
      }
      
      // 周末流动性检查
      if ((dayOfWeek === 5 && hourUTC >= 22) || dayOfWeek === 6 || (dayOfWeek === 0 && hourUTC < 20)) {
        logger.warn(`⚠️  当前处于周末时段，流动性可能较低`);
        amountUsdt = Math.max(10, amountUsdt * 0.8);
      }
      
      // 2. 检查订单簿深度（确保有足够流动性）
      try {
        const orderBook = await client.getOrderBook(contract, 5); // 获取前5档订单
        
        if (orderBook && orderBook.bids && orderBook.bids.length > 0) {
          // 计算买单深度（前5档）
          const bidDepth = orderBook.bids.slice(0, 5).reduce((sum: number, bid: any) => {
            const price = Number.parseFloat(bid.p);
            const size = Number.parseFloat(bid.s);
            return sum + price * size;
          }, 0);
          
          // 要求订单簿深度至少是开仓金额的5倍
          const requiredDepth = amountUsdt * leverage * 5;
          
          if (bidDepth < requiredDepth) {
            return {
              success: false,
              message: `流动性不足：订单簿深度 ${bidDepth.toFixed(2)} USDT < 所需 ${requiredDepth.toFixed(2)} USDT`,
            };
          }
          
          logger.info(`✅ 流动性检查通过：订单簿深度 ${bidDepth.toFixed(2)} USDT >= 所需 ${requiredDepth.toFixed(2)} USDT`);
        }
      } catch (error) {
        logger.warn(`获取订单簿失败: ${error}`);
        // 如果无法获取订单簿，发出警告但继续
      }
      
      // ====== 波动率自适应调整 ======
      
      // 获取当前策略和市场数据
      const { getStrategyParams, getTradingStrategy } = await import("../../agents/tradingAgent.js");
      const strategy = getTradingStrategy();
      const strategyParams = getStrategyParams(strategy);
      
      let adjustedLeverage = leverage;
      let adjustedAmountUsdt = amountUsdt;
      
      // 从market data中获取ATR（需要从上下文传入）
      // 这里先计算ATR百分比
      let atrPercent = 0;
      let volatilityLevel = "normal";
      
      try {
        // 获取市场数据（包含ATR）
        const marketDataModule = await import("../trading/marketData.js");
        const ticker = await client.getFuturesTicker(contract);
        const currentPrice = Number.parseFloat(ticker.last || "0");
        
        // 获取1小时K线计算ATR
        const candles1h = await client.getFuturesCandles(contract, "1h", 24);
        if (candles1h && candles1h.length > 14) {
          // 计算ATR14
          const trs = [];
          for (let i = 1; i < candles1h.length; i++) {
            const high = Number.parseFloat(candles1h[i].h);
            const low = Number.parseFloat(candles1h[i].l);
            const prevClose = Number.parseFloat(candles1h[i - 1].c);
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
          }
          const atr14 = trs.slice(-14).reduce((a, b) => a + b, 0) / 14;
          atrPercent = (atr14 / currentPrice) * 100;
          
          // 确定波动率级别
          if (atrPercent > 5) {
            volatilityLevel = "high";
          } else if (atrPercent < 2) {
            volatilityLevel = "low";
          }
        }
      } catch (error) {
        logger.warn(`计算波动率失败: ${error}`);
      }
      
      // 根据波动率调整参数
      if (volatilityLevel === "high") {
        const adjustment = strategyParams.volatilityAdjustment.highVolatility;
        adjustedLeverage = Math.max(currentStrategyParams.leverageMin, Math.round(leverage * adjustment.leverageFactor));
        adjustedAmountUsdt = Math.max(10, amountUsdt * adjustment.positionFactor);
        logger.info(`🌊 高波动市场 (ATR ${atrPercent.toFixed(2)}%)：杠杆 ${leverage}x → ${adjustedLeverage}x，仓位 ${amountUsdt.toFixed(0)} → ${adjustedAmountUsdt.toFixed(0)} USDT`);
      } else if (volatilityLevel === "low") {
        const adjustment = strategyParams.volatilityAdjustment.lowVolatility;
        adjustedLeverage = Math.min(effectiveMaxLeverage, Math.max(currentStrategyParams.leverageMin, Math.round(leverage * adjustment.leverageFactor)));
        adjustedAmountUsdt = Math.min(
          totalBalance * ((currentStrategyParams.positionSizeMax || 32) / 100),
          amountUsdt * adjustment.positionFactor,
        );
        logger.info(`🌊 低波动市场 (ATR ${atrPercent.toFixed(2)}%)：杠杆 ${leverage}x → ${adjustedLeverage}x，仓位 ${amountUsdt.toFixed(0)} → ${adjustedAmountUsdt.toFixed(0)} USDT`);
      } else {
        logger.info(`🌊 正常波动市场 (ATR ${atrPercent.toFixed(2)}%)：保持原始参数`);
      }
      
      // ====== 风控检查通过，继续开仓 ======
      
      // 设置杠杆（使用调整后的杠杆）
      await client.setLeverage(contract, adjustedLeverage);
      
      // 获取当前价格和合约信息
      const ticker = await client.getFuturesTicker(contract);
      const currentPrice = Number.parseFloat(ticker.last || "0");
      const contractInfo = await client.getContractInfo(contract);
      
      // Gate.io 永续合约的保证金计算
      // 注意：Gate.io 使用"张数"作为单位，每张合约代表一定数量的币
      // 对于 BTC_USDT: 1张 = 0.0001 BTC
      // 保证金计算：保证金 = (张数 * quantoMultiplier * 价格) / 杠杆
      
      // 获取合约乘数
      const quantoMultiplier = await getQuantoMultiplier(contract);
      // 兼容 Gate（下划线命名）和 OKX（驼峰命名）
      const minSize = Number.parseFloat(contractInfo.orderSizeMin || contractInfo.order_size_min || "1");
      const maxSize = Number.parseFloat(contractInfo.orderSizeMax || contractInfo.order_size_max || "1000000");
      // OKX 使用 lotSize，Gate 使用 order_size_round
      const lotSize = Number.parseFloat(contractInfo.lotSize || contractInfo.order_size_round || "1");
      
      // 计算可以开多少张合约
      // adjustedAmountUsdt = (quantity * quantoMultiplier * currentPrice) / leverage
      // => quantity = (adjustedAmountUsdt * leverage) / (quantoMultiplier * currentPrice)
      let quantity = (adjustedAmountUsdt * leverage) / (quantoMultiplier * currentPrice);
      
      // 根据 lotSize 调整数量精度（向上取整到最接近的有效精度）
      // 例如：lotSize=0.01，quantity=0.123 -> 向上取整到 0.13
      if (lotSize > 0) {
        quantity = Math.ceil(quantity / lotSize) * lotSize;
      } else {
        // 如果没有 lotSize 信息，默认向上取整到整数
        quantity = Math.ceil(quantity);
      }
      
      // 确保数量在允许范围内
      quantity = Math.max(quantity, minSize);
      quantity = Math.min(quantity, maxSize);
      
      // 再次应用精度调整（确保 max/min 调整后仍符合精度要求）
      if (lotSize > 0) {
        quantity = Math.round(quantity / lotSize) * lotSize;
        // 修正浮点数精度问题
        const decimals = (lotSize.toString().split('.')[1] || '').length;
        quantity = Number.parseFloat(quantity.toFixed(decimals));
      }
      
      let size = side === "long" ? quantity : -quantity;
      
      // 最后验证：如果 size 为 0 或者太小，放弃开仓
      if (Math.abs(size) < minSize) {
        const minMargin = (minSize * quantoMultiplier * currentPrice) / leverage;
        return {
          success: false,
          message: `计算的数量 ${Math.abs(size)} 张小于最小限制 ${minSize} 张，需要至少 ${minMargin.toFixed(2)} USDT 保证金（当前${adjustedAmountUsdt.toFixed(2)} USDT，杠杆${leverage}x）`,
        };
      }
      
      // 计算实际使用的保证金
      let actualMargin = (Math.abs(size) * quantoMultiplier * currentPrice) / leverage;
      
      logger.info(`开仓 ${symbol} ${side === "long" ? "做多" : "做空"} ${Math.abs(size)}张 (杠杆${leverage}x)`);
      
      //  市价单开仓（不设置止盈止损）
      const order = await client.placeOrder({
        contract,
        size,
        price: 0,  // 市价单必须传 price: 0
      });
      
      //  等待并验证订单状态（带重试）
      // 增加等待时间，确保 Gate.io API 更新持仓信息
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      //  检查订单状态并获取实际成交价格（最多重试3次）
      let finalOrderStatus = order.status;
      let actualFillSize = 0;
      let actualFillPrice = currentPrice; // 默认使用当前价格
      
      if (order.id) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const orderDetail = await client.getOrder(order.id.toString());
            finalOrderStatus = orderDetail.status;
            actualFillSize = Math.abs(Number.parseInt(orderDetail.size || "0") - Number.parseInt(orderDetail.left || "0"));
            
            //  获取实际成交价格（fill_price 或 average price）
            if (orderDetail.fill_price && Number.parseFloat(orderDetail.fill_price) > 0) {
              actualFillPrice = Number.parseFloat(orderDetail.fill_price);
            } else if (orderDetail.price && Number.parseFloat(orderDetail.price) > 0) {
              actualFillPrice = Number.parseFloat(orderDetail.price);
            }
            
            logger.info(`成交: ${actualFillSize}张 @ ${actualFillPrice.toFixed(2)} USDT`);
            
            //  验证成交价格的合理性（滑点保护）
            const priceDeviation = Math.abs(actualFillPrice - currentPrice) / currentPrice;
            if (priceDeviation > 0.02) {
              // 滑点超过2%，拒绝此次交易（回滚）
              logger.error(`❌ 成交价偏离超过2%: ${currentPrice.toFixed(2)} → ${actualFillPrice.toFixed(2)} (偏离 ${(priceDeviation * 100).toFixed(2)}%)，拒绝交易`);
              
              // 尝试平仓回滚（如果已经成交）
              try {
                await client.placeOrder({
                  contract,
                  size: -size,
                  price: 0,
                  reduceOnly: true,
                });
                logger.info(`已回滚交易`);
              } catch (rollbackError: any) {
                logger.error(`回滚失败: ${rollbackError.message}，请手动处理`);
              }
              
              return {
                success: false,
                message: `开仓失败：成交价偏离超过2% (${currentPrice.toFixed(2)} → ${actualFillPrice.toFixed(2)})，已拒绝交易`,
              };
            }
            
            // 如果订单被取消或未成交，返回失败
            if (finalOrderStatus === 'cancelled' || actualFillSize === 0) {
              return {
                success: false,
                message: `开仓失败：订单${finalOrderStatus === 'cancelled' ? '被取消' : '未成交'}（订单ID: ${order.id}）`,
              };
            }
            
            // 成功获取订单信息，跳出循环
            break;
            
          } catch (error: any) {
            retryCount++;
            if (retryCount >= maxRetries) {
              logger.error(`获取订单详情失败（重试${retryCount}次）: ${error.message}`);
              // 如果无法获取订单详情，使用预估值继续
              logger.warn(`使用预估值继续: 数量=${Math.abs(size)}, 价格=${currentPrice}`);
              actualFillSize = Math.abs(size);
              actualFillPrice = currentPrice;
            } else {
              logger.warn(`获取订单详情失败，${retryCount}/${maxRetries} 次重试...`);
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }
      }
      
      //  使用实际成交数量和价格记录到数据库
      const finalQuantity = actualFillSize > 0 ? actualFillSize : Math.abs(size);
      
      // 计算手续费（Gate.io taker费率 0.05%）
      // 手续费 = 合约名义价值 * 0.05%
      // 合约名义价值 = 张数 * quantoMultiplier * 价格
      const positionValue = finalQuantity * quantoMultiplier * actualFillPrice;
      const fee = positionValue * 0.0005; // 0.05%
      
      // 记录开仓交易
      // side: 持仓方向（long=做多, short=做空）
      // 实际执行: long开仓=买入(+size), short开仓=卖出(-size)
      // 映射状态：Gate.io finished -> filled, open -> pending
      const dbStatus = finalOrderStatus === 'finished' ? 'filled' : 'pending';
      
      await dbClient.execute({
        sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, fee, timestamp, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id?.toString() || "",
          symbol,
          side,            // 持仓方向（long/short）
          "open",
          actualFillPrice, // 使用实际成交价格
          finalQuantity,   // 使用实际成交数量
          adjustedLeverage, // 使用实际调整后的杠杆
          fee,            // 手续费
          getChinaTimeISO(),
          dbStatus,
        ],
      });
      
      // 不设置止损止盈订单
      let slOrderId: string | undefined;
      let tpOrderId: string | undefined;
      
      //  获取持仓信息以获取 Gate.io 返回的强平价
      // Gate.io API 有延迟，需要等待并重试
      let liquidationPrice = 0;
      let gatePositionSize = 0;
      let maxRetries = 5;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // 递增等待时间
          
          const positions = await client.getPositions();

          // 在双向持仓模式下，需要过滤掉 size=0 的记录，找到实际持仓
          const gatePosition = positions.find((p: any) => p.contract === contract
              && Number.parseInt(p.size || "0") !== 0);
          if (gatePosition) {
            gatePositionSize = Number.parseInt(gatePosition.size || "0");
            
            if (gatePositionSize !== 0) {
              if (gatePosition.liq_price) {
                liquidationPrice = Number.parseFloat(gatePosition.liq_price);
              }
              break; // 持仓已存在，跳出循环
            }
          }
          
          retryCount++;
          
          if (retryCount >= maxRetries) {
            logger.error(`❌ 警告：Gate.io 查询显示持仓为0，但订单状态为 ${finalOrderStatus}`);
            logger.error(`订单ID: ${order.id}, 成交数量: ${actualFillSize}, 计算数量: ${finalQuantity}`);
            logger.error(`可能原因：Gate.io API 延迟或持仓需要更长时间更新`);
          }
        } catch (error) {
          logger.warn(`获取持仓失败（重试${retryCount + 1}/${maxRetries}）: ${error}`);
          retryCount++;
        }
      }
      
      // 如果未能从 Gate.io 获取强平价，使用估算公式（仅作为后备）
      if (liquidationPrice === 0) {
        liquidationPrice = side === "long" 
          ? actualFillPrice * (1 - 0.9 / leverage)
          : actualFillPrice * (1 + 0.9 / leverage);
        logger.warn(`使用估算强平价: ${liquidationPrice}`);
      }
        
      // 先检查是否已存在持仓
      const existingResult = await dbClient.execute({
        sql: "SELECT symbol FROM positions WHERE symbol = ?",
        args: [symbol],
      });
      
      if (existingResult.rows.length > 0) {
        // 更新现有持仓
        await dbClient.execute({
          sql: `UPDATE positions SET 
                quantity = ?, entry_price = ?, current_price = ?, liquidation_price = ?, 
                unrealized_pnl = ?, leverage = ?, side = ?, profit_target = ?, stop_loss = ?, 
                tp_order_id = ?, sl_order_id = ?, entry_order_id = ?
                WHERE symbol = ?`,
          args: [
            finalQuantity,
            actualFillPrice,
            actualFillPrice,
            liquidationPrice,
            0,
            adjustedLeverage, // 使用实际调整后的杠杆
            side,
            takeProfit || null,
            stopLoss || null,
            tpOrderId || null,
            slOrderId || null,
            order.id?.toString() || "",
            symbol,
          ],
        });
      } else {
        // 插入新持仓
        await dbClient.execute({
          sql: `INSERT INTO positions 
                (symbol, quantity, entry_price, current_price, liquidation_price, unrealized_pnl, 
                 leverage, side, profit_target, stop_loss, tp_order_id, sl_order_id, entry_order_id, opened_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            symbol,
            finalQuantity,
            actualFillPrice,
            actualFillPrice,
            liquidationPrice,
            0,
            adjustedLeverage, // 使用实际调整后的杠杆
            side,
            takeProfit || null,
            stopLoss || null,
            tpOrderId || null,
            slOrderId || null,
            order.id?.toString() || "",
            getChinaTimeISO(),
          ],
        });
      }
      
      const contractAmount = Math.abs(size) * quantoMultiplier;
      const totalValue = contractAmount * actualFillPrice;
      
      return {
        success: true,
        orderId: order.id?.toString(),
        symbol,
        side,
        size: Math.abs(size), // 合约张数
        contractAmount, // 实际币的数量
        price: actualFillPrice,
        leverage,
        actualMargin,
        message: `✅ 成功开仓 ${symbol} ${side === "long" ? "做多" : "做空"} ${Math.abs(size)} 张 (${contractAmount.toFixed(4)} ${symbol})，成交价 ${actualFillPrice.toFixed(2)}，保证金 ${actualMargin.toFixed(2)} USDT，杠杆 ${leverage}x。⚠️ 未设置止盈止损，请在每个周期主动决策是否平仓。`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `开仓失败: ${error.message}`,
      };
    }
  },
});

/**
 * 平仓工具
 */
export const closePositionTool = createTool({
  name: "closePosition",
  description: "平仓 - 关闭指定币种的持仓",
  parameters: z.object({
    symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
    percentage: z.number().min(1).max(100).default(100).describe("平仓百分比（1-100）"),
  }),
  execute: async ({ symbol, percentage }) => {
    const client = createExchangeClient();
    const contract = `${symbol}_USDT`;
    
    try {
      //  参数验证
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        return {
          success: false,
          message: `无效的平仓百分比: ${percentage}（必须在1-100之间）`,
        };
      }
      
      //  直接从 Gate.io 获取最新的持仓信息（不依赖数据库）
      const allPositions = await client.getPositions();
      // 🔧 修复：在双向持仓模式下，需要过滤掉 size=0 的记录，找到实际持仓
      const gatePosition = allPositions.find((p: any) => p.contract === contract && Number.parseFloat(p.size || "0") !== 0);
      
      if (!gatePosition) {
        return {
          success: false,
          message: `没有找到 ${symbol} 的持仓`,
        };
      }
      
      // 🔒 防止同周期内平仓保护：检查持仓开仓时间，防止刚开仓就立即平仓
      // 从数据库获取持仓信息以检查开仓时间
      const dbClient = createClient({
        url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
      });
      
      const dbPositionResult = await dbClient.execute({
        sql: `SELECT opened_at FROM positions WHERE symbol = ? LIMIT 1`,
        args: [symbol],
      });
      
      if (dbPositionResult.rows.length > 0) {
        const openedAt = dbPositionResult.rows[0].opened_at as string;
        const openedTime = new Date(openedAt).getTime();
        const now = Date.now();
        const holdingMinutes = (now - openedTime) / (1000 * 60);
        
        // 获取交易周期间隔（分钟）
        const intervalMinutes = Number.parseInt(process.env.TRADING_INTERVAL_MINUTES || "5");
        // 最小持仓时间为半个交易周期
        const minHoldingMinutes = intervalMinutes / 2;
        
        // 如果持仓时间少于最小持仓时间，拒绝平仓
        if (holdingMinutes < minHoldingMinutes) {
          return {
            success: false,
            message: `拒绝平仓 ${symbol}：持仓时间仅 ${holdingMinutes.toFixed(1)} 分钟，少于最小持仓时间 ${minHoldingMinutes.toFixed(1)} 分钟。请等待至少半个交易周期后再评估平仓。这是为了防止在同一周期内刚开仓就立即平仓，造成不必要的手续费损失。`,
          };
        }
        
        logger.info(`${symbol} 持仓时间: ${holdingMinutes.toFixed(1)} 分钟，通过最小持仓时间检查`);
      }
      
      // 从 Gate.io 获取实时数据
      const gateSize = Number.parseFloat(gatePosition.size || "0");
      const side = gateSize > 0 ? "long" : "short";
      const quantity = Math.abs(gateSize);
      let entryPrice = Number.parseFloat(gatePosition.entryPrice || "0");
      let currentPrice = Number.parseFloat(gatePosition.markPrice || "0");
      const leverage = Number.parseInt(gatePosition.leverage || "1");
      const totalUnrealizedPnl = Number.parseFloat(gatePosition.unrealisedPnl || "0");
      
      //  如果价格为0，获取实时行情作为后备
      if (currentPrice === 0 || entryPrice === 0) {
        const ticker = await client.getFuturesTicker(contract);
        if (currentPrice === 0) {
          currentPrice = Number.parseFloat(ticker.markPrice || ticker.last || "0");
          logger.warn(`持仓标记价格为0，使用行情价格: ${currentPrice}`);
        }
        if (entryPrice === 0) {
          entryPrice = currentPrice; // 如果开仓价为0，使用当前价格
          logger.warn(`持仓开仓价为0，使用当前价格: ${entryPrice}`);
        }
      }
      
      // 获取合约信息以确定数量精度
      const contractInfo = await client.getContractInfo(contract);
      // 兼容 Gate（下划线命名）和 OKX（驼峰命名）
      const lotSize = Number.parseFloat(contractInfo.lotSize || contractInfo.order_size_round || "1");
      
      // 计算平仓数量
      let closeSize = (quantity * percentage) / 100;
      
      // 根据 lotSize 调整数量精度（向上取整到最接近的有效精度）
      if (lotSize > 0) {
        closeSize = Math.ceil(closeSize / lotSize) * lotSize;
        // 修正浮点数精度问题
        const decimals = (lotSize.toString().split('.')[1] || '').length;
        closeSize = Number.parseFloat(closeSize.toFixed(decimals));
      } else {
        // 如果没有 lotSize 信息，默认向上取整到整数
        closeSize = Math.ceil(closeSize);
      }
      
      // 确保不超过持仓数量
      closeSize = Math.min(closeSize, quantity);
      
      // 验证平仓数量有效性
      if (closeSize === 0 || !Number.isFinite(closeSize)) {
        return {
          success: false,
          message: `平仓数量无效: closeSize=${closeSize}, quantity=${quantity}, percentage=${percentage}`,
        };
      }
      
      const size = side === "long" ? -closeSize : closeSize;
      
      //  获取合约乘数用于计算盈亏和手续费
      const quantoMultiplier = await getQuantoMultiplier(contract);
      
      // 🔥 不再依赖Gate.io返回的unrealisedPnl，始终手动计算毛盈亏
      // 手动计算盈亏公式：
      // 对于做多：(currentPrice - entryPrice) * quantity * quantoMultiplier
      // 对于做空：(entryPrice - currentPrice) * quantity * quantoMultiplier
      const priceChange = side === "long" 
        ? (currentPrice - entryPrice) 
        : (entryPrice - currentPrice);
      
      const grossPnl = priceChange * closeSize * quantoMultiplier;
      
      logger.info(`预估盈亏: ${grossPnl >= 0 ? '+' : ''}${grossPnl.toFixed(2)} USDT (价格变动: ${priceChange.toFixed(4)})`);
      
      //  计算手续费（开仓 + 平仓）
      const openFee = entryPrice * closeSize * quantoMultiplier * 0.0005;
      const closeFee = currentPrice * closeSize * quantoMultiplier * 0.0005;
      const totalFees = openFee + closeFee;
      
      // 净盈亏 = 毛盈亏 - 总手续费（此值为预估，平仓后会基于实际成交价重新计算）
      let pnl = grossPnl - totalFees;
      
      logger.info(`平仓 ${symbol} ${side === "long" ? "做多" : "做空"} ${closeSize}张 (入场: ${entryPrice.toFixed(2)}, 当前: ${currentPrice.toFixed(2)})`);
      
      //  市价单平仓（Gate.io 市价单：price 为 "0"，不设置 tif）
      const order = await client.placeOrder({
        contract,
        size,
        price: 0,  // 市价单必须传 price: 0
        reduceOnly: true, // 只减仓，不开新仓
      });
      
      //  等待并验证订单状态（带重试）
      await new Promise(resolve => setTimeout(resolve, 500));
      
      //  获取实际成交价格和数量（最多重试3次）
      let actualExitPrice = currentPrice;
      let actualCloseSize = closeSize;
      let finalOrderStatus = order.status;
      
      if (order.id) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            const orderDetail = await client.getOrder(order.id.toString());
            finalOrderStatus = orderDetail.status;
            const filled = Math.abs(Number.parseInt(orderDetail.size || "0") - Number.parseInt(orderDetail.left || "0"));
            
            if (filled > 0) {
              actualCloseSize = filled;
            }
            
            // 获取实际成交价格
            if (orderDetail.fill_price && Number.parseFloat(orderDetail.fill_price) > 0) {
              actualExitPrice = Number.parseFloat(orderDetail.fill_price);
            } else if (orderDetail.price && Number.parseFloat(orderDetail.price) > 0) {
              actualExitPrice = Number.parseFloat(orderDetail.price);
            }
            
            logger.info(`成交: ${actualCloseSize}张 @ ${actualExitPrice.toFixed(2)} USDT`);
            
            //  验证成交价格的合理性（滑点保护）
            const priceDeviation = Math.abs(actualExitPrice - currentPrice) / currentPrice;
            if (priceDeviation > 0.03) {
              // 平仓时允许3%滑点（比开仓宽松，因为可能是紧急止损）
              logger.warn(`⚠️ 平仓成交价偏离超过3%: ${currentPrice.toFixed(2)} → ${actualExitPrice.toFixed(2)} (偏离 ${(priceDeviation * 100).toFixed(2)}%)`);
            }
            
            //  重新计算实际盈亏（基于真实成交价格）
            // 获取合约乘数
            const quantoMultiplier = await getQuantoMultiplier(contract);
            
            const priceChange = side === "long" 
              ? (actualExitPrice - entryPrice) 
              : (entryPrice - actualExitPrice);
            
            // 盈亏 = 价格变化 * 张数 * 合约乘数
            const grossPnl = priceChange * actualCloseSize * quantoMultiplier;
            
            //  扣除手续费（开仓 + 平仓）
            // 开仓手续费 = 开仓名义价值 * 0.05%
            const openFee = entryPrice * actualCloseSize * quantoMultiplier * 0.0005;
            // 平仓手续费 = 平仓名义价值 * 0.05%
            const closeFee = actualExitPrice * actualCloseSize * quantoMultiplier * 0.0005;
            // 总手续费
            const totalFees = openFee + closeFee;
            
            // 净盈亏 = 毛盈亏 - 总手续费
            pnl = grossPnl - totalFees;
            
            logger.info(`盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`);
            
            // 成功获取订单信息，跳出循环
            break;
            
          } catch (error: any) {
            retryCount++;
            if (retryCount >= maxRetries) {
              logger.error(`获取平仓订单详情失败（重试${retryCount}次）: ${error.message}`);
              // 如果无法获取订单详情，使用预估值
              logger.warn(`使用预估值继续: 数量=${closeSize}, 价格=${currentPrice}`);
              actualCloseSize = closeSize;
              actualExitPrice = currentPrice;
              // 重新计算盈亏（需要乘以合约乘数）
              const quantoMultiplier = await getQuantoMultiplier(contract);
              const priceChange = side === "long" 
                ? (actualExitPrice - entryPrice) 
                : (entryPrice - actualExitPrice);
              const grossPnl = priceChange * actualCloseSize * quantoMultiplier;
              // 扣除手续费
              const openFee = entryPrice * actualCloseSize * quantoMultiplier * 0.0005;
              const closeFee = actualExitPrice * actualCloseSize * quantoMultiplier * 0.0005;
              pnl = grossPnl - openFee - closeFee;
            } else {
              logger.warn(`获取平仓订单详情失败，${retryCount}/${maxRetries} 次重试...`);
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }
      }
      
      // 获取账户信息用于记录当前总资产
      const account = await client.getFuturesAccount();
      const totalBalance = Number.parseFloat(account.total || "0");
      
      //  计算总手续费（开仓 + 平仓）用于数据库记录
      // 需要获取合约乘数
      const dbQuantoMultiplier = await getQuantoMultiplier(contract);
      
      // 开仓手续费 = 开仓名义价值 * 0.05%
      const dbOpenFee = entryPrice * actualCloseSize * dbQuantoMultiplier * 0.0005;
      // 平仓手续费 = 平仓名义价值 * 0.05%
      const dbCloseFee = actualExitPrice * actualCloseSize * dbQuantoMultiplier * 0.0005;
      // 总手续费
      const totalFee = dbOpenFee + dbCloseFee;
      
      // 🔥 关键验证：检查盈亏计算是否正确
      const notionalValue = actualExitPrice * actualCloseSize * dbQuantoMultiplier;
      const priceChangeCheck = side === "long" 
        ? (actualExitPrice - entryPrice) 
        : (entryPrice - actualExitPrice);
      const expectedPnl = priceChangeCheck * actualCloseSize * dbQuantoMultiplier - totalFee;
      
      // 检测盈亏是否被错误地设置为名义价值
      if (Math.abs(pnl - notionalValue) < Math.abs(pnl - expectedPnl)) {
        logger.error(`🚨 检测到盈亏计算异常！`);
        logger.error(`  当前pnl: ${pnl.toFixed(2)} USDT 接近名义价值 ${notionalValue.toFixed(2)} USDT`);
        logger.error(`  预期pnl: ${expectedPnl.toFixed(2)} USDT`);
        logger.error(`  开仓价: ${entryPrice}, 平仓价: ${actualExitPrice}, 数量: ${actualCloseSize}, 合约乘数: ${dbQuantoMultiplier}`);
        logger.error(`  价格变动: ${priceChangeCheck.toFixed(4)}, 手续费: ${totalFee.toFixed(4)}`);
        
        // 强制修正为正确值
        pnl = expectedPnl;
        logger.warn(`  已自动修正pnl为: ${pnl.toFixed(2)} USDT`);
      }
      
      // 详细日志记录（用于debug）
      logger.info(`【平仓盈亏详情】${symbol} ${side}`);
      logger.info(`  开仓价: ${entryPrice.toFixed(4)}, 平仓价: ${actualExitPrice.toFixed(4)}, 数量: ${actualCloseSize}张`);
      logger.info(`  价格变动: ${priceChangeCheck.toFixed(4)}, 合约乘数: ${dbQuantoMultiplier}`);
      logger.info(`  毛盈亏: ${(priceChangeCheck * actualCloseSize * dbQuantoMultiplier).toFixed(2)} USDT`);
      logger.info(`  开仓手续费: ${dbOpenFee.toFixed(4)} USDT, 平仓手续费: ${dbCloseFee.toFixed(4)} USDT`);
      logger.info(`  总手续费: ${totalFee.toFixed(4)} USDT`);
      logger.info(`  净盈亏: ${pnl.toFixed(2)} USDT`);
      
      // 记录平仓交易
      // side: 原持仓方向（long/short）
      // 实际执行方向: long平仓=卖出, short平仓=买入
      // pnl: 净盈亏（已扣除手续费）
      // fee: 总手续费（开仓+平仓）
      // 映射状态：Gate.io finished -> filled, open -> pending
      const dbStatus = finalOrderStatus === 'finished' ? 'filled' : 'pending';
      
      await dbClient.execute({
        sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id?.toString() || "",
          symbol,
          side,             // 原持仓方向（便于统计某个币种的多空盈亏）
          "close",
          actualExitPrice,   // 使用实际成交价格
          actualCloseSize,   // 使用实际成交数量
          leverage,
          pnl,              // 净盈亏（已扣除手续费）
          totalFee,         // 总手续费（开仓+平仓）
          getChinaTimeISO(),
          dbStatus,
        ],
      });
      
      const fullyClosed = actualCloseSize >= quantity - 1e-8;
      const actualPnlPercent = calculateLeveragedPnlPercent(entryPrice, actualExitPrice, side, leverage);

      // 从数据库获取止损止盈订单ID和保护状态（如果存在）
      const posResult = await dbClient.execute({
        sql: `SELECT sl_order_id, tp_order_id, partial_close_percentage, stop_loss, peak_pnl_percent
              FROM positions WHERE symbol = ?`,
        args: [symbol],
      });

      if (!fullyClosed && posResult.rows.length > 0 && pnl > 0) {
        const dbPosition = posResult.rows[0] as any;
        const currentPartialClose = parseNullableNumber(dbPosition.partial_close_percentage) ?? 0;
        const currentStopLoss = parseNullableNumber(dbPosition.stop_loss);
        const currentPeakPnl = parseNullableNumber(dbPosition.peak_pnl_percent) ?? 0;

        const nextPartialClose = mergePartialClosePercentage(
          currentPartialClose,
          quantity,
          actualCloseSize,
        );
        const profitProtectionStop = await getProfitProtectionStopPercent(actualPnlPercent);
        const nextStopLoss =
          currentStopLoss !== null ? Math.max(currentStopLoss, profitProtectionStop) : profitProtectionStop;
        const nextPeakPnl = Math.max(currentPeakPnl, actualPnlPercent);

        await dbClient.execute({
          sql: `UPDATE positions
                SET partial_close_percentage = ?, stop_loss = ?, peak_pnl_percent = ?
                WHERE symbol = ?`,
          args: [nextPartialClose, nextStopLoss, nextPeakPnl, symbol],
        });

        logger.info(
          `【尾仓保护已启用】${symbol} 已累计分批 ${nextPartialClose.toFixed(2)}%，剩余仓位保护止损提升至 ${nextStopLoss.toFixed(2)}%`,
        );
      }
      
      // 取消止损止盈订单（先检查订单状态）
      if (posResult.rows.length > 0) {
        const dbPosition = posResult.rows[0] as any;
        
        if (dbPosition.sl_order_id) {
          try {
            // 先获取订单状态
            const orderDetail = await client.getOrder(dbPosition.sl_order_id);
            // 只取消未完成的订单（open状态）
            if (orderDetail.status === 'open') {
              await client.cancelOrder(dbPosition.sl_order_id);
            }
          } catch (e: any) {
            // 订单可能已经不存在或已被取消
            logger.warn(`无法取消止损订单 ${dbPosition.sl_order_id}: ${e.message}`);
          }
        }
        
        if (dbPosition.tp_order_id) {
          try {
            // 先获取订单状态
            const orderDetail = await client.getOrder(dbPosition.tp_order_id);
            // 只取消未完成的订单（open状态）
            if (orderDetail.status === 'open') {
              await client.cancelOrder(dbPosition.tp_order_id);
            }
          } catch (e: any) {
            // 订单可能已经不存在或已被取消
            logger.warn(`无法取消止盈订单 ${dbPosition.tp_order_id}: ${e.message}`);
          }
        }
      }
      
      // 如果实际已全部平仓，从持仓表删除；否则保留持仓并等待同步任务更新实时数量
      if (fullyClosed) {
        await dbClient.execute({
          sql: "DELETE FROM positions WHERE symbol = ?",
          args: [symbol],
        });
      }
      
      return {
        success: true,
        orderId: order.id?.toString(),
        symbol,
        side,
        closedSize: actualCloseSize,  // 使用实际成交数量
        entryPrice,
        exitPrice: actualExitPrice,   // 使用实际成交价格
        leverage,
        pnl,                          // 净盈亏（已扣除手续费）
        fee: totalFee,                // 总手续费
        totalBalance,
        message: `成功平仓 ${symbol} ${actualCloseSize} 张，入场价 ${entryPrice.toFixed(4)}，平仓价 ${actualExitPrice.toFixed(4)}，净盈亏 ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (已扣手续费 ${totalFee.toFixed(2)} USDT)，当前总资产 ${totalBalance.toFixed(2)} USDT`,
      };
    } catch (error: any) {
      logger.error(`平仓失败: ${error.message}`, error);
      return {
        success: false,
        error: error.message,
        message: `平仓失败: ${error.message}`,
      };
    }
  },
});

/**
 * 取消订单工具
 */
export const cancelOrderTool = createTool({
  name: "cancelOrder",
  description: "取消指定的挂单",
  parameters: z.object({
    orderId: z.string().describe("订单ID"),
  }),
  execute: async ({ orderId }) => {
    const client = createExchangeClient();
    
    try {
      await client.cancelOrder(orderId);
      
      return {
        success: true,
        orderId,
        message: `订单 ${orderId} 已取消`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `取消订单失败: ${error.message}`,
      };
    }
  },
});
