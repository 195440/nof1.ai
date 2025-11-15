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
 * 止损监控器 - 每10秒执行一次（根据策略配置启用）
 * 
 * 适用范围：
 * - 策略配置 enableCodeLevelProtection = true 时启用
 * - 默认只有 swing-trend（波段趋势策略）启用，其他策略可根据需要启用
 * - 直接使用策略的 stopLoss 配置，根据杠杆范围自动映射到 low/mid/high
 * 
 * 功能：
 * 1. 每10秒从Gate.io获取最新持仓价格（markPrice）
 * 2. 计算每个持仓的当前盈亏百分比
 * 3. 根据止损规则判断是否触发止损（基于杠杆倍数动态映射）
 * 4. 触发时立即平仓，记录到交易历史和决策数据
 * 
 * 止损规则（示例 - swing-trend 策略）：
 * - 低风险（5-7倍杠杆）：亏损达到 -6% 时止损
 * - 中风险（8-12倍杠杆）：亏损达到 -5% 时止损
 * - 高风险（13倍以上杠杆）：亏损达到 -4% 时止损
 * 
 * 注意：
 * - 每个持仓独立监控，不是整体账户
 * - 盈亏计算已考虑杠杆倍数
 * - 不由AI执行止损，完全自动化
 */

import { createLogger } from "../utils/loggerUtils";
import { createClient } from "@libsql/client";
import { createExchangeClient } from "../services/exchangeClient";
import { getChinaTimeISO } from "../utils/timeUtils";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { getTradingStrategy, getStrategyParams } from "../agents/tradingAgent";

const logger = createLogger({
  name: "stop-loss-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * 根据杠杆倍数确定止损阈值
 * 直接使用策略的 stopLoss 配置，根据杠杆范围映射到 low/mid/high
 */
function getStopLossThreshold(leverage: number): { threshold: number; level: string; description: string } {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  if (!params.stopLoss) {
    throw new Error("止损配置不存在");
  }
  
  // 根据杠杆范围自动映射到 low/mid/high
  // 低杠杆：leverageMin ~ leverageMin + (leverageMax - leverageMin) * 0.33
  // 中杠杆：低杠杆上限 + 1 ~ leverageMin + (leverageMax - leverageMin) * 0.67
  // 高杠杆：中杠杆上限 + 1 ~ leverageMax
  const levMin = params.leverageMin;
  const levMax = params.leverageMax;
  const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
  const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);
  
  if (leverage > midThreshold) {
    return {
      threshold: params.stopLoss.high,
      level: "高杠杆",
      description: `${midThreshold + 1}倍以上杠杆，亏损 ${params.stopLoss.high}% 时止损`,
    };
  } else if (leverage > lowThreshold) {
    return {
      threshold: params.stopLoss.mid,
      level: "中杠杆",
      description: `${lowThreshold + 1}-${midThreshold}倍杠杆，亏损 ${params.stopLoss.mid}% 时止损`,
    };
  } else {
    return {
      threshold: params.stopLoss.low,
      level: "低杠杆",
      description: `${levMin}-${lowThreshold}倍杠杆，亏损 ${params.stopLoss.low}% 时止损`,
    };
  }
}

// 持仓监控记录：symbol -> { checkCount, lastCheckTime }
const positionMonitorHistory = new Map<string, {
  lastCheckTime: number;
  checkCount: number;
}>();

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否启用代码级止损
 */
function isStopLossEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取止损配置（用于日志输出）
 */
function getStopLossConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  if (!params.stopLoss) {
    return null;
  }
  
  const levMin = params.leverageMin;
  const levMax = params.leverageMax;
  const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
  const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);
  
  return {
    lowRisk: {
      description: `${levMin}-${lowThreshold}倍杠杆，亏损 ${params.stopLoss.low}% 时止损`,
      threshold: params.stopLoss.low,
    },
    mediumRisk: {
      description: `${lowThreshold + 1}-${midThreshold}倍杠杆，亏损 ${params.stopLoss.mid}% 时止损`,
      threshold: params.stopLoss.mid,
    },
    highRisk: {
      description: `${midThreshold + 1}倍以上杠杆，亏损 ${params.stopLoss.high}% 时止损`,
      threshold: params.stopLoss.high,
    },
  };
}

/**
 * 计算持仓盈亏百分比（考虑杠杆）
 */
function calculatePnlPercent(entryPrice: number, currentPrice: number, side: string, leverage: number): number {
  const priceChangePercent = entryPrice > 0 
    ? ((currentPrice - entryPrice) / entryPrice * 100 * (side === 'long' ? 1 : -1))
    : 0;
  return priceChangePercent * leverage;
}

/**
 * 修复止损交易记录
 * 如果价格为0或盈亏不正确，从开仓记录重新计算
 */
