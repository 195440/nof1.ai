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
 * 数据库迁移脚本：添加 partial_close_percentage 字段
 * 用于追踪分批止盈已平仓的百分比
 */

import { createClient } from "@libsql/client";

async function migrate() {
  const dbClient = createClient({
    url: "file:./.voltagent/trading.db",
  });

  try {
    console.log("开始数据库迁移...");

    // 检查字段是否已存在
    const tableInfo = await dbClient.execute({
      sql: "PRAGMA table_info(positions)",
      args: [],
    });

    const hasPartialCloseField = tableInfo.rows.some(
      (row: any) => row.name === "partial_close_percentage"
    );

    if (hasPartialCloseField) {
      console.log("✅ partial_close_percentage 字段已存在，跳过迁移");
      return;
    }

    // 添加新字段
    await dbClient.execute({
      sql: `ALTER TABLE positions ADD COLUMN partial_close_percentage REAL DEFAULT 0`,
      args: [],
    });

    console.log("✅ 成功添加 partial_close_percentage 字段");

    // 验证字段已添加
    const verifyResult = await dbClient.execute({
      sql: "SELECT partial_close_percentage FROM positions LIMIT 1",
      args: [],
    });

    console.log("✅ 字段验证通过");
    console.log("迁移完成！");
  } catch (error) {
    console.error("❌ 迁移失败:", error);
    process.exit(1);
  } finally {
    dbClient.close();
  }
}

migrate();

