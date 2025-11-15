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
 * 查询交易所历史仓位记录
 * 用于输出账号合约的历史仓位记录
 */

import { createExchangeClient, getExchangeType } from "../src/services/exchangeClient.js";
import { createLogger } from "../src/utils/loggerUtils";

const logger = createLogger({
  name: "query-position-history",
  level: "info",
});

async function queryPositionHistory() {
  try {
    const exchangeType = getExchangeType();
    const exchangeName = exchangeType === "okx" ? "OKX" : "Gate.io";
    
    const exchangeClient = createExchangeClient();
    
    logger.info("=".repeat(80));
    logger.info(`开始查询 ${exchangeName} 历史仓位记录...`);
    logger.info("=".repeat(80));
    
    // 查询历史仓位记录（已平仓的仓位）
    logger.info("\n查询历史仓位记录（已平仓的仓位结算记录）...");
    const positionHistory = await exchangeClient.getPositionHistory(undefined, 50);
    
    if (positionHistory && positionHistory.length > 0) {
      logger.info(`找到 ${positionHistory.length} 条历史仓位记录:\n`);
      
      positionHistory.forEach((position: any, index: number) => {
        logger.info(`[${index + 1}] 历史仓位记录:`);
        logger.info(`  合约: ${position.contract || "N/A"}`);
        logger.info(`  数量: ${position.size || "N/A"}`);
        logger.info(`  价格: ${position.price || "N/A"}`);
        logger.info(`  盈亏: ${position.pnl || "N/A"}`);
        logger.info(`  手续费: ${position.fee || "N/A"}`);
        logger.info(`  时间: ${position.time || "N/A"}`);
        logger.info(`  结算类型: ${position.settle_type || "N/A"}`);
        logger.info("---");
      });
    } else {
      logger.info("暂无历史仓位记录");
    }
    
    // 查询历史结算记录（更详细的信息）
    logger.info("\n查询历史结算记录（更详细的历史仓位信息）...");
    const settlementHistory = await exchangeClient.getSettlementHistory(undefined, 50);
    
    if (settlementHistory && settlementHistory.length > 0) {
      logger.info(`找到 ${settlementHistory.length} 条历史结算记录:\n`);
      
      settlementHistory.forEach((settlement: any, index: number) => {
        logger.info(`[${index + 1}] 历史结算记录:`);
        logger.info(`  合约: ${settlement.contract || "N/A"}`);
        logger.info(`  结算价格: ${settlement.settle_price || "N/A"}`);
        logger.info(`  结算时间: ${settlement.settle_time || "N/A"}`);
        logger.info(`  仓位数量: ${settlement.size || "N/A"}`);
        logger.info(`  盈亏: ${settlement.pnl || "N/A"}`);
        logger.info(`  手续费: ${settlement.fee || "N/A"}`);
        logger.info("---");
      });
    } else {
      logger.info("暂无历史结算记录");
    }
    
    logger.info("\n" + "=".repeat(80));
    logger.info("查询完成");
    logger.info("=".repeat(80));
    
  } catch (error: any) {
    logger.error("查询历史仓位记录失败:", error);
    process.exit(1);
  }
}

// 执行查询
queryPositionHistory();





