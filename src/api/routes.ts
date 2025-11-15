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
 * API 路由
 */
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createClient } from "@libsql/client";
import { createExchangeClient } from "../services/exchangeClient";
import { createLogger } from "../utils/loggerUtils";
import { getTradingStrategy, getStrategyParams } from "../agents/tradingAgent";
import { RISK_PARAMS } from "../config/riskParams";
import { getChinaTimeISO } from "../utils/timeUtils";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { ipBlacklistMiddleware } from "../middleware/ipBlacklist";

const logger = createLogger({
  name: "api-routes",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

export function createApiRoutes() {
  const app = new Hono();

  // IP 黑名单中间件 - 拦截黑名单 IP
  app.use("*", ipBlacklistMiddleware);

  // 静态文件服务 - 需要使用绝对路径
  app.use("/*", serveStatic({ root: "./public" }));

  /**
   * 获取账户总览
   * 
   * Gate.io 账户结构：
   * - account.total = available + positionMargin
   * - account.total 不包含未实现盈亏
   * - 真实总资产 = account.total + unrealisedPnl
   * 
   * API返回说明：
   * - totalBalance: 不包含未实现盈亏的总资产（用于计算已实现收益）
   * - unrealisedPnl: 当前持仓的未实现盈亏
   * 
   * 前端显示：
   * - 总资产显示 = totalBalance + unrealisedPnl（实时反映持仓盈亏）
   */
  app.get("/api/account", async (c) => {
    try {
      const exchangeClient = createExchangeClient();
      const account = await exchangeClient.getFuturesAccount();
      
      // 从数据库获取初始资金
      const initialResult = await dbClient.execute(
        "SELECT total_value FROM account_history ORDER BY timestamp ASC LIMIT 1"
      );
      const initialBalance = initialResult.rows[0]
        ? Number.parseFloat(initialResult.rows[0].total_value as string)
        : 100;
      
      // Gate.io 的 account.total 不包含未实现盈亏
      // 总资产（不含未实现盈亏）= account.total
      const unrealisedPnl = Number.parseFloat(account.unrealisedPnl || "0");
      const totalBalance = Number.parseFloat(account.total || "0");
      
      // 收益率 = (总资产 - 初始资金) / 初始资金 * 100
      // 总资产不包含未实现盈亏，收益率反映已实现盈亏
      const returnPercent = ((totalBalance - initialBalance) / initialBalance) * 100;
      
      return c.json({
        totalBalance,  // 总资产（不包含未实现盈亏）
        availableBalance: Number.parseFloat(account.available || "0"),
        positionMargin: Number.parseFloat(account.positionMargin || "0"),
        unrealisedPnl,
        returnPercent,  // 收益率（不包含未实现盈亏）
        initialBalance,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取当前持仓 - 从 Gate.io 获取实时数据
   */
  app.get("/api/positions", async (c) => {
    try {
      const exchangeClient = createExchangeClient();
      const gatePositions = await exchangeClient.getPositions();
      
      // 从数据库获取止损止盈信息
      const dbResult = await dbClient.execute("SELECT symbol, stop_loss, profit_target FROM positions");
      const dbPositionsMap = new Map(
        dbResult.rows.map((row: any) => [row.symbol, row])
      );
      
      // 过滤并格式化持仓
      const positions = gatePositions
        .filter((p: any) => Number.parseInt(p.size || "0") !== 0)
        .map((p: any) => {
          const size = Number.parseInt(p.size || "0");
          const symbol = p.contract.replace("_USDT", "");
          const dbPos = dbPositionsMap.get(symbol);
          const entryPrice = Number.parseFloat(p.entryPrice || "0");
          const quantity = Math.abs(size);
          const leverage = Number.parseInt(p.leverage || "1");
          
          // 开仓价值（保证金）: 从Gate.io API直接获取
          const openValue = Number.parseFloat(p.margin || "0");
          
          return {
            symbol,
            quantity,
            entryPrice,
            currentPrice: Number.parseFloat(p.markPrice || "0"),
            liquidationPrice: Number.parseFloat(p.liqPrice || "0"),
            unrealizedPnl: Number.parseFloat(p.unrealisedPnl || "0"),
            leverage,
            side: size > 0 ? "long" : "short",
            openValue,
            profitTarget: dbPos?.profit_target ? Number(dbPos.profit_target) : null,
            stopLoss: dbPos?.stop_loss ? Number(dbPos.stop_loss) : null,
            openedAt: p.create_time || new Date().toISOString(),
          };
        });
      
      return c.json({ positions });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取账户价值历史（用于绘图）
   */
  app.get("/api/history", async (c) => {
    try {
      const limitParam = c.req.query("limit");
      
      let result;
      if (limitParam) {
        // 如果传递了 limit 参数，使用 LIMIT 子句
        const limit = Number.parseInt(limitParam);
        result = await dbClient.execute({
          sql: `SELECT timestamp, total_value, unrealized_pnl, return_percent 
                FROM account_history 
                ORDER BY timestamp DESC 
                LIMIT ?`,
          args: [limit],
        });
      } else {
        // 如果没有传递 limit 参数，返回全部数据
        result = await dbClient.execute(
          `SELECT timestamp, total_value, unrealized_pnl, return_percent 
           FROM account_history 
           ORDER BY timestamp DESC`
        );
      }
      
      const history = result.rows.map((row: any) => ({
        timestamp: row.timestamp,
        totalValue: Number.parseFloat(row.total_value as string) || 0,
        unrealizedPnl: Number.parseFloat(row.unrealized_pnl as string) || 0,
        returnPercent: Number.parseFloat(row.return_percent as string) || 0,
      })).reverse(); // 反转，使时间从旧到新
      
      return c.json({ history });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取交易记录 - 从数据库获取历史仓位（已平仓的记录）
   */
  app.get("/api/trades", async (c) => {
    try {
      const limit = Number.parseInt(c.req.query("limit") || "10");
      const symbol = c.req.query("symbol"); // 可选，筛选特定币种
      
      // 从数据库获取历史交易记录（按 ID 降序，确保最新的在前）
      let sql = `SELECT * FROM trades ORDER BY id DESC LIMIT ?`;
      let args: any[] = [limit];
      
      if (symbol) {
        sql = `SELECT * FROM trades WHERE symbol = ? ORDER BY id DESC LIMIT ?`;
        args = [symbol, limit];
      }
      
      logger.info(`查询交易记录: limit=${limit}, symbol=${symbol || 'all'}`);
      
      const result = await dbClient.execute({
        sql,
        args,
      });
      
      logger.info(`查询到 ${result.rows.length} 条交易记录`);
      
      if (!result.rows || result.rows.length === 0) {
        return c.json({ trades: [] });
      }
      
      // 转换数据库格式到前端需要的格式
      const trades = result.rows.map((row: any) => {
        return {
          id: row.id,
          orderId: row.order_id,
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
      
      return c.json({ trades });
    } catch (error: any) {
      logger.error("获取历史仓位失败:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取 Agent 决策日志
   */
  app.get("/api/logs", async (c) => {
    try {
      const limit = c.req.query("limit") || "20";
      
      const result = await dbClient.execute({
        sql: `SELECT * FROM agent_decisions 
              ORDER BY timestamp DESC 
              LIMIT ?`,
        args: [Number.parseInt(limit)],
      });
      
      const logs = result.rows.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        iteration: row.iteration,
        decision: row.decision,
        actionsTaken: row.actions_taken,
        accountValue: row.account_value,
        positionsCount: row.positions_count,
      }));
      
      return c.json({ logs });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取交易统计
   */
  app.get("/api/stats", async (c) => {
    try {
      // 统计总交易次数 - 使用 pnl IS NOT NULL 来确保这是已完成的平仓交易
      const totalTradesResult = await dbClient.execute(
        "SELECT COUNT(*) as count FROM trades WHERE type = 'close' AND pnl IS NOT NULL"
      );
      const totalTrades = (totalTradesResult.rows[0] as any).count;
      
      // 统计盈利交易
      const winTradesResult = await dbClient.execute(
        "SELECT COUNT(*) as count FROM trades WHERE type = 'close' AND pnl IS NOT NULL AND pnl > 0"
      );
      const winTrades = (winTradesResult.rows[0] as any).count;
      
      // 计算胜率
      const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
      
      // 计算总盈亏
      const pnlResult = await dbClient.execute(
        "SELECT SUM(pnl) as total_pnl FROM trades WHERE type = 'close' AND pnl IS NOT NULL"
      );
      const totalPnl = (pnlResult.rows[0] as any).total_pnl || 0;
      
      // 获取最大单笔盈利和亏损
      const maxWinResult = await dbClient.execute(
        "SELECT MAX(pnl) as max_win FROM trades WHERE type = 'close' AND pnl IS NOT NULL"
      );
      const maxWin = (maxWinResult.rows[0] as any).max_win || 0;
      
      const maxLossResult = await dbClient.execute(
        "SELECT MIN(pnl) as max_loss FROM trades WHERE type = 'close' AND pnl IS NOT NULL"
      );
      const maxLoss = (maxLossResult.rows[0] as any).max_loss || 0;
      
      return c.json({
        totalTrades,
        winTrades,
        lossTrades: totalTrades - winTrades,
        winRate,
        totalPnl,
        maxWin,
        maxLoss,
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取多个币种的实时价格
   */
  app.get("/api/prices", async (c) => {
    try {
      const symbolsParam = c.req.query("symbols") || "BTC,ETH,SOL,BNB,DOGE,XRP";
      const symbols = symbolsParam.split(",").map(s => s.trim());
      
      const exchangeClient = createExchangeClient();
      const prices: Record<string, number> = {};
      
      // 并发获取所有币种价格
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const contract = `${symbol}_USDT`;
            const ticker = await exchangeClient.getFuturesTicker(contract);
            prices[symbol] = Number.parseFloat(ticker.last || "0");
          } catch (error: any) {
            logger.error(`获取 ${symbol} 价格失败:`, error);
            prices[symbol] = 0;
          }
        })
      );
      
      return c.json({ prices });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 获取当前交易策略配置
   */
  app.get("/api/strategy", async (c) => {
    try {
      const strategy = getTradingStrategy();
      const params = getStrategyParams(strategy);
      const intervalMinutes = Number.parseInt(process.env.TRADING_INTERVAL_MINUTES || "20");
      
      // 策略名称映射
      const strategyNames: Record<string, string> = {
        "ultra-short": "超短线",
        "swing-trend": "波段趋势",
        "medium-long": "中长线",
        "conservative": "稳健",
        "balanced": "平衡",
        "aggressive": "激进",
        "aggressive-team": "激进团",
        "rebate-farming": "返佣套利",
        "ai-autonomous": "AI自主",
        "multi-agent-consensus": "陪审团策略"
      };
      
      return c.json({
        strategy,
        strategyName: strategyNames[strategy] || strategy,
        intervalMinutes,
        maxLeverage: RISK_PARAMS.MAX_LEVERAGE,
        maxPositions: RISK_PARAMS.MAX_POSITIONS,
        leverageRange: `${params.leverageMin}-${params.leverageMax}x`,
        positionSizeRange: `${params.positionSizeMin}-${params.positionSizeMax}%`,
        enableCodeLevelProtection: params.enableCodeLevelProtection,
        allowAiOverrideProtection: params.allowAiOverrideProtection || false,
        description: params.description
      });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  /**
   * 手动平仓接口 - 需要验证密码
   */
  app.post("/api/close-position", async (c) => {
    try {
      // 获取请求体
      const body = await c.req.json();
      const { symbol, password } = body;
      
      // 验证必填参数
      if (!symbol) {
        return c.json({ success: false, message: "缺少必填参数: symbol" }, 400);
      }
      
      // 验证密码 - 仅使用 CLOSE_POSITION_PASSWORD
      const correctPassword = process.env.CLOSE_POSITION_PASSWORD;
      
      // 如果未配置密码，拒绝平仓
      if (!correctPassword) {
        logger.error('平仓密码未配置 - 请在环境变量中设置 CLOSE_POSITION_PASSWORD');
        return c.json({ 
          success: false, 
          message: "平仓功能未启用" 
        }, 403);
      }
      
      if (!password || password !== correctPassword) {
        logger.warn(`平仓密码验证失败 - 币种: ${symbol}`);
        return c.json({ success: false, message: "密码错误" }, 403);
      }
      
      logger.info(`开始手动平仓: ${symbol}`);
      
      const exchangeClient = createExchangeClient();
      const contract = `${symbol}_USDT`;
      
      // 获取当前持仓
      const allPositions = await exchangeClient.getPositions();
      const gatePosition = allPositions.find((p: any) => 
        p.contract === contract && Number.parseInt(p.size || "0") !== 0
      );
      
      if (!gatePosition) {
        return c.json({ 
          success: false, 
          message: `没有找到 ${symbol} 的持仓` 
        }, 404);
      }
      
      // 获取持仓信息
      const size = Number.parseInt(gatePosition.size || "0");
      const side = size > 0 ? "long" : "short";
      const entryPrice = Number.parseFloat(gatePosition.entryPrice || "0");
      const currentPrice = Number.parseFloat(gatePosition.markPrice || "0");
      const leverage = Number.parseInt(gatePosition.leverage || "1");
      const quantity = Math.abs(size);
      
      // 获取合约乘数（不同币种的合约乘数不同）
      const quantoMultiplier = await getQuantoMultiplier(contract);
      logger.info(`${symbol} 合约乘数: ${quantoMultiplier}`);
      
      // 计算盈亏
      let grossPnl = 0;
      if (side === "long") {
        grossPnl = (currentPrice - entryPrice) * quantity * quantoMultiplier;
      } else {
        grossPnl = (entryPrice - currentPrice) * quantity * quantoMultiplier;
      }
      
      // 计算手续费
      const takerFee = 0.0005;
      const openFee = entryPrice * quantity * quantoMultiplier * takerFee;
      const closeFee = currentPrice * quantity * quantoMultiplier * takerFee;
      const totalFees = openFee + closeFee;
      const pnl = grossPnl - totalFees;
      
      logger.info(`手动平仓 ${symbol} ${side === "long" ? "做多" : "做空"} ${quantity}张 (入场: ${entryPrice.toFixed(2)}, 当前: ${currentPrice.toFixed(2)}, 盈亏: ${pnl.toFixed(2)})`);
      
      // 执行平仓
      const closeSize = side === "long" ? -quantity : quantity;
      const order = await exchangeClient.placeOrder({
        contract,
        size: closeSize,
        price: 0,  // 市价单
        reduceOnly: true,
      });
      
      logger.info(`已下达手动平仓订单 ${symbol}，订单ID: ${order.id}`);
      
      // 等待订单完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 获取实际成交信息
      let actualExitPrice = currentPrice;
      let orderStatus = "filled";
      
      if (order.id) {
        try {
          const orderInfo = await exchangeClient.getOrder(order.id);
          if (orderInfo.status === "finished") {
            actualExitPrice = Number.parseFloat(orderInfo.fillPrice || orderInfo.price || currentPrice.toString());
            orderStatus = "filled";
          }
        } catch (error: any) {
          logger.warn(`获取订单信息失败: ${error.message}`);
        }
      }
      
      // 重新计算实际盈亏（使用实际成交价格）
      if (side === "long") {
        grossPnl = (actualExitPrice - entryPrice) * quantity * quantoMultiplier;
      } else {
        grossPnl = (entryPrice - actualExitPrice) * quantity * quantoMultiplier;
      }
      const actualCloseFee = actualExitPrice * quantity * quantoMultiplier * takerFee;
      const actualPnl = grossPnl - openFee - actualCloseFee;
      
      // 记录到交易历史
      try {
        logger.info(`准备记录平仓交易到数据库: ${symbol}, 订单ID: ${order.id || `manual_${Date.now()}`}`);
        
        const insertResult = await dbClient.execute({
          sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
                VALUES (?, ?, ?, 'close', ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            order.id || `manual_${Date.now()}`,
            symbol,
            side,
            actualExitPrice,
            quantity,
            leverage,
            actualPnl,
            openFee + actualCloseFee,
            getChinaTimeISO(),
            orderStatus,
          ],
        });
        
        logger.info(`✓ 交易历史记录成功，记录ID: ${insertResult.lastInsertRowid}`);
      } catch (dbError: any) {
        logger.error(`✗ 记录交易历史失败: ${dbError.message}`, dbError);
        throw dbError; // 抛出错误以便外层 catch 捕获
      }
      
      // 从数据库删除持仓记录
      try {
        const deleteResult = await dbClient.execute({
          sql: "DELETE FROM positions WHERE symbol = ?",
          args: [symbol],
        });
        logger.info(`✓ 已删除持仓记录: ${symbol}, 影响行数: ${deleteResult.rowsAffected}`);
      } catch (dbError: any) {
        logger.error(`✗ 删除持仓记录失败: ${dbError.message}`, dbError);
        // 这里不抛出错误，因为交易已经完成
      }
      
      logger.info(`手动平仓完成 ${symbol}, 盈亏: ${actualPnl.toFixed(2)} USDT`);
      
      return c.json({
        success: true,
        message: `成功平仓 ${symbol}`,
        data: {
          symbol,
          side,
          quantity,
          entryPrice,
          exitPrice: actualExitPrice,
          pnl: actualPnl,
          fee: openFee + actualCloseFee,
        },
      });
    } catch (error: any) {
      logger.error("手动平仓失败:", error);
      return c.json({ 
        success: false, 
        message: `平仓失败: ${error.message}` 
      }, 500);
    }
  });

  return app;
}

