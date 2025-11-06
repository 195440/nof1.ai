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
 * 移动止盈监控器 - 每10秒执行一次（仅限波段策略）
 * 
 * 适用范围：
 * - 仅对 TRADING_STRATEGY=swing-trend（波段趋势策略）生效
 * - 其他策略（ultra-short, conservative, balanced, aggressive）不启用此监控
 * 
 * 功能：
 * 1. 每10秒从Gate.io获取最新持仓价格（markPrice）
 * 2. 计算每个持仓的当前盈利和峰值盈利
 * 3. 根据多级规则判断是否触发移动止盈
 * 4. 触发时立即平仓，记录到交易历史和决策数据
 * 
 * 移动止盈规则（多级，按盈利阶段递进）：
 * - 阶段1：峰值盈利 4-10%  → 回退2%时平仓（保底2%利润）
 * - 阶段2：峰值盈利 10-20% → 回退3%时平仓（保底7%利润）
 * - 阶段3：峰值盈利 20%+   → 回退5%时平仓（保底15%利润）
 * 
 * 注意：
 * - 每个持仓独立跟踪，不是整体账户
 * - 盈利计算已考虑杠杆倍数
 * - 峰值会自动更新到最高点
 */

import { createLogger } from "../utils/loggerUtils";
import { createClient } from "@libsql/client";
import { createGateClient } from "../services/gateClient";
import { getChinaTimeISO } from "../utils/timeUtils";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { getTradingStrategy, getStrategyParams } from "../agents/tradingAgent";

const logger = createLogger({
  name: "trailing-stop-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * 获取移动止盈配置（从策略配置读取）
 */
function getTrailingStopConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  // 只有波段策略有代码级移动止盈配置
  if (params.codeLevelTrailingStop) {
    return params.codeLevelTrailingStop;
  }
  
  // 其他策略返回 null，不启用代码级移动止盈
  return null;
}

/**
 * 根据峰值盈利确定回退阈值和阶段信息
 */
function getDrawdownThreshold(peakPnlPercent: number): { threshold: number; stage: string; description: string } {
  const config = getTrailingStopConfig();
  if (!config) {
    // 不应该到这里，因为只有波段策略会启动移动止盈监控
    throw new Error("移动止盈配置不存在");
  }
  
  // 按照从高到低的顺序检查
  const stages = [
    config.stage5,
    config.stage4,
    config.stage3,
    config.stage2,
    config.stage1,
  ];
  
  for (const stage of stages) {
    if (peakPnlPercent >= stage.minProfit) {
      return {
        threshold: stage.drawdownPercent,
        stage: stage.name,
        description: stage.description,
      };
    }
  }
  
  return { threshold: 0, stage: "未达到阈值", description: "峰值盈利未达到4%，继续跟踪" };
}

// 持仓盈利记录：symbol -> { peakPnlPercent, lastCheckTime, priceHistory }
const positionPnlHistory = new Map<string, {
  peakPnlPercent: number;
  lastCheckTime: number;
  checkCount: number; // 检查次数，用于日志
}>();

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否启用代码级移动止盈
 */
function isTrailingStopEnabled(): boolean {
  const strategy = process.env.TRADING_STRATEGY || "balanced";
  return strategy === "swing-trend";
}

/**
 * 计算持仓盈利百分比（考虑杠杆）
 */
function calculatePnlPercent(entryPrice: number, currentPrice: number, side: string, leverage: number): number {
  const priceChangePercent = entryPrice > 0 
    ? ((currentPrice - entryPrice) / entryPrice * 100 * (side === 'long' ? 1 : -1))
    : 0;
  return priceChangePercent * leverage;
}

/**
 * 修复移动止盈交易记录
 * 如果价格为0或盈亏不正确，从开仓记录重新计算
 */
async function fixTrailingStopTradeRecord(symbol: string): Promise<void> {
  const gateClient = createGateClient();
  
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
        const ticker = await gateClient.getFuturesTicker(contract);
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
      logger.warn(`【修复交易记录】${symbol} ${side}`);
      logger.warn(`  开仓价: ${openPrice.toFixed(4)}`);
      logger.warn(`  平仓价: ${Number.parseFloat(closeTrade.price as string).toFixed(4)} → ${closePrice.toFixed(4)}`);
      logger.warn(`  盈亏: ${recordedPnl.toFixed(2)} → ${correctPnl.toFixed(2)} USDT (差异: ${pnlDiff.toFixed(2)})`);
      logger.warn(`  手续费: ${recordedFee.toFixed(4)} → ${totalFee.toFixed(4)} USDT`);
      
      // 更新数据库
      await dbClient.execute({
        sql: `UPDATE trades SET price = ?, pnl = ?, fee = ? WHERE id = ?`,
        args: [closePrice, correctPnl, totalFee, id],
      });
      
      logger.info(`【修复完成】${symbol} 交易记录已修复`);
    } else {
      logger.debug(`${symbol} 交易记录正确，无需修复`);
    }
  } catch (error: any) {
    logger.error(`修复 ${symbol} 交易记录失败: ${error.message}`);
    throw error;
  }
}

