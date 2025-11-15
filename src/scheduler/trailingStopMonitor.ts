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
 * 实时峰值监控器 - 每10秒执行一次（适用所有策略）
 * 同时监控持仓峰值盈利和账户净值峰值
 * 
 * 功能分层：
 * 
 * 【核心功能 1 - 持仓峰值盈利监控（所有策略共享）】
 * 1. 每10秒从 Gate.io 获取最新持仓价格（markPrice）
 * 2. 计算每个持仓的当前盈利和峰值盈利
 * 3. 实时更新数据库中的峰值盈利（peak_pnl_percent）
 * 4. 确保 AI 在每个交易周期看到准确的持仓峰值回撤数据
 * 
 * 【核心功能 2 - 账户净值峰值监控（所有策略共享）】
 * 5. 每10秒从 Gate.io 获取账户信息（total + unrealisedPnl）
 * 6. 计算账户总净值（包含未实现盈亏）
 * 7. 如果净值创新高，立即记录到 account_history 表
 * 8. 确保 AI 在每个交易周期看到准确的账户峰值回撤数据
 * 
 * 【扩展功能 - 代码级自动平仓（根据策略配置启用）】
 * 9. 使用策略的 trailingStop 配置（3级规则）判断是否触发移动止盈
 * 10. 触发时立即平仓，记录到交易历史和决策数据
 * 
 * 策略适用范围：
 * - enableCodeLevelProtection = false（默认大多数策略）: 
 *   功能1-8（持仓峰值 + 账户峰值，AI 主动止盈）
 * - enableCodeLevelProtection = true（如 swing-trend）: 
 *   功能1-10（完整功能，包含自动平仓）
 * 
 * 移动止盈规则（示例 - swing-trend 策略，使用 trailingStop 配置）：
 * - Level 1: 峰值达到 15% 时，回落至 8% 平仓
 * - Level 2: 峰值达到 30% 时，回落至 20% 平仓
 * - Level 3: 峰值达到 50% 时，回落至 35% 平仓
 * 
 * 重要说明：
 * - 持仓峰值：每个持仓独立跟踪，盈利计算已考虑杠杆倍数
 * - 账户峰值：总净值包含未实现盈亏，净值创新高时立即入库
 * - 数据存储：持仓峰值存储在 positions.peak_pnl_percent
 * - 数据存储：账户峰值可通过 MAX(account_history.total_value) 查询
 * - 解决问题：彻底解决"交易周期长导致错过峰值"的问题
 * - 记录策略：账户净值创新高才入库，避免数据库记录过多
 */

import { createLogger } from "../utils/loggerUtils";
import { createClient } from "@libsql/client";
import { createExchangeClient } from "../services/exchangeClient";
import { getChinaTimeISO } from "../utils/timeUtils";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { getTradingStrategy, getStrategyParams } from "../agents/tradingAgent";
import { recordAccountAssets } from "./accountRecorder";

