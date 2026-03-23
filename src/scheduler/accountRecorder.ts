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
 * Account Recorder - Record account assets every 10 minutes
 * 账户资产记录器 - 每10分钟记录一次账户资产（包含未实现盈亏）
 */
import cron from "node-cron";
import { createLogger } from "../utils/loggerUtils";
import { createClient } from "@libsql/client";
import { createExchangeClient } from "../services/exchangeClient";
import { getChinaTimeISO } from "../utils/timeUtils";
import { calculateReturnPercent, normalizeFuturesAccount } from "../utils/accountUtils";

const logger = createLogger({
  name: "account-recorder",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * Record account assets including unrealized PnL
 * 记录账户资产（包含未实现盈亏）
 * @param skipLog 是否跳过日志输出（避免实时监控时日志过多）
 */
export async function recordAccountAssets(skipLog: boolean = false) {
  try {
    const exchangeClient = createExchangeClient();
    const account = await exchangeClient.getFuturesAccount();
    const balances = normalizeFuturesAccount(account);
    
    // Get initial balance from database
    const initialResult = await dbClient.execute(
      "SELECT total_value FROM account_history ORDER BY timestamp ASC LIMIT 1"
    );
    const initialBalance = initialResult.rows[0]
      ? Number.parseFloat(initialResult.rows[0].total_value as string)
      : balances.equityBalance;

    const realizedPnl = balances.cashBalance - initialBalance;
    const returnPercent = calculateReturnPercent(balances.equityBalance, initialBalance);
    
    // Save to database
    await dbClient.execute({
      sql: `INSERT INTO account_history 
            (timestamp, total_value, available_cash, unrealized_pnl, realized_pnl, return_percent)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        getChinaTimeISO(),
        balances.equityBalance,
        balances.availableBalance,
        balances.unrealisedPnl,
        realizedPnl,
        returnPercent,
      ],
    });
    
    if (!skipLog) {
      logger.info(
        `📊 Account recorded: Total=${balances.equityBalance.toFixed(2)} USDT, ` +
        `Cash=${balances.cashBalance.toFixed(2)} USDT, ` +
        `Available=${balances.availableBalance.toFixed(2)} USDT, ` +
        `Unrealized PnL=${balances.unrealisedPnl >= 0 ? '+' : ''}${balances.unrealisedPnl.toFixed(2)} USDT, ` +
        `Return=${returnPercent >= 0 ? '+' : ''}${returnPercent.toFixed(2)}%`
      );
    }
    
    return {
      cashBalance: balances.cashBalance,
      totalBalance: balances.equityBalance,
      availableBalance: balances.availableBalance,
      unrealisedPnl: balances.unrealisedPnl,
      realizedPnl,
      returnPercent,
    };
  } catch (error) {
    logger.error("Failed to record account assets:", error as any);
    return null;
  }
}

/**
 * Start account recorder
 * 启动账户资产记录器
 */
export function startAccountRecorder() {
  const intervalMinutes = Number.parseInt(
    process.env.ACCOUNT_RECORD_INTERVAL_MINUTES || "10"
  );
  
  logger.info(`Starting account recorder, interval: ${intervalMinutes} minutes`);
  
  // Execute immediately on startup
  recordAccountAssets();
  
  // Schedule periodic recording
  const cronExpression = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpression, () => {
    recordAccountAssets();
  });
  
  logger.info(`Account recorder scheduled: ${cronExpression}`);
}