async function fixStopLossTradeRecord(symbol: string): Promise<void> {
  const exchangeClient = createExchangeClient();
  
  try {
    // 查找最近的平仓记录
    const closeResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'close' ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol],
    });
    
    if (!closeResult.rows || closeResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 的平仓记录`);
      return;
    }
    
    const closeTrade = closeResult.rows[0];
    const id = closeTrade.id;
    const side = closeTrade.side as string;
    let closePrice = Number.parseFloat(closeTrade.price as string);
    const quantity = Number.parseFloat(closeTrade.quantity as string);
    let recordedPnl = Number.parseFloat(closeTrade.pnl as string || "0");
    let recordedFee = Number.parseFloat(closeTrade.fee as string || "0");
    const timestamp = closeTrade.timestamp as string;
    
    // 查找对应的开仓记录
    const openResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'open' AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol, timestamp],
    });
    
    if (!openResult.rows || openResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 对应的开仓记录，无法修复`);
      return;
    }
    
    const openTrade = openResult.rows[0];
    const openPrice = Number.parseFloat(openTrade.price as string);
    
    // 如果平仓价格为0或无效，尝试获取当前价格作为近似值
    if (closePrice === 0 || !Number.isFinite(closePrice)) {
      try {
        const contract = `${symbol}_USDT`;
        const ticker = await exchangeClient.getFuturesTicker(contract);
        closePrice = Number.parseFloat(ticker.last || ticker.markPrice || "0");
        
        if (closePrice > 0) {
          logger.info(`使用当前ticker价格修复 ${symbol} 平仓价格: ${closePrice}`);
        } else {
          logger.error(`无法获取有效价格修复 ${symbol} 交易记录`);
          return;
        }
      } catch (error: any) {
        logger.error(`获取ticker价格失败: ${error.message}`);
        return;
      }
    }
    
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
    const priceDiff = Math.abs(Number.parseFloat(closeTrade.price as string) - closePrice);
    const pnlDiff = Math.abs(recordedPnl - correctPnl);
    const feeDiff = Math.abs(recordedFee - totalFee);
    
    // 如果需要修复（价格为0或差异大于阈值）
    if (priceDiff > 0.01 || pnlDiff > 0.5 || feeDiff > 0.1) {
      logger.warn(`【修复止损交易记录】${symbol} ${side}`);
      logger.warn(`  开仓价: ${openPrice.toFixed(4)}`);
      logger.warn(`  平仓价: ${Number.parseFloat(closeTrade.price as string).toFixed(4)} → ${closePrice.toFixed(4)}`);
      logger.warn(`  盈亏: ${recordedPnl.toFixed(2)} → ${correctPnl.toFixed(2)} USDT (差异: ${pnlDiff.toFixed(2)})`);
      logger.warn(`  手续费: ${recordedFee.toFixed(4)} → ${totalFee.toFixed(4)} USDT`);
      
      // 更新数据库
      await dbClient.execute({
        sql: `UPDATE trades SET price = ?, pnl = ?, fee = ? WHERE id = ?`,
        args: [closePrice, correctPnl, totalFee, id],
      });
      
      logger.info(`【修复完成】${symbol} 止损交易记录已修复`);
    } else {
      logger.debug(`${symbol} 止损交易记录正确，无需修复`);
    }
  } catch (error: any) {
    logger.error(`修复 ${symbol} 止损交易记录失败: ${error.message}`);
    throw error;
  }
}

/**
 * 执行止损平仓
 */
