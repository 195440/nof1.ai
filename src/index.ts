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

import "dotenv/config";
import { createLogger } from "./utils/loggerUtils";
import { serve } from "@hono/node-server";
import { createApiRoutes } from "./api/routes";
import { startTradingLoop, initTradingSystem } from "./scheduler/tradingLoop";
import { startAccountRecorder } from "./scheduler/accountRecorder";
import { startTrailingStopMonitor, stopTrailingStopMonitor } from "./scheduler/trailingStopMonitor";
import { startStopLossMonitor, stopStopLossMonitor } from "./scheduler/stopLossMonitor";
import { startPartialProfitMonitor, stopPartialProfitMonitor } from "./scheduler/partialProfitMonitor";
import { initDatabase } from "./database/init";
import { RISK_PARAMS } from "./config/riskParams";
import { getStrategyParams, getTradingStrategy } from "./agents/tradingAgent";
import { initializeTerminalEncoding} from "./utils/encodingUtils";

// 设置时区为中国时间（Asia/Shanghai，UTC+8）
process.env.TZ = 'Asia/Shanghai';

// 初始化终端编码设置（解决Windows中文乱码问题）
initializeTerminalEncoding();

// 创建日志实例
const logger = createLogger({
  name: "ai-btc",
  level: "info",
});

// 全局服务器实例
let server: any = null;

/**
 * 主函数
 */
