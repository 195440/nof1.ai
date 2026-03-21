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
 * 快速同步持仓（不重置数据库）
 * 从交易所同步持仓到本地数据库（支持 Gate.io 和 OKX）
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { createLogger } from "../utils/loggerUtils";
import { createExchangeClient, getExchangeType } from "../services/exchangeClient";

const logger = createLogger({
  name: "sync-positions",
  level: "info",
});

async function syncPositionsOnly() {
  try {
    const exchangeType = getExchangeType();
    const exchangeName = exchangeType === "okx" ? "OKX" : "Gate.io";
    logger.info(`🔄 从 ${exchangeName} 同步持仓...`);
    
    // 1. 连接数据库
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    const client = createClient({
      url: dbUrl,
    });
    
    // 2. 检查表是否存在，不存在则创建
    try {
      await client.execute("SELECT COUNT(*) FROM positions");
      logger.info("✅ 数据库表已存在");
    } catch (error) {
      logger.warn("⚠️  数据库表不存在，正在创建...");
      // 创建必要的表
      await client.execute(`
        CREATE TABLE IF NOT EXISTS positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          quantity REAL NOT NULL,
          entry_price REAL NOT NULL,
          current_price REAL NOT NULL,
          liquidation_price REAL NOT NULL,
          unrealized_pnl REAL NOT NULL,
          leverage INTEGER NOT NULL,
          side TEXT NOT NULL,
          profit_target REAL,
          stop_loss REAL,
          tp_order_id TEXT,
          sl_order_id TEXT,
          entry_order_id TEXT,
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          confidence REAL,
          risk_usd REAL,
          peak_pnl_percent REAL DEFAULT 0,
          partial_close_percentage REAL DEFAULT 0
        )
      `);
      logger.info("✅ 数据库表创建完成");
    }
    
    // 3. 从交易所获取持仓
    const exchangeClient = createExchangeClient();
    const positions = await exchangeClient.getPositions();
    const activePositions = positions.filter(p => Number.parseInt(p.size || "0") !== 0);
    const existingResult = await client.execute(
      "SELECT symbol, profit_target, stop_loss, tp_order_id, sl_order_id, entry_order_id, opened_at, peak_pnl_percent, partial_close_percentage FROM positions"
    );
    const existingPositionMap = new Map(
      existingResult.rows.map((row: any) => [row.symbol, row])
    );
    
    logger.info(`\n📊 ${exchangeName} 当前持仓数: ${activePositions.length}`);
    
    // 4. 清空本地持仓表
    await client.execute("DELETE FROM positions");
    logger.info("✅ 已清空本地持仓表");
    
    // 5. 同步持仓到数据库
    if (activePositions.length > 0) {
      logger.info(`\n🔄 同步 ${activePositions.length} 个持仓到数据库...`);
      
      for (const pos of activePositions) {
        const size = Number.parseInt(pos.size || "0");
        if (size === 0) continue;
        
        const symbol = pos.contract.replace("_USDT", "");
        const entryPrice = Number.parseFloat(pos.entryPrice || "0");
        const currentPrice = Number.parseFloat(pos.markPrice || "0");
        const leverage = Number.parseInt(pos.leverage || "1");
        const side = size > 0 ? "long" : "short";
        const quantity = Math.abs(size);
        const pnl = Number.parseFloat(pos.unrealisedPnl || "0");
        const liqPrice = Number.parseFloat(pos.liqPrice || "0");
        const existing = existingPositionMap.get(symbol);
        
        await client.execute({
          sql: `INSERT INTO positions 
                (symbol, quantity, entry_price, current_price, liquidation_price, unrealized_pnl,
                 leverage, side, profit_target, stop_loss, tp_order_id, sl_order_id,
                 entry_order_id, opened_at, peak_pnl_percent, partial_close_percentage)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            symbol,
            quantity,
            entryPrice,
            currentPrice,
            liqPrice,
            pnl,
            leverage,
            side,
            existing?.profit_target ?? null,
            existing?.stop_loss ?? null,
            existing?.tp_order_id ?? null,
            existing?.sl_order_id ?? null,
            existing?.entry_order_id || "synced",
            existing?.opened_at || new Date().toISOString(),
            existing?.peak_pnl_percent ?? 0,
            existing?.partial_close_percentage ?? 0,
          ],
        });
        
        logger.info(`   ✅ ${symbol}: ${quantity} 张 (${side}) @ ${entryPrice} | 盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`);
      }
    } else {
      logger.info("✅ 当前无持仓");
    }
    
    client.close();
    logger.info("\n✅ 持仓同步完成");
    
  } catch (error) {
    logger.error("❌ 同步失败:", error);
    process.exit(1);
  }
}

// 执行同步
syncPositionsOnly();