async function executeStopLossClose(
  symbol: string, 
  side: string, 
  quantity: number, 
  entryPrice: number, 
  currentPrice: number, 
  leverage: number,
  pnlPercent: number,
  stopLossThreshold: number,
  riskLevel: string
): Promise<boolean> {
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;
  
  try {
    const size = side === 'long' ? -quantity : quantity;
    
    logger.error(`【触发止损 ${riskLevel}】${symbol} ${side}`);
    logger.error(`  当前亏损: ${pnlPercent.toFixed(2)}%`);
    logger.error(`  止损线: ${stopLossThreshold.toFixed(2)}%`);
    logger.error(`  杠杆倍数: ${leverage}x`);
    
    // 1. 执行平仓订单
    const order = await exchangeClient.placeOrder({
      contract,
      size,
      price: 0,
      reduceOnly: true,
    });
    
    logger.info(`已下达止损平仓订单 ${symbol}，订单ID: ${order.id}`);
    
    // 2. 等待订单完成并获取成交信息
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    let actualExitPrice = 0;
    let actualQuantity = quantity;
    let pnl = 0;
    let totalFee = 0;
    let orderFilled = false;
    
    // 尝试从订单获取成交信息
    if (order.id) {
      for (let retry = 0; retry < 5; retry++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          const orderStatus = await exchangeClient.getOrder(order.id?.toString() || "");
          
          if (orderStatus.status === 'finished') {
            const fillPrice = Number.parseFloat(orderStatus.fill_price || orderStatus.price || "0");
            actualQuantity = Math.abs(Number.parseFloat(orderStatus.size || "0"));
            
            if (fillPrice > 0) {
              actualExitPrice = fillPrice;
              orderFilled = true;
              logger.info(`从订单获取成交价格: ${actualExitPrice}`);
              break;
            }
          }
        } catch (statusError: any) {
          logger.warn(`查询止损订单状态失败 (重试${retry + 1}/5): ${statusError.message}`);
        }
      }
    }
    
    // 如果未能从订单获取价格，使用ticker价格
    if (actualExitPrice === 0) {
      try {
        const ticker = await exchangeClient.getFuturesTicker(contract);
        actualExitPrice = Number.parseFloat(ticker.last || ticker.markPrice || "0");
        
        if (actualExitPrice > 0) {
          logger.warn(`未能从订单获取价格，使用ticker价格: ${actualExitPrice}`);
        } else {
          // 最后备用：使用传入的currentPrice
          actualExitPrice = currentPrice;
          logger.warn(`ticker价格也无效，使用传入的currentPrice: ${actualExitPrice}`);
        }
      } catch (tickerError: any) {
        logger.error(`获取ticker价格失败: ${tickerError.message}，使用传入的currentPrice: ${currentPrice}`);
        actualExitPrice = currentPrice;
      }
    }
    
    // 计算盈亏（无论是否成功获取订单状态）
    if (actualExitPrice > 0) {
      try {
        // 获取合约乘数
        const quantoMultiplier = await getQuantoMultiplier(contract);
        
        // 计算盈亏
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
        
        logger.info(`止损平仓成交: 价格=${actualExitPrice.toFixed(2)}, 数量=${actualQuantity}, 盈亏=${pnl.toFixed(2)} USDT`);
      } catch (calcError: any) {
        logger.error(`计算盈亏失败: ${calcError.message}`);
      }
    } else {
      logger.error(`无法获取有效的平仓价格，将记录为0，稍后由修复工具修复`);
    }
    
    // 3. 记录到trades表
    const insertResult = await dbClient.execute({
      sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        order.id?.toString() || "",
        symbol,
        side,
        "close",
        actualExitPrice,
        actualQuantity,
        leverage,
        pnl,
        totalFee,
        getChinaTimeISO(),
        orderFilled ? "filled" : "pending",
      ],
    });
    
    // 3.1 立即调用修复工具修复这条交易记录
    try {
      logger.info(`正在验证和修复 ${symbol} 的止损交易记录...`);
      await fixStopLossTradeRecord(symbol);
    } catch (fixError: any) {
      logger.warn(`修复止损交易记录失败: ${fixError.message}，将在下次周期自动修复`);
    }
    
    // 4. 记录决策信息到agent_decisions表
    const decisionText = `【止损触发 - ${riskLevel}】${symbol} ${side === 'long' ? '做多' : '做空'}
风险等级: ${riskLevel}
杠杆倍数: ${leverage}x
当前亏损: ${pnlPercent.toFixed(2)}%
止损线: ${stopLossThreshold.toFixed(2)}%
平仓价格: ${actualExitPrice.toFixed(2)}
平仓盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT

触发条件: 亏损达到${pnlPercent.toFixed(2)}%，超过${riskLevel}止损线${stopLossThreshold.toFixed(2)}%`;
    
    await dbClient.execute({
      sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        getChinaTimeISO(),
        0, // 由止损触发，非AI周期
        JSON.stringify({ trigger: "stop_loss", symbol, pnlPercent, stopLossThreshold, riskLevel }),
        decisionText,
        JSON.stringify([{ action: "close_position", symbol, reason: "stop_loss" }]),
        0, // 稍后更新
        0, // 稍后更新
      ],
    });
    
    // 5. 从数据库删除持仓记录
    await dbClient.execute({
      sql: "DELETE FROM positions WHERE symbol = ?",
      args: [symbol],
    });
    
    logger.info(`止损平仓完成 ${symbol}，盈亏：${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`);
    
    // 6. 从内存中清除记录
    positionMonitorHistory.delete(symbol);
    
    return true;
  } catch (error: any) {
    logger.error(`止损平仓失败 ${symbol}: ${error.message}`);
    return false;
  }
}

/**
 * 检查所有持仓的止损条件
 */
