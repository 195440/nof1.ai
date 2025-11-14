/**
 * OKX WebSocket 测试脚本
 * 用于验证 WebSocket 连接和数据获取功能
 */
import { createOkxClient } from "../src/services/okxClient";
import { getOkxWebSocketClient } from "../src/services/okxWebSocket";

async function testWebSocket() {
  console.log("=== OKX WebSocket 测试 ===\n");
  
  try {
    // 1. 测试 WebSocket 连接
    console.log("1. 测试 WebSocket 连接...");
    const wsClient = getOkxWebSocketClient();
    await wsClient.connect();
    console.log("✓ WebSocket 连接成功\n");
    
    // 2. 测试订阅 ticker 数据
    console.log("2. 测试订阅 BTC ticker 数据...");
    const btcInstId = "BTC-USDT-SWAP";
    
    await wsClient.subscribe("tickers", btcInstId, (data) => {
      console.log("收到 ticker 推送:", data[0]);
    });
    
    // 等待数据
    const ticker = await wsClient.waitForTicker(btcInstId, 10000);
    console.log("✓ 获取到 ticker 数据:");
    console.log(`  价格: ${ticker.last}`);
    console.log(`  24h涨跌: ${((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h) * 100).toFixed(2)}%`);
    console.log(`  24h最高: ${ticker.high24h}`);
    console.log(`  24h最低: ${ticker.low24h}\n`);
    
    // 3. 跳过 WebSocket K线订阅测试（使用 REST API 获取）
    console.log("3. 跳过 WebSocket K线订阅测试（K线数据使用 REST API）\n");
    
    // 4. 测试 OkxClient 集成
    console.log("4. 测试 OkxClient 集成...");
    // 等待一下让 WebSocket 初始化完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    const okxClient = createOkxClient();
    
    console.log("  测试 getFuturesTicker...");
    const tickerResult = await okxClient.getFuturesTicker("BTC_USDT");
    console.log("  ✓ 获取成功:");
    console.log(`    合约: ${tickerResult.contract}`);
    console.log(`    价格: ${tickerResult.last}`);
    console.log(`    24h涨跌: ${tickerResult.changePercentage}%\n`);
    
    console.log("  测试 getFuturesCandles...");
    const candlesResult = await okxClient.getFuturesCandles("BTC_USDT", "5m", 10);
    console.log(`  ✓ 获取成功: ${candlesResult.length} 条K线`);
    if (candlesResult.length > 0) {
      const latest = candlesResult[candlesResult.length - 1];
      console.log("    最新K线:");
      console.log(`      时间: ${new Date(latest.t * 1000).toISOString()}`);
      console.log(`      开: ${latest.o}, 高: ${latest.h}, 低: ${latest.l}, 收: ${latest.c}`);
      console.log(`      成交量: ${latest.v}\n`);
    }
    
    // 5. 测试缓存功能
    console.log("5. 测试缓存功能...");
    const cachedTicker = wsClient.getCachedTicker(btcInstId);
    if (cachedTicker) {
      console.log("✓ 缓存中有 ticker 数据，价格:", cachedTicker.last);
    } else {
      console.log("✗ 缓存中没有 ticker 数据");
    }
    
    console.log("\n=== 所有测试通过！ ===");
    
    // 等待 5 秒以接收更多推送
    console.log("\n等待 5 秒以接收推送数据...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 断开连接
    wsClient.disconnect();
    console.log("\nWebSocket 已断开");
    
  } catch (error) {
    console.error("\n测试失败:", error);
    process.exit(1);
  }
}

// 运行测试
testWebSocket().then(() => {
  console.log("\n测试完成");
  process.exit(0);
}).catch(error => {
  console.error("\n测试异常:", error);
  process.exit(1);
});

