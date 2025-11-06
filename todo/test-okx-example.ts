/**
 * OKX 客户端测试脚本示例
 * 
 * 用途：测试 OKX 客户端的各个方法是否正常工作
 * 使用方法：
 *   1. 配置 .env 文件（设置 OKX API credentials）
 *   2. 运行：tsx --env-file=.env ./todo/test-okx-example.ts
 */

import "dotenv/config";
import { createExchangeClient } from "../src/services/exchangeFactory";
import { createPinoLogger } from "@voltagent/logger";

const logger = createPinoLogger({
  name: "okx-test",
  level: "info",
});

async function testOKXClient() {
  try {
    logger.info("=" .repeat(60));
    logger.info("开始测试 OKX 客户端");
    logger.info("=" .repeat(60));
    
    // 设置为 OKX
    process.env.EXCHANGE = "okx";
    process.env.EXCHANGE_NETWORK = "testnet"; // 使用测试网
    
    // 创建客户端
    const client = createExchangeClient();
    logger.info("✅ OKX 客户端创建成功");
    
    // ========================================
    // 测试 1: 获取账户余额
    // ========================================
    logger.info("\n📊 测试 1: 获取账户余额...");
    try {
      const account = await client.getFuturesAccount();
      logger.info("✅ 账户信息:", account);
      logger.info(`   总资产: ${account.total} USDT`);
      logger.info(`   可用: ${account.available} USDT`);
      logger.info(`   未实现盈亏: ${account.unrealisedPnl} USDT`);
    } catch (error: any) {
      logger.error("❌ 获取账户余额失败:", error.message);
    }
    
    // ========================================
    // 测试 2: 获取行情价格
    // ========================================
    logger.info("\n💹 测试 2: 获取 BTC 行情价格...");
    try {
      const ticker = await client.getFuturesTicker("BTC_USDT");
      logger.info("✅ BTC 价格信息:", ticker);
      logger.info(`   最新价: ${ticker.last}`);
      logger.info(`   标记价: ${ticker.markPrice}`);
      logger.info(`   24h涨跌: ${ticker.changePercentage}%`);
    } catch (error: any) {
      logger.error("❌ 获取价格失败:", error.message);
    }
    
    // ========================================
    // 测试 3: 获取当前持仓
    // ========================================
    logger.info("\n📈 测试 3: 获取当前持仓...");
    try {
      const positions = await client.getPositions();
      logger.info(`✅ 持仓数量: ${positions.length}`);
      
      if (positions.length > 0) {
        for (const pos of positions) {
          logger.info(`   ${pos.contract}:`);
          logger.info(`     数量: ${pos.size}`);
          logger.info(`     开仓价: ${pos.entryPrice}`);
          logger.info(`     标记价: ${pos.markPrice}`);
          logger.info(`     未实现盈亏: ${pos.unrealisedPnl}`);
        }
      } else {
        logger.info("   当前无持仓");
      }
    } catch (error: any) {
      logger.error("❌ 获取持仓失败:", error.message);
    }
    
    // ========================================
    // 测试 4: 获取K线数据
    // ========================================
    logger.info("\n📊 测试 4: 获取 BTC 5分钟K线...");
    try {
      const candles = await client.getFuturesCandles("BTC_USDT", "5m", 10);
      logger.info(`✅ 获取到 ${candles.length} 根K线`);
      
      if (candles.length > 0) {
        const latest = candles[candles.length - 1];
        logger.info(`   最新K线:`);
        logger.info(`     开: ${latest.o}`);
        logger.info(`     高: ${latest.h}`);
        logger.info(`     低: ${latest.l}`);
        logger.info(`     收: ${latest.c}`);
        logger.info(`     量: ${latest.v}`);
      }
    } catch (error: any) {
      logger.error("❌ 获取K线失败:", error.message);
    }
    
    // ========================================
    // 测试 5: 获取未成交订单
    // ========================================
    logger.info("\n📋 测试 5: 获取未成交订单...");
    try {
      const orders = await client.getOpenOrders();
      logger.info(`✅ 未成交订单数: ${orders.length}`);
      
      if (orders.length > 0) {
        for (const order of orders) {
          logger.info(`   订单 ${order.id}:`);
          logger.info(`     合约: ${order.contract}`);
          logger.info(`     数量: ${order.size}`);
          logger.info(`     价格: ${order.price}`);
        }
      } else {
        logger.info("   当前无未成交订单");
      }
    } catch (error: any) {
      logger.error("❌ 获取订单失败:", error.message);
    }
    
    // ========================================
    // 测试 6: 下单测试（谨慎！）
    // ========================================
    logger.info("\n⚠️  测试 6: 下单测试（已注释，需要时取消注释）");
    /*
    // 注意：这会真实下单！请确保在测试网且金额很小
    try {
      const order = await client.placeOrder({
        contract: "BTC_USDT",
        size: 1,  // 1张合约
        price: 0,  // 市价单
      });
      logger.info("✅ 下单成功:", order);
      
      // 立即取消
      if (order.id) {
        await client.cancelOrder(order.id);
        logger.info("✅ 订单已取消");
      }
    } catch (error: any) {
      logger.error("❌ 下单失败:", error.message);
    }
    */
    logger.info("   (下单测试已跳过，需要时取消代码注释)");
    
    // ========================================
    // 测试总结
    // ========================================
    logger.info("\n" + "=" .repeat(60));
    logger.info("✅ 测试完成！");
    logger.info("=" .repeat(60));
    
  } catch (error: any) {
    logger.error("❌ 测试过程中发生错误:", error);
    logger.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
testOKXClient()
  .then(() => {
    logger.info("测试脚本执行完成");
    process.exit(0);
  })
  .catch((error) => {
    logger.error("测试脚本执行失败:", error);
    process.exit(1);
  });