async function checkStopLoss() {
  if (!isRunning) {
    return;
  }
  
  try {
    const exchangeClient = createExchangeClient();
    
    // 1. 获取所有持仓
    const gatePositions = await exchangeClient.getPositions();
    const activePositions = gatePositions.filter((p: any) => Number.parseInt(p.size || "0") !== 0);
    
    if (activePositions.length === 0) {
      // 清空内存记录
      positionMonitorHistory.clear();
      return;
    }
    
    const now = Date.now();
    
    // 2. 检查每个持仓
    for (const pos of activePositions) {
      const size = Number.parseInt(pos.size || "0");
      const symbol = pos.contract.replace("_USDT", "");
      const side = size > 0 ? "long" : "short";
      const quantity = Math.abs(size);
      const entryPrice = Number.parseFloat(pos.entryPrice || "0");
      const currentPrice = Number.parseFloat(pos.markPrice || "0");
      const leverage = Number.parseInt(pos.leverage || "1");
      
      // 验证数据有效性
      if (entryPrice === 0 || currentPrice === 0 || leverage === 0) {
        logger.warn(`${symbol} 数据无效，跳过止损检查`);
        continue;
      }
      
      // 计算盈亏百分比（考虑杠杆）
      const pnlPercent = calculatePnlPercent(entryPrice, currentPrice, side, leverage);
      
      // 获取或初始化监控历史记录
      let history = positionMonitorHistory.get(symbol);
      if (!history) {
        history = {
          lastCheckTime: now,
          checkCount: 0,
        };
        positionMonitorHistory.set(symbol, history);
        logger.info(`${symbol} 开始监控止损，当前盈亏: ${pnlPercent.toFixed(2)}%`);
      }
      
      // 增加检查次数
      history.checkCount++;
      history.lastCheckTime = now;
      
      // 3. 检查止损条件
      // 根据杠杆倍数确定止损阈值
      const thresholdInfo = getStopLossThreshold(leverage);
      
      // 检查是否触发止损（亏损达到或超过止损线）
      if (pnlPercent <= thresholdInfo.threshold) {
        logger.error(`${symbol} 触发止损条件:`);
        logger.error(`  风险等级: ${thresholdInfo.level} - ${thresholdInfo.description}`);
        logger.error(`  杠杆倍数: ${leverage}x`);
        logger.error(`  当前亏损: ${pnlPercent.toFixed(2)}%`);
        logger.error(`  止损线: ${thresholdInfo.threshold.toFixed(2)}%`);
        
        // 执行止损平仓
        const success = await executeStopLossClose(
          symbol,
          side,
          quantity,
          entryPrice,
          currentPrice,
          leverage,
          pnlPercent,
          thresholdInfo.threshold,
          `${thresholdInfo.level} - ${thresholdInfo.description}`
        );
        
        if (success) {
          logger.info(`${symbol} 止损平仓成功`);
        }
      } else {
        // 每10次检查输出一次调试日志
        if (history.checkCount % 10 === 0) {
          logger.debug(`${symbol} ${thresholdInfo.level} 监控中: ${leverage}x杠杆, 当前${pnlPercent.toFixed(2)}%, 止损线${thresholdInfo.threshold.toFixed(2)}%`);
        }
      }
    }
    
    // 4. 清理已平仓的记录
    const activeSymbols = new Set(
      activePositions.map((p: any) => p.contract.replace("_USDT", ""))
    );
    
    for (const symbol of positionMonitorHistory.keys()) {
      if (!activeSymbols.has(symbol)) {
        positionMonitorHistory.delete(symbol);
        logger.debug(`清理已平仓的记录: ${symbol}`);
      }
    }
    
  } catch (error: any) {
    logger.error(`止损检查失败: ${error.message}`);
  }
}

/**
 * 启动止损监控（仅限波段策略）
 */
export function startStopLossMonitor() {
  // 检查当前策略是否启用代码级止损
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  if (!isStopLossEnabled()) {
    logger.info(`当前策略 [${params.name}] 未启用代码级止损监控（enableCodeLevelProtection = false）`);
    return;
  }
  
  if (isRunning) {
    logger.warn("止损监控已在运行中");
    return;
  }
  
  const config = getStopLossConfig();
  if (!config) {
    logger.error(`策略 [${params.name}] 的止损配置缺失`);
    return;
  }
  
  isRunning = true;
  logger.info(`启动止损监控（自动止损系统 - ${params.name}策略）`);
  logger.info(`  当前策略: ${strategy} (${params.name})`);
  logger.info("  检查间隔: 10秒");
  logger.info(`  低风险: ${config.lowRisk.description}`);
  logger.info(`  中风险: ${config.mediumRisk.description}`);
  logger.info(`  高风险: ${config.highRisk.description}`);
  
  // 立即执行一次
  checkStopLoss();
  
  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkStopLoss();
  }, 10 * 1000);
}

/**
 * 停止止损监控
 */
export function stopStopLossMonitor() {
  if (!isRunning) {
    logger.warn("止损监控未在运行");
    return;
  }
  
  isRunning = false;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  
  positionMonitorHistory.clear();
  logger.info("止损监控已停止");
}


