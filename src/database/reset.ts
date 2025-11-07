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

import { createClient } from "@libsql/client";
import { createLogger } from "../utils/loggerUtils";
import "dotenv/config";

const logger = createLogger({
  name: "db-reset",
  level: "info",
});

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS account_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    total_value REAL NOT NULL,
    available_cash REAL NOT NULL,
    unrealized_pnl REAL NOT NULL,
    realized_pnl REAL NOT NULL,
    return_percent REAL NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS trading_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    price REAL NOT NULL,
    ema_20 REAL,
    ema_50 REAL,
    macd REAL,
    rsi_7 REAL,
    rsi_14 REAL,
    volume REAL,
    funding_rate REAL
);

CREATE TABLE IF NOT EXISTS agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    market_analysis TEXT NOT NULL,
    decision TEXT NOT NULL,
    actions_taken TEXT NOT NULL,
    account_value REAL NOT NULL,
    positions_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    order_id TEXT,
    price REAL NOT NULL,
    quantity REAL NOT NULL,
    amount REAL NOT NULL,
    leverage INTEGER,
    pnl REAL,
    fee REAL,
    status TEXT NOT NULL
);
`;

/**
 * 强制重新初始化数据库
 * 清空所有数据并重新创建表
 */
async function resetDatabase() {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    const initialBalance = Number.parseFloat(process.env.INITIAL_BALANCE || "1000");

    logger.info("⚠️  强制重新初始化数据库");
    logger.info(`数据库路径: ${dbUrl}`);
    logger.info(`初始资金: ${initialBalance} USDT`);

    const client = createClient({
      url: dbUrl,
    });

    // 删除所有表
    logger.info("🗑️  删除现有表...");
    await client.execute("DROP TABLE IF EXISTS trade_logs");
    await client.execute("DROP TABLE IF EXISTS agent_decisions");
    await client.execute("DROP TABLE IF EXISTS trading_signals");
    await client.execute("DROP TABLE IF EXISTS positions");
    await client.execute("DROP TABLE IF EXISTS account_history");
    logger.info("✅ 现有表已删除");

    // 重新创建表
    logger.info("📦 创建新表...");
    await client.executeMultiple(CREATE_TABLES_SQL);
    logger.info("✅ 表创建完成");

    // 插入初始资金记录
    logger.info(`💰 插入初始资金记录: ${initialBalance} USDT`);
    await client.execute({
      sql: `INSERT INTO account_history 
            (timestamp, total_value, available_cash, unrealized_pnl, realized_pnl, return_percent) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        new Date().toISOString(),
        initialBalance,
        initialBalance,
        0,
        0,
        0,
      ],
    });

    // 验证初始化结果
    const latestAccount = await client.execute(
      "SELECT * FROM account_history ORDER BY timestamp DESC LIMIT 1"
    );

    if (latestAccount.rows.length > 0) {
      const account = latestAccount.rows[0] as any;
      logger.info("\n" + "=".repeat(60));
      logger.info("✅ 数据库重置成功！");
      logger.info("=".repeat(60));
      logger.info("\n📊 初始账户状态:");
      logger.info(`  总资产: ${account.total_value} USDT`);
      logger.info(`  可用资金: ${account.available_cash} USDT`);
      logger.info(`  未实现盈亏: ${account.unrealized_pnl} USDT`);
      logger.info(`  已实现盈亏: ${account.realized_pnl} USDT`);
      logger.info(`  总收益率: ${account.return_percent}%`);
      logger.info("\n当前无持仓");
      logger.info("\n" + "=".repeat(60));
    }

    client.close();
    logger.info("\n🎉 数据库已重置为初始状态，可以开始交易了！");
    
  } catch (error) {
    logger.error("❌ 数据库重置失败:", error as any);
    process.exit(1);
  }
}

// 执行重置
resetDatabase();

