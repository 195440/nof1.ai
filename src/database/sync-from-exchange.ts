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
 * 从交易所同步账户资金并重新初始化数据库
 * 支持 Gate.io 和 OKX 交易所
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { CREATE_TABLES_SQL } from "./schema";
import { createLogger } from "../utils/loggerUtils";
import { createExchangeClient, getExchangeType } from "../services/exchangeClient";
import { normalizeFuturesAccount } from "../utils/accountUtils";
import * as fs from "node:fs";
import * as path from "node:path";

const logger = createLogger({
  name: "sync-from-exchange",
  level: "info",
});

async function syncFromExchange() {
  try {
    const exchangeType = getExchangeType();
    const exchangeName = exchangeType === "okx" ? "OKX" : "Gate.io";
    
    logger.info(`🔄 从 ${exchangeName} 同步账户信息...`);
    
    // 1. 连接交易所获取当前账户余额
    const exchangeClient = createExchangeClient();
    const account = await exchangeClient.getFuturesAccount();
    const balances = normalizeFuturesAccount(account);
    const currentBalance = balances.equityBalance;
    
    logger.info(`\n📊 ${exchangeName} 当前账户状态:`);
    logger.info(`   现金余额: ${balances.cashBalance} USDT`);
    logger.info(`   未实现盈亏: ${balances.unrealisedPnl >= 0 ? '+' : ''}${balances.unrealisedPnl} USDT`);
    logger.info(`   总资产(含盈亏): ${currentBalance} USDT`);
    logger.info(`   可用资金: ${balances.availableBalance} USDT`);
    
    // 2. 获取持仓信息
    const positions = await exchangeClient.getPositions();
    const activePositions = positions.filter(p => Number.parseInt(p.size || "0") !== 0);
    logger.info(`   当前持仓数: ${activePositions.length}`);
    
    if (activePositions.length > 0) {
      logger.info(`\n   持仓详情:`);
      for (const pos of activePositions) {
        const size = Number.parseInt(pos.size || "0");
        const symbol = pos.contract.replace("_USDT", "");
        const side = size > 0 ? "做多" : "做空";
        const pnl = Number.parseFloat(pos.unrealisedPnl || "0");
        logger.info(`     ${symbol}: ${Math.abs(size)} 张 (${side}) | 盈亏: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`);
      }
    }
    
    // 3. 确认是否继续
    logger.info(`\n${"=".repeat(60)}`);
    logger.info(`⚠️  将以当前账户资金 ${currentBalance} USDT 作为新的初始资金`);
    logger.info(`   这将重置所有历史数据和收益率统计！`);
    logger.info(`${"=".repeat(60)}\n`);
    
    // 等待 3 秒让用户看清信息
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. 连接数据库
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    logger.info(`📦 连接数据库: ${dbUrl}`);
    
    const client = createClient({
      url: dbUrl,
    });
    
    // 5. 删除现有表
    logger.info("🗑️  删除现有表...");
    await client.executeMultiple(`
      DROP TABLE IF EXISTS trades;
      DROP TABLE IF EXISTS positions;
      DROP TABLE IF EXISTS account_history;
      DROP TABLE IF EXISTS trading_signals;
      DROP TABLE IF EXISTS agent_decisions;
    `);
    logger.info("✅ 现有表已删除");
    
    // 6. 创建新表
    logger.info("📦 创建新表...");
    await client.executeMultiple(CREATE_TABLES_SQL);
    logger.info("✅ 表创建完成");
    
    // 7. 插入初始账户记录（使用交易所的实际资金）
    logger.info(`💰 插入初始资金记录: ${currentBalance} USDT`);
    await client.execute({
      sql: `INSERT INTO account_history 
            (timestamp, total_value, available_cash, unrealized_pnl, realized_pnl, return_percent) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        new Date().toISOString(),
        currentBalance,
        balances.availableBalance,
        balances.unrealisedPnl,
        0, // realized_pnl 从 0 开始
        0, // return_percent 从 0% 开始
      ],
    });
    
    // 8. 同步持仓到数据库
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
        
        // 生成占位符 order_id
        const entryOrderId = `synced-${symbol}-${Date.now()}`;
        
        await client.execute({
          sql: `INSERT INTO positions 
                (symbol, quantity, entry_price, current_price, liquidation_price, unrealized_pnl, 
                 leverage, side, entry_order_id, opened_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            symbol,
            quantity,
            entryPrice,
            currentPrice,
            liqPrice,
            pnl,
            leverage,
            side,
            entryOrderId,
            new Date().toISOString(),
          ],
        });
        
        logger.info(`   ✅ ${symbol}: ${quantity} 张 (${side}) @ ${entryPrice}`);
      }
    }
    
    // 9. 更新 .env 文件中的 INITIAL_BALANCE
    logger.info(`\n🔧 更新 .env 文件...`);
    try {
      const envPath = path.join(process.cwd(), ".env");
      let envContent = fs.readFileSync(envPath, "utf-8");
      
      // 替换 INITIAL_BALANCE 的值
      const newBalance = currentBalance.toFixed(2);
      const balanceRegex = /^INITIAL_BALANCE=.*$/m;
      
      if (balanceRegex.test(envContent)) {
        // 如果存在，则替换
        envContent = envContent.replace(balanceRegex, `INITIAL_BALANCE=${newBalance}`);
        logger.info(`   更新 INITIAL_BALANCE: ${newBalance} USDT`);
      } else {
        // 如果不存在，则在交易配置部分添加
        const tradingConfigRegex = /(# 交易配置[\s\S]*?)(# =+)/;
        if (tradingConfigRegex.test(envContent)) {
          envContent = envContent.replace(
            tradingConfigRegex,
            `$1INITIAL_BALANCE=${newBalance}\n\n$2`
          );
          logger.info(`   添加 INITIAL_BALANCE: ${newBalance} USDT`);
        }
      }
      
      fs.writeFileSync(envPath, envContent, "utf-8");
      logger.info(`✅ .env 文件已更新`);
    } catch (error) {
      logger.warn(`⚠️  更新 .env 文件失败:`, error);
      logger.warn(`   请手动设置 INITIAL_BALANCE=${currentBalance.toFixed(2)}`);
    }
    
    // 10. 显示最终状态
    logger.info(`\n${"=".repeat(60)}`);
    logger.info("✅ 数据库和配置同步完成！");
    logger.info(`${"=".repeat(60)}`);
    
    logger.info(`\n📊 新的初始状态:`);
    logger.info(`   交易所: ${exchangeName}`);
    logger.info(`   总资产: ${currentBalance} USDT`);
    logger.info(`   可用资金: ${balances.availableBalance} USDT`);
    logger.info(`   未实现盈亏: ${balances.unrealisedPnl} USDT`);
    logger.info(`   已实现盈亏: 0 USDT`);
    logger.info(`   总收益率: 0%`);
    logger.info(`   持仓数: ${activePositions.length}`);
    
    logger.info(`\n💡 提示:`);
    logger.info(`   1. 数据库已同步，初始资金: ${currentBalance.toFixed(2)} USDT`);
    logger.info(`   2. .env 文件已更新，INITIAL_BALANCE: ${currentBalance.toFixed(2)} USDT`);
    logger.info(`   3. 从现在开始，收益率将基于此金额计算`);
    logger.info(`\n🚀 可以运行以下命令启动交易系统:`);
    logger.info(`   npm run trading:start`);
    
    client.close();
  } catch (error) {
    logger.error("❌ 同步失败:", error as any);
    process.exit(1);
  }
}

// 执行同步
syncFromExchange();