const logger = createLogger({
  name: "trailing-stop-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * 根据峰值盈利和当前盈利判断是否触发移动止盈
 * 使用策略的 trailingStop 配置
 * 
 * @returns { shouldClose: boolean, level: string, description: string }
 */
function checkTrailingStop(peakPnlPercent: number, currentPnlPercent: number): { 
  shouldClose: boolean; 
  level: string; 
  description: string;
  stopAt?: number;
} {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  if (!params.trailingStop) {
    throw new Error("移动止盈配置不存在");
  }
  
  const { level1, level2, level3 } = params.trailingStop;
  
  // 按照从高到低的顺序检查（level3 -> level2 -> level1）
  // 盈利达到 trigger% 时，如果当前盈利回落到 stopAt% 或以下，触发平仓
  const levels = [
    { name: "level3", trigger: level3.trigger, stopAt: level3.stopAt },
    { name: "level2", trigger: level2.trigger, stopAt: level2.stopAt },
    { name: "level1", trigger: level1.trigger, stopAt: level1.stopAt },
  ];
  
  for (const level of levels) {
    if (peakPnlPercent >= level.trigger) {
      // 峰值达到了触发点
      if (currentPnlPercent <= level.stopAt) {
        // 当前盈利回落到止损点或以下，触发平仓
        return {
          shouldClose: true,
          level: level.name,
          description: `峰值${peakPnlPercent.toFixed(2)}%，触发${level.trigger}%移动止盈，当前${currentPnlPercent.toFixed(2)}%已回落至${level.stopAt}%止损线`,
          stopAt: level.stopAt,
        };
      } else {
        // 还在止损线之上，继续持有
        return {
          shouldClose: false,
          level: level.name,
          description: `峰值${peakPnlPercent.toFixed(2)}%，触发${level.trigger}%移动止盈，止损线${level.stopAt}%，当前${currentPnlPercent.toFixed(2)}%`,
          stopAt: level.stopAt,
        };
      }
    }
  }
  
  // 峰值未达到任何触发点
  return {
    shouldClose: false,
    level: "未触发",
    description: `峰值${peakPnlPercent.toFixed(2)}%，未达到${level1.trigger}%触发点`,
  };
}

// 持仓盈利记录：symbol -> { peakPnlPercent, lastCheckTime, priceHistory }
const positionPnlHistory = new Map<string, {
  peakPnlPercent: number;
  lastCheckTime: number;
  checkCount: number; // 检查次数，用于日志
}>();

// 账户净值峰值记录（用于精确捕获账户净值峰值）
let accountPeakBalance: number = 0;
let lastAccountCheckTime: number = 0;
let accountCheckCount: number = 0;

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否启用代码级移动止盈
 */
function isTrailingStopEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取移动止盈配置（用于日志输出）
 */
function getTrailingStopConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  
  if (!params.trailingStop) {
    return null;
  }
  
  return {
    stage1: {
      description: `峰值达到 ${params.trailingStop.level1.trigger}% 时，回落至 ${params.trailingStop.level1.stopAt}% 平仓`,
      trigger: params.trailingStop.level1.trigger,
      stopAt: params.trailingStop.level1.stopAt,
    },
    stage2: {
      description: `峰值达到 ${params.trailingStop.level2.trigger}% 时，回落至 ${params.trailingStop.level2.stopAt}% 平仓`,
      trigger: params.trailingStop.level2.trigger,
      stopAt: params.trailingStop.level2.stopAt,
    },
    stage3: {
      description: `峰值达到 ${params.trailingStop.level3.trigger}% 时，回落至 ${params.trailingStop.level3.stopAt}% 平仓`,
      trigger: params.trailingStop.level3.trigger,
      stopAt: params.trailingStop.level3.stopAt,
    },
    // 为了兼容旧代码，添加 stage4 和 stage5（实际不使用）
    stage4: {
      description: `未使用（仅3级规则）`,
      trigger: 0,
      stopAt: 0,
    },
    stage5: {
      description: `未使用（仅3级规则）`,
      trigger: 0,
      stopAt: 0,
    },
  };
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
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;
  
  try {
    const size = side === 'long' ? -quantity : quantity;
    
    logger.warn(`【触发移动止盈 ${stage}】${symbol} ${side}`);
    logger.warn(`  峰值盈利: ${peakPnlPercent.toFixed(2)}%`);
    logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
    logger.warn(`  回撤幅度: ${drawdownPercent.toFixed(2)}% (阈值: ${drawdownThreshold.toFixed(2)}%)`);
    
    // 1. 执行平仓订单
    const order = await exchangeClient.placeOrder({
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
          logger.warn(`查询移动止盈订单状态失败 (重试${retry + 1}/5): ${statusError.message}`);
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
 * 检查所有持仓的峰值盈利并执行移动止盈（如果启用）
 * @param autoCloseEnabled 是否启用自动平仓（仅波段策略）
 */
async function checkPeakPnlAndTrailingStop(autoCloseEnabled: boolean) {
  if (!isRunning) {
    return;
  }
  
  try {
    const exchangeClient = createExchangeClient();
    const now = Date.now();
    
    // 1. ===== 账户净值峰值监控（所有策略共享）=====
    // 每 10 秒检查一次账户净值，如果创新高则记录到数据库
    try {
      accountCheckCount++;
      
      // 获取账户信息
      const account = await exchangeClient.getFuturesAccount();
      const accountTotal = Number.parseFloat(account.total || "0");
      const unrealisedPnl = Number.parseFloat(account.unrealisedPnl || "0");
      const totalBalance = accountTotal + unrealisedPnl; // 包含未实现盈亏的真实总资产
      
      // 初始化峰值（首次运行）
      if (accountPeakBalance === 0) {
        // 从数据库获取历史峰值
        const peakResult = await dbClient.execute(
          "SELECT MAX(total_value) as peak FROM account_history"
        );
        accountPeakBalance = peakResult.rows[0]?.peak 
          ? Number.parseFloat(peakResult.rows[0].peak as string)
          : totalBalance;
        
        logger.info(`账户净值峰值初始化: ${accountPeakBalance.toFixed(2)} USDT`);
      }
      
      // 如果当前净值创新高，立即记录到数据库
      if (totalBalance > accountPeakBalance) {
        const oldPeak = accountPeakBalance;
        accountPeakBalance = totalBalance;
        
        // 记录到数据库（跳过日志，避免过多输出）
        await recordAccountAssets(true);
        
        logger.info(`💰 账户净值创新高: ${oldPeak.toFixed(2)} USDT → ${accountPeakBalance.toFixed(2)} USDT`);
      } else {
        // 每 60 次检查（约 10 分钟）输出一次调试日志
        if (accountCheckCount % 60 === 0) {
          const drawdown = accountPeakBalance > 0 
            ? ((accountPeakBalance - totalBalance) / accountPeakBalance * 100) 
            : 0;
          logger.debug(
            `账户净值监控: 当前=${totalBalance.toFixed(2)} USDT, ` +
            `峰值=${accountPeakBalance.toFixed(2)} USDT, ` +
            `回撤=${drawdown.toFixed(2)}%`
          );
        }
      }
      
      lastAccountCheckTime = now;
    } catch (error: any) {
      logger.warn(`账户净值监控失败: ${error.message}`);
    }
    
    // 2. 获取所有持仓
    const gatePositions = await exchangeClient.getPositions();
    const activePositions = gatePositions.filter((p: any) => Number.parseInt(p.size || "0") !== 0);
    
    if (activePositions.length === 0) {
      // 清空内存记录
      positionPnlHistory.clear();
      return;
    }
    
    // 3. 从数据库获取持仓信息（获取开仓时间）
    const dbResult = await dbClient.execute("SELECT symbol, opened_at FROM positions");
    const dbOpenedAtMap = new Map(
      dbResult.rows.map((row: any) => [row.symbol, row.opened_at])
    );
    
    // 4. 检查每个持仓
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
        logger.warn(`${symbol} 数据无效，跳过峰值监控`);
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
        logger.info(`${symbol} 开始跟踪峰值盈利${autoCloseEnabled ? '和移动止盈' : '（仅更新峰值）'}，初始盈利: ${pnlPercent.toFixed(2)}%`);
      }
      
      // 增加检查次数
      history.checkCount++;
      
      // ===== 核心功能：更新峰值盈利（所有策略共享）=====
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
      
      // ===== 可选功能：移动止盈自动平仓（仅波段策略）=====
      if (!autoCloseEnabled) {
        // 非波段策略：仅更新峰值，不执行自动平仓
        continue;
      }
      
      // 5. 检查移动止盈条件（3级规则）- 仅波段策略
      // 使用 trailingStop 配置判断是否触发平仓
      const trailingStopResult = checkTrailingStop(history.peakPnlPercent, pnlPercent);
      
      // 调试日志：每10次检查输出一次
      if (history.checkCount % 10 === 0) {
        logger.debug(`${symbol} 移动止盈监控: ${trailingStopResult.description}`);
      }
      
      // 计算回退百分比（绝对值）
      const drawdownPercent = history.peakPnlPercent - pnlPercent;
      
      // 检查是否应该平仓
      if (trailingStopResult.shouldClose) {
        logger.warn(`${symbol} 触发移动止盈平仓:`);
        logger.warn(`  触发级别: ${trailingStopResult.level}`);
        logger.warn(`  ${trailingStopResult.description}`);
        logger.warn(`  峰值盈利: ${history.peakPnlPercent.toFixed(2)}%`);
        logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
        logger.warn(`  回退幅度: ${drawdownPercent.toFixed(2)}%`);
        logger.warn(`  止损线: ${trailingStopResult.stopAt}%`);
        
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
          trailingStopResult.stopAt || 0,
          `${trailingStopResult.level} - ${trailingStopResult.description}`
        );
        
        if (success) {
          logger.info(`${symbol} 移动止盈平仓成功`);
        }
      } else {
        // 每10次检查输出一次调试日志（修复：使用 trailingStopResult 而不是未定义的 thresholdInfo）
        if (history.checkCount % 10 === 0) {
          logger.debug(`${symbol} ${trailingStopResult.level} 监控中: 峰值${history.peakPnlPercent.toFixed(2)}%, 当前${pnlPercent.toFixed(2)}%, 回退${drawdownPercent.toFixed(2)}%`);
        }
      }
    }
    
    // 6. 清理已平仓的记录
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
 * 启动峰值盈利监控和移动止盈（适用所有策略）
 * - 所有策略：每10秒更新持仓峰值盈利
 * - 波段策略：额外执行自动移动止盈平仓
 */
export function startTrailingStopMonitor() {
  if (isRunning) {
    logger.warn("峰值盈利监控已在运行中");
    return;
  }
  
  const strategy = getTradingStrategy();
  const autoCloseEnabled = isTrailingStopEnabled(); // swing-trend 策略返回 true
  
  isRunning = true;
  
  logger.info("=".repeat(60));
  logger.info("🚀 启动实时峰值监控（持仓 + 账户）");
  logger.info("=".repeat(60));
  logger.info(`  当前策略: ${strategy}`);
  logger.info(`  检查间隔: 10秒`);
  logger.info(``);
  logger.info(`  【持仓峰值监控】`);
  logger.info(`    峰值更新: ✅ 启用（所有策略）`);
  logger.info(`    自动平仓: ${autoCloseEnabled ? '✅ 启用（波段策略）' : '❌ 禁用（由 AI 决策）'}`);
  logger.info(``);
  logger.info(`  【账户净值峰值监控】`);
  logger.info(`    峰值更新: ✅ 启用（所有策略）`);
  logger.info(`    精确记录: 净值创新高时立即写入数据库`);
  logger.info(`    解决问题: 交易周期长导致错过净值峰值`);
  
  if (autoCloseEnabled) {
    const config = getTrailingStopConfig();
    if (config) {
      logger.info(``);
      logger.info(`  【移动止盈规则】（仅波段策略）`);
      logger.info(`    阶段1: ${config.stage1.description}`);
      logger.info(`    阶段2: ${config.stage2.description}`);
      logger.info(`    阶段3: ${config.stage3.description}`);
      logger.info(`    阶段4: ${config.stage4.description}`);
      logger.info(`    阶段5: ${config.stage5.description}`);
    }
  } else {
    logger.info(``);
    logger.info(`  【说明】`);
    logger.info(`    • 持仓：仅更新峰值盈利，不执行自动平仓`);
    logger.info(`    • 账户：精确捕获净值峰值，供 AI 计算回撤`);
    logger.info(`    • 决策：所有平仓决策由 AI 根据峰值数据判断`);
  }
  logger.info("=".repeat(60));
  
  // 立即执行一次
  checkPeakPnlAndTrailingStop(autoCloseEnabled);
  
  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkPeakPnlAndTrailingStop(autoCloseEnabled);
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