/**
 * 执行移动止盈平仓
 */
async function executeTrailingStopClose(
  symbol: string, 
  side: string, 
  quantity: number, 
  entryPrice: number, 
  currentPrice: number, 
  leverage: number,
  pnlPercent: number,
  peakPnlPercent: number,
  drawdownPercent: number,
  drawdownThreshold: number,
  stage: string
): Promise<boolean> {
  const gateClient = createGateClient();
  const contract = `${symbol}_USDT`;
  
  try {
    const size = side === 'long' ? -quantity : quantity;
    
    logger.warn(`【触发移动止盈 ${stage}】${symbol} ${side}`);
    logger.warn(`  峰值盈利: ${peakPnlPercent.toFixed(2)}%`);
    logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
    logger.warn(`  回撤幅度: ${drawdownPercent.toFixed(2)}% (阈值: ${drawdownThreshold.toFixed(2)}%)`);
    
    // 1. 执行平仓订单
    const order = await gateClient.placeOrder({
      contract,
      size,
      price: 0,
      reduceOnly: true,
    });
    
    logger.info(`已下达移动止盈平仓订单 ${symbol}，订单ID: ${order.id}`);
    
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
          const orderStatus = await gateClient.getOrder(order.id?.toString() || "");
          
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
          logger.warn(`查询移动止盈订单状态失败 (重试${retry + 1}/5): ${statusError.message}`);
        }
      }
    }
    
    // 如果未能从订单获取价格，使用ticker价格
    if (actualExitPrice === 0) {
      try {
        const ticker = await gateClient.getFuturesTicker(contract);
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
        
        logger.info(`移动止盈平仓成交: 价格=${actualExitPrice.toFixed(2)}, 数量=${actualQuantity}, 盈亏=${pnl.toFixed(2)} USDT`);
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
      logger.info(`正在验证和修复 ${symbol} 的交易记录...`);
      await fixTrailingStopTradeRecord(symbol);
    } catch (fixError: any) {
      logger.warn(`修复交易记录失败: ${fixError.message}，将在下次周期自动修复`);
    }
    
    // 4. 记录决策信息到agent_decisions表
    const decisionText = `【移动止盈触发 - ${stage}】${symbol} ${side === 'long' ? '做多' : '做空'}
触发阶段: ${stage}
峰值盈利: ${peakPnlPercent.toFixed(2)}%
当前盈利: ${pnlPercent.toFixed(2)}%
回撤幅度: ${drawdownPercent.toFixed(2)}% (阈值: ${drawdownThreshold.toFixed(2)}%)
平仓价格: ${actualExitPrice.toFixed(2)}
平仓盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT

触发条件: 盈利从峰值${peakPnlPercent.toFixed(2)}%回退${drawdownPercent.toFixed(2)}%，达到${stage}回退阈值${drawdownThreshold.toFixed(2)}%`;
    
    await dbClient.execute({
      sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        getChinaTimeISO(),
        0, // 由移动止盈触发，非AI周期
        JSON.stringify({ trigger: "trailing_stop", symbol, pnlPercent, peakPnlPercent, drawdownPercent }),
        decisionText,
        JSON.stringify([{ action: "close_position", symbol, reason: "trailing_stop" }]),
        0, // 稍后更新
        0, // 稍后更新
      ],
    });
    
    // 5. 从数据库删除持仓记录
    await dbClient.execute({
      sql: "DELETE FROM positions WHERE symbol = ?",
      args: [symbol],
    });
    
    logger.info(`移动止盈平仓完成 ${symbol}，盈亏：${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`);
    
    // 6. 从内存中清除记录
    positionPnlHistory.delete(symbol);
    
    return true;
  } catch (error: any) {
    logger.error(`移动止盈平仓失败 ${symbol}: ${error.message}`);
    return false;
  }
}

