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
  name: "db-migration-fee",
  level: "info",
});

/**
 * 给trades表添加fee字段
 */
async function addFeeColumn() {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    logger.info(`📦 连接数据库: ${dbUrl}`);
    
    const client = createClient({
      url: dbUrl,
    });
    
    logger.info("🔧 检查trades表结构...");
    
    // 检查fee列是否已存在
    const tableInfo = await client.execute({
      sql: "PRAGMA table_info(trades)",
      args: [],
    });
    
    const hasFeeColumn = tableInfo.rows.some((row: any) => row.name === 'fee');
    
    if (hasFeeColumn) {
      logger.info("✅ fee字段已存在，无需添加");
      return;
    }
    
    // 添加fee列
    logger.info("➕ 添加fee字段到trades表...");
    await client.execute({
      sql: "ALTER TABLE trades ADD COLUMN fee REAL",
      args: [],
    });
    
    logger.info("✅ fee字段添加成功");
    
    // 验证
    const newTableInfo = await client.execute({
      sql: "PRAGMA table_info(trades)",
      args: [],
    });
    
    logger.info("\n当前trades表结构:");
    for (const row of newTableInfo.rows) {
      logger.info(`  - ${row.name}: ${row.type}`);
    }
    
    logger.info("\n✅ 数据库迁移完成！");
    
    process.exit(0);
  } catch (error: any) {
    logger.error(`❌ 迁移失败: ${error.message}`);
    process.exit(1);
  }
}

addFeeColumn();