async function main() {
  logger.info("启动 AI 加密货币自动交易系统");
  
  // 1. 初始化数据库
  logger.info("初始化数据库...");
  await initDatabase();
  
  // 2. 初始化交易系统配置（读取环境变量并同步到数据库）
  await initTradingSystem();
  
  // 3. 启动 API 服务器
  logger.info("🌐 启动 Web 服务器...");
  const apiRoutes = createApiRoutes();
  
  const port = Number.parseInt(process.env.PORT || "3141");
  
  server = serve({
    fetch: apiRoutes.fetch,
    port,
  });
  
  logger.info(`Web 服务器已启动: http://localhost:${port}`);
  logger.info(`监控界面: http://localhost:${port}/`);
  
  // 4. 启动交易循环
  logger.info("启动交易循环...");
  startTradingLoop();
  
  // 5. 启动账户资产记录器
  logger.info("启动账户资产记录器...");
  startAccountRecorder();
  
  // 6. 启动移动止盈监控器（每10秒检查一次）
  logger.info("启动移动止盈监控器...");
  startTrailingStopMonitor();
  
  // 7. 启动止损监控器（每10秒检查一次）
  logger.info("启动止损监控器...");
  startStopLossMonitor();
  
  // 8. 启动分批止盈监控器（每10秒检查一次）
  logger.info("启动分批止盈监控器...");
  startPartialProfitMonitor();
  
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  const isCodeLevelEnabled = params.enableCodeLevelProtection;
  
  logger.info("\n" + "=".repeat(80));
  logger.info("系统启动完成！");
  logger.info("=".repeat(80));
  logger.info(`\n监控界面: http://localhost:${port}/`);
  
  // 判断是否为双重防护模式
  const isDualProtection = isCodeLevelEnabled && params.allowAiOverrideProtection === true;
  const protectionMode = isDualProtection ? ' (🛡️ 双重防护: 代码自动 + AI主动)' : 
                         isCodeLevelEnabled ? ' (启用代码级保护)' : 
                         ' (AI主导控制)';
  
  logger.info(`交易策略: ${params.name}${protectionMode}`);
  logger.info(`策略标识: ${strategy}`);
  logger.info(`交易间隔: ${process.env.TRADING_INTERVAL_MINUTES || 5} 分钟`);
  logger.info(`账户记录间隔: ${process.env.ACCOUNT_RECORD_INTERVAL_MINUTES || 10} 分钟`);
  logger.info(`模型: ${process.env.AI_MODEL_NAME || "default"}`);
  logger.info(`\n⚙️ 生效策略参数:`);
  logger.info(`  • 杠杆范围: ${params.leverageMin}-${params.leverageMax}x`);
  logger.info(`  • 仓位范围: ${params.positionSizeMin}-${params.positionSizeMax}%`);
  logger.info(`  • 总保证金上限: ${params.maxTotalMarginPercent ?? "未设置"}%`);
  logger.info(`  • 止损: low ${params.stopLoss.low}% / mid ${params.stopLoss.mid}% / high ${params.stopLoss.high}%`);
  logger.info(`  • 移动止盈: ${params.trailingStop.level1.trigger}%→${params.trailingStop.level1.stopAt}%, ${params.trailingStop.level2.trigger}%→${params.trailingStop.level2.stopAt}%, ${params.trailingStop.level3.trigger}%→${params.trailingStop.level3.stopAt}%`);
  logger.info(`  • 分批止盈: ${params.partialTakeProfit.stage1.trigger}%/${params.partialTakeProfit.stage1.closePercent}%, ${params.partialTakeProfit.stage2.trigger}%/${params.partialTakeProfit.stage2.closePercent}%, ${params.partialTakeProfit.stage3.trigger}%/${params.partialTakeProfit.stage3.closePercent}%`);
  logger.info(`  • 代码级保护: ${params.enableCodeLevelProtection ? "开启" : "关闭"}`);
  logger.info(`  • AI 可覆盖保护: ${params.allowAiOverrideProtection ? "开启" : "关闭"}`);
  
  if (isCodeLevelEnabled) {
    // 动态生成止损描述
    const levMin = params.leverageMin;
    const levMax = params.leverageMax;
    const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
    const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);
    
    logger.info(`\n📊 代码级移动止盈监控（每10秒检查）:`);
    logger.info(`  • Level 1: 峰值达到 ${params.trailingStop.level1.trigger}% 时，回落至 ${params.trailingStop.level1.stopAt}% 平仓`);
    logger.info(`  • Level 2: 峰值达到 ${params.trailingStop.level2.trigger}% 时，回落至 ${params.trailingStop.level2.stopAt}% 平仓`);
    logger.info(`  • Level 3: 峰值达到 ${params.trailingStop.level3.trigger}% 时，回落至 ${params.trailingStop.level3.stopAt}% 平仓`);
    
    logger.info(`\n🛡️ 代码级自动止损监控（每10秒检查）:`);
    logger.info(`  • ${levMin}-${lowThreshold}倍杠杆，亏损 ${params.stopLoss.low}% 时止损`);
    logger.info(`  • ${lowThreshold + 1}-${midThreshold}倍杠杆，亏损 ${params.stopLoss.mid}% 时止损`);
    logger.info(`  • ${midThreshold + 1}倍以上杠杆，亏损 ${params.stopLoss.high}% 时止损`);
    
    logger.info(`\n💰 代码级分批止盈监控（每10秒检查）:`);
    logger.info(`  • Stage 1: 盈利达到 ${params.partialTakeProfit.stage1.trigger}% 时，平仓 ${params.partialTakeProfit.stage1.closePercent}%`);
    logger.info(`  • Stage 2: 盈利达到 ${params.partialTakeProfit.stage2.trigger}% 时，平仓 ${params.partialTakeProfit.stage2.closePercent}%`);
    logger.info(`  • Stage 3: 盈利达到 ${params.partialTakeProfit.stage3.trigger}% 时，平仓 ${params.partialTakeProfit.stage3.closePercent}%`);
    
    // 如果是双重防护模式，添加特别说明
    if (isDualProtection) {
      logger.info(`\n🛡️ 双重防护模式说明:`);
      logger.info(`  • 代码级监控作为安全网，自动执行止损止盈`);
      logger.info(`  • AI可以在自动触发之前主动止损止盈`);
      logger.info(`  • 提供更强的风险保护和操作灵活性`);
    }
  } else {
    logger.info(`\n⚠️  当前策略未启用代码级监控，止损止盈完全由AI控制`);
  }
  
  logger.info(`\n支持币种: ${RISK_PARAMS.TRADING_SYMBOLS.join(', ')}`);
  logger.info(`最大杠杆: ${RISK_PARAMS.MAX_LEVERAGE}x`);
  logger.info(`最大持仓数: ${RISK_PARAMS.MAX_POSITIONS}`);
  logger.info(`\n🔴 账户止损线: ${process.env.ACCOUNT_STOP_LOSS_USDT || 50} USDT (触发后全部清仓并退出)`);
  logger.info(`🟢 账户止盈线: ${process.env.ACCOUNT_TAKE_PROFIT_USDT || 10000} USDT (触发后全部清仓并退出)`);
  logger.info("\n按 Ctrl+C 停止系统\n");
}

// 错误处理
process.on("uncaughtException", (error) => {
  logger.error("未捕获的异常:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("未处理的 Promise 拒绝:", { reason });
});

// 优雅退出处理
async function gracefulShutdown(signal: string) {
  logger.info(`\n\n收到 ${signal} 信号，正在关闭系统...`);
  
  try {
    // 停止移动止盈监控器
    logger.info("正在停止移动止盈监控器...");
    stopTrailingStopMonitor();
    logger.info("移动止盈监控器已停止");
    
    // 停止止损监控器
    logger.info("正在停止止损监控器...");
    stopStopLossMonitor();
    logger.info("止损监控器已停止");
    
    // 关闭服务器
    if (server) {
      logger.info("正在关闭 Web 服务器...");
      server.close();
      logger.info("Web 服务器已关闭");
    }
    
    logger.info("系统已安全关闭");
    process.exit(0);
  } catch (error) {
    logger.error("关闭系统时出错:", error as any);
    process.exit(1);
  }
}

// 监听退出信号
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// 启动应用
await main();