/**
 * 检查所有持仓的移动止盈条件
 */
async function checkTrailingStop() {
  if (!isRunning) {
    return;
  }
  
  try {
    const gateClient = createGateClient();
    
    // 1. 获取所有持仓
    const gatePositions = await gateClient.getPositions();
    const activePositions = gatePositions.filter((p: any) => Number.parseInt(p.size || "0") !== 0);
    
    if (activePositions.length === 0) {
      // 清空内存记录
      positionPnlHistory.clear();
      return;
    }
    
    // 2. 从数据库获取持仓信息（获取开仓时间）
    const dbResult = await dbClient.execute("SELECT symbol, opened_at FROM positions");
    const dbOpenedAtMap = new Map(
      dbResult.rows.map((row: any) => [row.symbol, row.opened_at])
    );
    
    const now = Date.now();
    
    // 3. 检查每个持仓
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
        logger.warn(`${symbol} 数据无效，跳过移动止盈检查`);
        continue;
      }
      
      // 计算盈利百分比（考虑杠杆）
      const pnlPercent = calculatePnlPercent(entryPrice, currentPrice, side, leverage);
      
      // 获取或初始化盈利历史记录
      let history = positionPnlHistory.get(symbol);
      if (!history) {
        history = {
          peakPnlPercent: pnlPercent,
          lastCheckTime: now,
          checkCount: 0,
        };
        positionPnlHistory.set(symbol, history);
        logger.info(`${symbol} 开始跟踪移动止盈，初始盈利: ${pnlPercent.toFixed(2)}%`);
      }
      
      // 增加检查次数
      history.checkCount++;
      
      // 更新峰值盈利
      if (pnlPercent > history.peakPnlPercent) {
        const oldPeak = history.peakPnlPercent;
        history.peakPnlPercent = pnlPercent;
        
        // 同时更新数据库中的峰值盈利
        await dbClient.execute({
          sql: "UPDATE positions SET peak_pnl_percent = ? WHERE symbol = ?",
          args: [pnlPercent, symbol],
        });
        
        logger.info(`${symbol} 更新峰值盈利: ${oldPeak.toFixed(2)}% → ${pnlPercent.toFixed(2)}%`);
      }
      
      // 更新最后检查时间
      history.lastCheckTime = now;
      
      // 4. 检查移动止盈条件（多级规则）
      // 根据峰值盈利确定回退阈值和阶段信息
      const thresholdInfo = getDrawdownThreshold(history.peakPnlPercent);
      
      // 如果峰值盈利未达到最低阈值（4%），不触发
      if (thresholdInfo.threshold === 0) {
        // 每10次检查输出一次调试日志，避免日志过多
        if (history.checkCount % 10 === 0) {
          logger.debug(`${symbol} 峰值盈利 ${history.peakPnlPercent.toFixed(2)}% 未达到最低阈值 4%，继续跟踪`);
        }
        continue;
      }
      
      // 计算回退百分比（绝对值）
      const drawdownPercent = history.peakPnlPercent - pnlPercent;
      
      // 检查是否达到回退阈值
      if (drawdownPercent >= thresholdInfo.threshold) {
        // 计算回退后的盈利
        const profitAfterDrawdown = pnlPercent;
        
        logger.warn(`${symbol} 触发移动止盈条件:`);
        logger.warn(`  触发阶段: ${thresholdInfo.stage} - ${thresholdInfo.description}`);
        logger.warn(`  峰值盈利: ${history.peakPnlPercent.toFixed(2)}%`);
        logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
        logger.warn(`  回退幅度: ${drawdownPercent.toFixed(2)}% ≥ ${thresholdInfo.threshold.toFixed(2)}%`);
        logger.warn(`  回退后盈利: ${profitAfterDrawdown.toFixed(2)}%`);
        
        // 执行平仓
        const success = await executeTrailingStopClose(
          symbol,
          side,
          quantity,
          entryPrice,
          currentPrice,
          leverage,
          pnlPercent,
          history.peakPnlPercent,
          drawdownPercent,
          thresholdInfo.threshold,
          `${thresholdInfo.stage} - ${thresholdInfo.description}`
        );
        
        if (success) {
          logger.info(`${symbol} 移动止盈平仓成功`);
        }
      } else {
        // 每10次检查输出一次调试日志
        if (history.checkCount % 10 === 0) {
          logger.debug(`${symbol} ${thresholdInfo.stage} 监控中: 峰值${history.peakPnlPercent.toFixed(2)}%, 当前${pnlPercent.toFixed(2)}%, 回退${drawdownPercent.toFixed(2)}% < 阈值${thresholdInfo.threshold.toFixed(2)}%`);
        }
      }
    }
    
    // 5. 清理已平仓的记录
    const activeSymbols = new Set(
      activePositions.map((p: any) => p.contract.replace("_USDT", ""))
    );
    
    for (const symbol of positionPnlHistory.keys()) {
      if (!activeSymbols.has(symbol)) {
        positionPnlHistory.delete(symbol);
        logger.debug(`清理已平仓的记录: ${symbol}`);
      }
    }
    
  } catch (error: any) {
    logger.error(`移动止盈检查失败: ${error.message}`);
  }
}

