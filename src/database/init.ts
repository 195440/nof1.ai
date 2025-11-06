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
 * 数据库初始化脚本
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { CREATE_TABLES_SQL } from "./schema";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
  name: "database-init",
  level: "info",
});

async function initDatabase() {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    const initialBalance = Number.parseFloat(process.env.INITIAL_BALANCE || "1000");

    logger.info(`初始化数据库: ${dbUrl}`);

    const client = createClient({
      url: dbUrl,
    });

    // 执行建表语句
    logger.info("创建数据库表...");
    await client.executeMultiple(CREATE_TABLES_SQL);

    // 检查是否需要重新初始化
    const existingHistory = await client.execute(
      "SELECT COUNT(*) as count FROM account_history"
    );
    const count = (existingHistory.rows[0] as any).count as number;

    if (count > 0) {
      // 检查第一条记录的资金是否与当前设置不同
      const firstRecord = await client.execute(
        "SELECT total_value FROM account_history ORDER BY id ASC LIMIT 1"
      );
      const firstBalance = Number.parseFloat(firstRecord.rows[0]?.total_value as string || "0");
      
      if (firstBalance !== initialBalance) {
        logger.warn(`⚠️  检测到初始资金变更: ${firstBalance} USDT -> ${initialBalance} USDT`);
        logger.info("清空现有数据，重新初始化...");
        
        // 清空所有交易数据
        await client.execute("DELETE FROM trades");
        await client.execute("DELETE FROM positions");
        await client.execute("DELETE FROM account_history");
        await client.execute("DELETE FROM trading_signals");
        await client.execute("DELETE FROM agent_decisions");
        
        logger.info("✅ 旧数据已清空");
      } else {
        logger.info(`数据库已有 ${count} 条账户历史记录，跳过初始化`);
        // 显示当前状态后直接返回
        const latestAccount = await client.execute(
          "SELECT * FROM account_history ORDER BY timestamp DESC LIMIT 1"
        );
        if (latestAccount.rows.length > 0) {
          const account = latestAccount.rows[0] as any;
          logger.info("当前账户状态:");
          logger.info(`  总资产: ${account.total_value} USDT`);
          logger.info(`  可用资金: ${account.available_cash} USDT`);
          logger.info(`  未实现盈亏: ${account.unrealized_pnl} USDT`);
          logger.info(`  总收益率: ${account.return_percent}%`);
        }
        
        const positions = await client.execute("SELECT * FROM positions");
        if (positions.rows.length > 0) {
          logger.info(`\n当前持仓 (${positions.rows.length}):`);
          for (const pos of positions.rows) {
            const p = pos as any;
            logger.info(`  ${p.symbol}: ${p.quantity} @ ${p.entry_price} (${p.side}, ${p.leverage}x)`);
          }
        } else {
          logger.info("\n当前无持仓");
        }
        
        logger.info("\n✅ 数据库初始化完成");
        client.close();
        return;
      }
    }

    // 插入初始账户记录
    logger.info(`插入初始资金记录: ${initialBalance} USDT`);
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
    logger.info("✅ 初始资金记录已创建");

    // 显示当前账户状态
    const latestAccount = await client.execute(
      "SELECT * FROM account_history ORDER BY timestamp DESC LIMIT 1"
    );

    if (latestAccount.rows.length > 0) {
      const account = latestAccount.rows[0] as any;
      logger.info("当前账户状态:");
      logger.info(`  总资产: ${account.total_value} USDT`);
      logger.info(`  可用资金: ${account.available_cash} USDT`);
      logger.info(`  未实现盈亏: ${account.unrealized_pnl} USDT`);
      logger.info(`  总收益率: ${account.return_percent}%`);
    }

    // 显示当前持仓
    const positions = await client.execute(
      "SELECT * FROM positions"
    );
    
    if (positions.rows.length > 0) {
      logger.info(`\n当前持仓 (${positions.rows.length}):`);
      for (const pos of positions.rows) {
        const p = pos as any;
        logger.info(`  ${p.symbol}: ${p.quantity} @ ${p.entry_price} (${p.side}, ${p.leverage}x)`);
      }
    } else {
      logger.info("\n当前无持仓");
    }

    logger.info("\n✅ 数据库初始化完成");
    client.close();
  } catch (error) {
    logger.error("❌ 数据库初始化失败:", error as any);
    process.exit(1);
  }
}

export { initDatabase };

