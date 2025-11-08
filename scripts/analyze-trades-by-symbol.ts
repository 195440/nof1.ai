/**
 * 分析历史交易数据 - 按币种统计盈亏和胜率
 */

import { createClient } from "@libsql/client";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

interface TradeStats {
  symbol: string;
  totalTrades: number;        // 总交易次数
  winTrades: number;          // 盈利次数
  lossTrades: number;         // 亏损次数
  breakEvenTrades: number;    // 持平次数
  winRate: number;            // 胜率（%）
  totalPnl: number;           // 总盈亏（USDT）
  totalFees: number;          // 总手续费（USDT）
  netPnl: number;             // 净盈亏（USDT）
  avgWin: number;             // 平均盈利（USDT）
  avgLoss: number;            // 平均亏损（USDT）
  profitFactor: number;       // 盈亏比（总盈利/总亏损）
  largestWin: number;         // 最大盈利（USDT）
  largestLoss: number;        // 最大亏损（USDT）
  longTrades: number;         // 做多次数
  shortTrades: number;        // 做空次数
  longWinRate: number;        // 做多胜率（%）
  shortWinRate: number;       // 做空胜率（%）
}

async function analyzeTrades() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("         历史交易数据分析（按币种）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // 查询所有平仓记录
    const result = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE type = 'close' ORDER BY timestamp ASC`,
      args: [],
    });

    if (!result.rows || result.rows.length === 0) {
      console.log("未找到任何交易记录\n");
      return;
    }

    console.log(`找到 ${result.rows.length} 条平仓记录\n`);

    // 按币种分组统计
    const symbolStats = new Map<string, TradeStats>();

    for (const trade of result.rows) {
      const symbol = trade.symbol as string;
      const side = trade.side as string;
      const pnl = Number.parseFloat(trade.pnl as string || "0");
      const fee = Number.parseFloat(trade.fee as string || "0");

      // 初始化币种统计
      if (!symbolStats.has(symbol)) {
        symbolStats.set(symbol, {
          symbol,
          totalTrades: 0,
          winTrades: 0,
          lossTrades: 0,
          breakEvenTrades: 0,
          winRate: 0,
          totalPnl: 0,
          totalFees: 0,
          netPnl: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 0,
          largestWin: 0,
          largestLoss: 0,
          longTrades: 0,
          shortTrades: 0,
          longWinRate: 0,
          shortWinRate: 0,
        });
      }

      const stats = symbolStats.get(symbol)!;

      // 更新统计
      stats.totalTrades++;
      stats.totalPnl += pnl;
      stats.totalFees += fee;
      stats.netPnl += pnl;

      // 统计做多/做空
      if (side === "long") {
        stats.longTrades++;
      } else if (side === "short") {
        stats.shortTrades++;
      }

      // 统计盈亏
      if (pnl > 0.01) {
        stats.winTrades++;
        stats.avgWin += pnl;
        if (pnl > stats.largestWin) {
          stats.largestWin = pnl;
        }
      } else if (pnl < -0.01) {
        stats.lossTrades++;
        stats.avgLoss += Math.abs(pnl);
        if (Math.abs(pnl) > Math.abs(stats.largestLoss)) {
          stats.largestLoss = pnl;
        }
      } else {
        stats.breakEvenTrades++;
      }
    }

    // 计算统计指标
    for (const stats of symbolStats.values()) {
      // 胜率
      stats.winRate = stats.totalTrades > 0 
        ? (stats.winTrades / stats.totalTrades) * 100 
        : 0;

      // 平均盈利/亏损
      stats.avgWin = stats.winTrades > 0 ? stats.avgWin / stats.winTrades : 0;
      stats.avgLoss = stats.lossTrades > 0 ? stats.avgLoss / stats.lossTrades : 0;

      // 盈亏比
      stats.profitFactor = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : 0;

      // 做多/做空胜率
      // 需要重新遍历计算
      let longWins = 0;
      let shortWins = 0;
      
      for (const trade of result.rows) {
        if (trade.symbol === stats.symbol) {
          const side = trade.side as string;
          const pnl = Number.parseFloat(trade.pnl as string || "0");
          
          if (pnl > 0.01) {
            if (side === "long") longWins++;
            if (side === "short") shortWins++;
          }
        }
      }

      stats.longWinRate = stats.longTrades > 0 
        ? (longWins / stats.longTrades) * 100 
        : 0;
      stats.shortWinRate = stats.shortTrades > 0 
        ? (shortWins / stats.shortTrades) * 100 
        : 0;
    }

    // 按净盈亏排序
    const sortedStats = Array.from(symbolStats.values()).sort(
      (a, b) => b.netPnl - a.netPnl
    );

    // 打印结果
    console.log("┌────────────────────────────────────────────────────────────────────────┐");
    console.log("│                        各币种交易统计                                    │");
    console.log("└────────────────────────────────────────────────────────────────────────┘\n");

    for (const stats of sortedStats) {
      const pnlColor = stats.netPnl >= 0 ? "+" : "";
      const winRateEmoji = stats.winRate >= 60 ? "✅" : stats.winRate >= 50 ? "⚠️" : "❌";
      
      console.log(`━━━ ${stats.symbol} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`净盈亏: ${pnlColor}${stats.netPnl.toFixed(2)} USDT`);
      console.log(`总盈亏: ${pnlColor}${stats.totalPnl.toFixed(2)} USDT  |  手续费: ${stats.totalFees.toFixed(2)} USDT`);
      console.log(``);
      console.log(`交易统计:`);
      console.log(`  总交易: ${stats.totalTrades} 笔  |  盈利: ${stats.winTrades} 笔  |  亏损: ${stats.lossTrades} 笔`);
      console.log(`  胜率: ${winRateEmoji} ${stats.winRate.toFixed(1)}%`);
      console.log(`  盈亏比: ${stats.profitFactor.toFixed(2)}`);
      console.log(``);
      console.log(`盈亏分析:`);
      console.log(`  平均盈利: +${stats.avgWin.toFixed(2)} USDT  |  平均亏损: -${stats.avgLoss.toFixed(2)} USDT`);
      console.log(`  最大盈利: +${stats.largestWin.toFixed(2)} USDT  |  最大亏损: ${stats.largestLoss.toFixed(2)} USDT`);
      console.log(``);
      console.log(`方向统计:`);
      console.log(`  做多: ${stats.longTrades} 笔 (胜率 ${stats.longWinRate.toFixed(1)}%)`);
      console.log(`  做空: ${stats.shortTrades} 笔 (胜率 ${stats.shortWinRate.toFixed(1)}%)`);
      console.log(``);
    }

    // 总体统计
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("                      总体统计                        ");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const totalStats = {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      totalPnl: 0,
      totalFees: 0,
      netPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      longTrades: 0,
      shortTrades: 0,
    };

    for (const stats of sortedStats) {
      totalStats.totalTrades += stats.totalTrades;
      totalStats.winTrades += stats.winTrades;
      totalStats.lossTrades += stats.lossTrades;
      totalStats.totalPnl += stats.totalPnl;
      totalStats.totalFees += stats.totalFees;
      totalStats.netPnl += stats.netPnl;
      totalStats.longTrades += stats.longTrades;
      totalStats.shortTrades += stats.shortTrades;
      
      if (stats.largestWin > totalStats.largestWin) {
        totalStats.largestWin = stats.largestWin;
      }
      if (Math.abs(stats.largestLoss) > Math.abs(totalStats.largestLoss)) {
        totalStats.largestLoss = stats.largestLoss;
      }
    }

    // 计算总体平均值
    let totalWinPnl = 0;
    let totalLossPnl = 0;
    for (const trade of result.rows) {
      const pnl = Number.parseFloat(trade.pnl as string || "0");
      if (pnl > 0.01) {
        totalWinPnl += pnl;
      } else if (pnl < -0.01) {
        totalLossPnl += Math.abs(pnl);
      }
    }

    totalStats.avgWin = totalStats.winTrades > 0 ? totalWinPnl / totalStats.winTrades : 0;
    totalStats.avgLoss = totalStats.lossTrades > 0 ? totalLossPnl / totalStats.lossTrades : 0;

    const overallWinRate = totalStats.totalTrades > 0 
      ? (totalStats.winTrades / totalStats.totalTrades) * 100 
      : 0;
    const overallProfitFactor = totalStats.avgLoss > 0 
      ? totalStats.avgWin / totalStats.avgLoss 
      : 0;
    const longWinRate = totalStats.longTrades > 0 
      ? (sortedStats.reduce((sum, s) => sum + (s.longWinRate * s.longTrades / 100), 0) / totalStats.longTrades) * 100
      : 0;
    const shortWinRate = totalStats.shortTrades > 0 
      ? (sortedStats.reduce((sum, s) => sum + (s.shortWinRate * s.shortTrades / 100), 0) / totalStats.shortTrades) * 100
      : 0;

    const pnlColor = totalStats.netPnl >= 0 ? "+" : "";
    const winRateEmoji = overallWinRate >= 60 ? "✅" : overallWinRate >= 50 ? "⚠️" : "❌";

    console.log(`净盈亏: ${pnlColor}${totalStats.netPnl.toFixed(2)} USDT`);
    console.log(`总盈亏: ${pnlColor}${totalStats.totalPnl.toFixed(2)} USDT  |  手续费: ${totalStats.totalFees.toFixed(2)} USDT`);
    console.log(``);
    console.log(`交易统计:`);
    console.log(`  总交易: ${totalStats.totalTrades} 笔  |  盈利: ${totalStats.winTrades} 笔  |  亏损: ${totalStats.lossTrades} 笔`);
    console.log(`  胜率: ${winRateEmoji} ${overallWinRate.toFixed(1)}%`);
    console.log(`  盈亏比: ${overallProfitFactor.toFixed(2)}`);
    console.log(``);
    console.log(`盈亏分析:`);
    console.log(`  平均盈利: +${totalStats.avgWin.toFixed(2)} USDT  |  平均亏损: -${totalStats.avgLoss.toFixed(2)} USDT`);
    console.log(`  最大盈利: +${totalStats.largestWin.toFixed(2)} USDT  |  最大亏损: ${totalStats.largestLoss.toFixed(2)} USDT`);
    console.log(``);
    console.log(`方向统计:`);
    console.log(`  做多: ${totalStats.longTrades} 笔 (胜率 ${longWinRate.toFixed(1)}%)`);
    console.log(`  做空: ${totalStats.shortTrades} 笔 (胜率 ${shortWinRate.toFixed(1)}%)`);
    console.log(``);

    // 输出分析建议
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("                      分析建议                        ");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // 找出表现最好和最差的币种
    const bestSymbol = sortedStats[0];
    const worstSymbol = sortedStats[sortedStats.length - 1];

    console.log(`表现最好: ${bestSymbol.symbol}`);
    console.log(`  净盈亏: +${bestSymbol.netPnl.toFixed(2)} USDT  |  胜率: ${bestSymbol.winRate.toFixed(1)}%`);
    console.log(``);
    console.log(`表现最差: ${worstSymbol.symbol}`);
    console.log(`  净盈亏: ${worstSymbol.netPnl.toFixed(2)} USDT  |  胜率: ${worstSymbol.winRate.toFixed(1)}%`);
    console.log(``);

    // 给出建议
    console.log(`策略建议:`);
    
    if (overallWinRate < 50) {
      console.log(`  ❌ 整体胜率低于50%，建议：`);
      console.log(`     - 检查入场条件是否过于宽松`);
      console.log(`     - 提高信号质量要求（更多时间框架确认）`);
      console.log(`     - 避免震荡行情频繁开仓`);
    } else if (overallWinRate < 60) {
      console.log(`  ⚠️ 整体胜率在50-60%之间，有提升空间：`);
      console.log(`     - 继续优化入场时机`);
      console.log(`     - 加强行情识别（单边 vs 震荡）`);
    } else {
      console.log(`  ✅ 整体胜率良好（≥60%），保持策略`);
    }
    console.log(``);

    if (overallProfitFactor < 1.5) {
      console.log(`  ❌ 盈亏比偏低（<1.5），建议：`);
      console.log(`     - 让盈利充分奔跑，提高止盈目标`);
      console.log(`     - 严格止损，避免小亏变大亏`);
      console.log(`     - 单边行情持仓时间更长`);
    } else if (overallProfitFactor < 2) {
      console.log(`  ⚠️ 盈亏比一般（1.5-2.0），可以优化：`);
      console.log(`     - 单边行情让利润奔跑`);
      console.log(`     - 震荡行情快速止盈`);
    } else {
      console.log(`  ✅ 盈亏比良好（≥2.0），保持策略`);
    }
    console.log(``);

    // 做多/做空分析
    if (Math.abs(longWinRate - shortWinRate) > 15) {
      const betterSide = longWinRate > shortWinRate ? "做多" : "做空";
      const worseSide = longWinRate > shortWinRate ? "做空" : "做多";
      console.log(`  ⚠️ ${betterSide}表现明显优于${worseSide}，建议：`);
      console.log(`     - 检查${worseSide}信号识别是否准确`);
      console.log(`     - ${worseSide}时提高入场标准`);
      console.log(`     - 考虑更多${betterSide}机会`);
    } else {
      console.log(`  ✅ 做多/做空表现均衡`);
    }
    console.log(``);

    // 币种建议
    const lossSymbols = sortedStats.filter(s => s.netPnl < 0);
    if (lossSymbols.length > 0) {
      console.log(`  持续亏损币种: ${lossSymbols.map(s => s.symbol).join(", ")}`);
      console.log(`  建议: 暂时避开这些币种，或大幅提高入场标准`);
      console.log(``);
    }

    const lowWinRateSymbols = sortedStats.filter(s => s.winRate < 40);
    if (lowWinRateSymbols.length > 0) {
      console.log(`  低胜率币种: ${lowWinRateSymbols.map(s => `${s.symbol}(${s.winRate.toFixed(1)}%)`).join(", ")}`);
      console.log(`  建议: 这些币种可能震荡较多，交易时更加谨慎`);
      console.log(``);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error: any) {
    console.error("分析失败:", error.message);
    console.error(error.stack);
  }
}

analyzeTrades();