/**
 * 启动移动止盈监控
 */
export function startTrailingStopMonitor() {
  // 检查是否为波段策略
  if (!isTrailingStopEnabled()) {
    const strategy = process.env.TRADING_STRATEGY || "balanced";
    logger.info(`当前策略 [${strategy}] 未启用代码级移动止盈监控（仅 swing-trend 波段策略启用）`);
    return;
  }
  
  if (isRunning) {
    logger.warn("移动止盈监控已在运行中");
    return;
  }
  
  const config = getTrailingStopConfig();
  if (!config) {
    logger.error("波段策略移动止盈配置缺失");
    return;
  }
  
  isRunning = true;
  logger.info("启动移动止盈监控（优化版 - 5级规则，更细致 - 仅波段策略）");
  logger.info("  适用策略: swing-trend（波段趋势策略）");
  logger.info("  检查间隔: 10秒");
  logger.info(`  阶段1: ${config.stage1.description}`);
  logger.info(`  阶段2: ${config.stage2.description}`);
  logger.info(`  阶段3: ${config.stage3.description}`);
  logger.info(`  阶段4: ${config.stage4.description}`);
  logger.info(`  阶段5: ${config.stage5.description}`);
  
  // 立即执行一次
  checkTrailingStop();
  
  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkTrailingStop();
  }, 10 * 1000);
}

/**
 * 停止移动止盈监控
 */
export function stopTrailingStopMonitor() {
  if (!isRunning) {
    logger.warn("移动止盈监控未在运行");
    return;
  }
  
  isRunning = false;
  
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  
  positionPnlHistory.clear();
  logger.info("移动止盈监控已停止");
}


