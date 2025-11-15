/**
 * 修复移动止盈平仓记录中价格为0的问题
 * 
 * 使用方法：
 * npx tsx scripts/fix-trailing-stop-records.ts
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { createExchangeClient } from "../src/services/exchangeClient";
import { getQuantoMultiplier } from "../src/utils/contractUtils";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

async function fixTrailingStopRecords() {
  const exchangeClient = createExchangeClient();
  
  try {
    console.log("开始修复移动止盈交易记录...\n");
    
    // 查找所有价格为0的平仓记录
    const result = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE type = 'close' AND price = 0 ORDER BY timestamp DESC`,
      args: [],
    });
    
    if (!result.rows || result.rows.length === 0) {
      console.log("✅ 没有发现价格为0的交易记录");
      return;
    }
    
    console.log(`发现 ${result.rows.length} 条需要修复的记录\n`);
    
    let fixedCount = 0;
    let failedCount = 0;
    
    for (const closeTrade of result.rows) {
      const id = closeTrade.id;
      const symbol = closeTrade.symbol as string;
      const side = closeTrade.side as string;
      const quantity = Number.parseFloat(closeTrade.quantity as string);
      const timestamp = closeTrade.timestamp as string;
      
      console.log(`处理 ${symbol} ${side} (ID: ${id})...`);
      
      try {
        // 查找对应的开仓记录
        const openResult = await dbClient.execute({
          sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'open' AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`,
          args: [symbol, timestamp],
        });
        
        if (!openResult.rows || openResult.rows.length === 0) {
          console.log(`  ❌ 未找到开仓记录，跳过`);
          failedCount++;
          continue;
        }
        
        const openTrade = openResult.rows[0];
        const openPrice = Number.parseFloat(openTrade.price as string);
        
        // 获取当前价格作为平仓价格的近似值
        const contract = `${symbol}_USDT`;
        let closePrice = 0;
        
        try {
          const ticker = await exchangeClient.getFuturesTicker(contract);
          closePrice = Number.parseFloat(ticker.last || ticker.markPrice || "0");
        } catch (error) {
          console.log(`  ❌ 无法获取ticker价格，跳过`);
          failedCount++;
          continue;
        }
        
        if (closePrice === 0) {
          console.log(`  ❌ ticker价格为0，跳过`);
          failedCount++;
          continue;
        }
        
        // 获取合约乘数
        const quantoMultiplier = await getQuantoMultiplier(contract);
        
        // 重新计算盈亏
        const priceChange = side === "long" 
          ? (closePrice - openPrice) 
          : (openPrice - closePrice);
        
        const grossPnl = priceChange * quantity * quantoMultiplier;
        const openFee = openPrice * quantity * quantoMultiplier * 0.0005;
        const closeFee = closePrice * quantity * quantoMultiplier * 0.0005;
        const totalFee = openFee + closeFee;
        const correctPnl = grossPnl - totalFee;
        
        console.log(`  开仓价: ${openPrice.toFixed(4)}`);
        console.log(`  平仓价: ${closePrice.toFixed(4)} (使用当前ticker)`);
        console.log(`  数量: ${quantity} 张`);
        console.log(`  盈亏: ${correctPnl.toFixed(2)} USDT`);
        console.log(`  手续费: ${totalFee.toFixed(4)} USDT`);
        
        // 更新数据库
        await dbClient.execute({
          sql: `UPDATE trades SET price = ?, pnl = ?, fee = ? WHERE id = ?`,
          args: [closePrice, correctPnl, totalFee, id],
        });
        
        console.log(`  ✅ 修复成功\n`);
        fixedCount++;
        
      } catch (error: any) {
        console.log(`  ❌ 修复失败: ${error.message}\n`);
        failedCount++;
      }
    }
    
    console.log("\n修复完成！");
    console.log(`✅ 成功修复: ${fixedCount} 条`);
    if (failedCount > 0) {
      console.log(`❌ 修复失败: ${failedCount} 条`);
    }
    
  } catch (error: any) {
    console.error("修复过程出错:", error);
    process.exit(1);
  }
}

// 运行修复
fixTrailingStopRecords()
  .then(() => {
    console.log("\n脚本执行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });

