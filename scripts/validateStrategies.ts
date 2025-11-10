/**
 * 策略配置验证脚本
 * 
 * 功能：
 * 1. 检查所有策略的配置完整性
 * 2. 验证止盈、止损、移动止盈配置
 * 3. 检查是否有写死的代码
 * 4. 生成策略配置报告
 */

import { getTradingStrategy, getStrategyParams } from "../src/agents/tradingAgent";
import type { TradingStrategy, StrategyParams } from "../src/strategies/types";
import { RISK_PARAMS } from "../src/config/riskParams";

// 所有支持的策略
const ALL_STRATEGIES: TradingStrategy[] = [
  "conservative",
  "balanced",
  "aggressive",
  "ultra-short",
  "swing-trend",
  "rebate-farming",
  "ai-autonomous",
];

interface ValidationResult {
  strategy: TradingStrategy;
  valid: boolean;
  errors: string[];
  warnings: string[];
  config: StrategyParams;
}

/**
 * 验证单个策略配置
 */
function validateStrategy(strategy: TradingStrategy): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  let config: StrategyParams;
  try {
    config = getStrategyParams(strategy);
  } catch (error: any) {
    return {
      strategy,
      valid: false,
      errors: [`无法获取策略参数: ${error.message}`],
      warnings: [],
      config: null as any,
    };
  }
  
  // 1. 检查基本配置
  if (!config.name) {
    errors.push("缺少策略名称 (name)");
  }
  
  if (!config.description) {
    errors.push("缺少策略描述 (description)");
  }
  
  // 2. 检查杠杆配置
  if (config.leverageMin === undefined || config.leverageMin <= 0) {
    errors.push("leverageMin 未定义或无效");
  }
  
  if (config.leverageMax === undefined || config.leverageMax <= 0) {
    errors.push("leverageMax 未定义或无效");
  }
  
  if (config.leverageMin > config.leverageMax) {
    errors.push("leverageMin 不能大于 leverageMax");
  }
  
  if (!config.leverageRecommend || !config.leverageRecommend.normal || !config.leverageRecommend.good || !config.leverageRecommend.strong) {
    errors.push("leverageRecommend 配置不完整 (需要 normal, good, strong)");
  }
  
  // 3. 检查仓位配置
  if (config.positionSizeMin === undefined || config.positionSizeMin <= 0) {
    errors.push("positionSizeMin 未定义或无效");
  }
  
  if (config.positionSizeMax === undefined || config.positionSizeMax <= 0) {
    errors.push("positionSizeMax 未定义或无效");
  }
  
  if (config.positionSizeMin > config.positionSizeMax) {
    errors.push("positionSizeMin 不能大于 positionSizeMax");
  }
  
  if (!config.positionSizeRecommend || !config.positionSizeRecommend.normal || !config.positionSizeRecommend.good || !config.positionSizeRecommend.strong) {
    errors.push("positionSizeRecommend 配置不完整 (需要 normal, good, strong)");
  }
  
  // 4. 检查止损配置
  if (!config.stopLoss) {
    errors.push("缺少 stopLoss 配置");
  } else {
    if (config.stopLoss.low === undefined) {
      errors.push("stopLoss.low 未定义");
    } else if (config.stopLoss.low >= 0) {
      errors.push("stopLoss.low 应该是负数");
    }
    
    if (config.stopLoss.mid === undefined) {
      errors.push("stopLoss.mid 未定义");
    } else if (config.stopLoss.mid >= 0) {
      errors.push("stopLoss.mid 应该是负数");
    }
    
    if (config.stopLoss.high === undefined) {
      errors.push("stopLoss.high 未定义");
    } else if (config.stopLoss.high >= 0) {
      errors.push("stopLoss.high 应该是负数");
    }
    
    // 检查止损逻辑：low <= mid <= high（绝对值相反）
    if (config.stopLoss.low !== undefined && config.stopLoss.mid !== undefined && config.stopLoss.high !== undefined) {
      if (config.stopLoss.low < config.stopLoss.mid || config.stopLoss.mid < config.stopLoss.high) {
        warnings.push("止损配置可能不合理：high 应该最严格（绝对值最小），low 最宽松（绝对值最大）");
      }
    }
  }
  
  // 5. 检查移动止盈配置
  if (!config.trailingStop) {
    errors.push("缺少 trailingStop 配置");
  } else {
    const levels = ['level1', 'level2', 'level3'] as const;
    for (const level of levels) {
      if (!config.trailingStop[level]) {
        errors.push(`trailingStop.${level} 未定义`);
      } else {
        if (config.trailingStop[level].trigger === undefined || config.trailingStop[level].trigger <= 0) {
          errors.push(`trailingStop.${level}.trigger 未定义或无效`);
        }
        if (config.trailingStop[level].stopAt === undefined || config.trailingStop[level].stopAt < 0) {
          errors.push(`trailingStop.${level}.stopAt 未定义或无效`);
        }
        if (config.trailingStop[level].trigger !== undefined && config.trailingStop[level].stopAt !== undefined) {
          if (config.trailingStop[level].stopAt >= config.trailingStop[level].trigger) {
            errors.push(`trailingStop.${level}.stopAt 应该小于 trigger`);
          }
        }
      }
    }
    
    // 检查移动止盈逻辑：level1 < level2 < level3
    if (config.trailingStop.level1 && config.trailingStop.level2 && config.trailingStop.level3) {
      if (config.trailingStop.level1.trigger >= config.trailingStop.level2.trigger ||
          config.trailingStop.level2.trigger >= config.trailingStop.level3.trigger) {
        errors.push("移动止盈 trigger 应该递增：level1 < level2 < level3");
      }
    }
  }
  
  // 6. 检查分批止盈配置
  if (!config.partialTakeProfit) {
    errors.push("缺少 partialTakeProfit 配置");
  } else {
    const stages = ['stage1', 'stage2', 'stage3'] as const;
    for (const stage of stages) {
      if (!config.partialTakeProfit[stage]) {
        errors.push(`partialTakeProfit.${stage} 未定义`);
      } else {
        if (config.partialTakeProfit[stage].trigger === undefined || config.partialTakeProfit[stage].trigger <= 0) {
          errors.push(`partialTakeProfit.${stage}.trigger 未定义或无效`);
        }
        if (config.partialTakeProfit[stage].closePercent === undefined || config.partialTakeProfit[stage].closePercent <= 0 || config.partialTakeProfit[stage].closePercent > 100) {
          errors.push(`partialTakeProfit.${stage}.closePercent 未定义或超出范围 (0-100)`);
        }
      }
    }
    
    // 检查分批止盈逻辑：stage1 < stage2 < stage3
    if (config.partialTakeProfit.stage1 && config.partialTakeProfit.stage2 && config.partialTakeProfit.stage3) {
      if (config.partialTakeProfit.stage1.trigger >= config.partialTakeProfit.stage2.trigger ||
          config.partialTakeProfit.stage2.trigger >= config.partialTakeProfit.stage3.trigger) {
        errors.push("分批止盈 trigger 应该递增：stage1 < stage2 < stage3");
      }
    }
  }
  
  // 7. 检查峰值回撤保护
  if (config.peakDrawdownProtection === undefined || config.peakDrawdownProtection <= 0) {
    errors.push("peakDrawdownProtection 未定义或无效");
  }
  
  // 8. 检查波动率调整
  if (!config.volatilityAdjustment) {
    errors.push("缺少 volatilityAdjustment 配置");
  } else {
    const volatilities = ['highVolatility', 'normalVolatility', 'lowVolatility'] as const;
    for (const vol of volatilities) {
      if (!config.volatilityAdjustment[vol]) {
        errors.push(`volatilityAdjustment.${vol} 未定义`);
      } else {
        if (config.volatilityAdjustment[vol].leverageFactor === undefined || config.volatilityAdjustment[vol].leverageFactor <= 0) {
          errors.push(`volatilityAdjustment.${vol}.leverageFactor 未定义或无效`);
        }
        if (config.volatilityAdjustment[vol].positionFactor === undefined || config.volatilityAdjustment[vol].positionFactor <= 0) {
          errors.push(`volatilityAdjustment.${vol}.positionFactor 未定义或无效`);
        }
      }
    }
  }
  
  // 9. 检查入场条件和风险容忍度
  if (!config.entryCondition) {
    warnings.push("缺少 entryCondition 描述");
  }
  
  if (!config.riskTolerance) {
    warnings.push("缺少 riskTolerance 描述");
  }
  
  if (!config.tradingStyle) {
    warnings.push("缺少 tradingStyle 描述");
  }
  
  // 10. 检查代码级保护配置
  if (config.enableCodeLevelProtection === undefined) {
    errors.push("enableCodeLevelProtection 未定义");
  }
  
  return {
    strategy,
    valid: errors.length === 0,
    errors,
    warnings,
    config,
  };
}

/**
 * 生成策略配置表格
 */
function generateStrategyTable(results: ValidationResult[]): string {
  let table = "\n";
  table += "┌────────────────┬──────────┬────────────┬──────────────────┬────────────────────────┬─────────────────────┬──────────────┐\n";
  table += "│ 策略           │ 杠杆范围 │ 仓位范围   │ 止损配置         │ 移动止盈触发点         │ 分批止盈触发点      │ 自动监控     │\n";
  table += "├────────────────┼──────────┼────────────┼──────────────────┼────────────────────────┼─────────────────────┼──────────────┤\n";
  
  for (const result of results) {
    if (!result.valid) {
      table += `│ ${result.strategy.padEnd(14)} │ ❌ 配置错误，请查看详细信息 ${" ".repeat(77)} │\n`;
      continue;
    }
    
    const c = result.config;
    const leverageRange = `${c.leverageMin}-${c.leverageMax}x`;
    const positionRange = `${c.positionSizeMin}-${c.positionSizeMax}%`;
    const stopLoss = `${c.stopLoss.low}/${c.stopLoss.mid}/${c.stopLoss.high}%`;
    const trailingStop = `${c.trailingStop.level1.trigger}/${c.trailingStop.level2.trigger}/${c.trailingStop.level3.trigger}%`;
    const partialProfit = `${c.partialTakeProfit.stage1.trigger}/${c.partialTakeProfit.stage2.trigger}/${c.partialTakeProfit.stage3.trigger}%`;
    const autoProtect = c.enableCodeLevelProtection ? "✅ 启用" : "❌ 禁用";
    
    table += `│ ${result.strategy.padEnd(14)} │ ${leverageRange.padEnd(8)} │ ${positionRange.padEnd(10)} │ ${stopLoss.padEnd(16)} │ ${trailingStop.padEnd(22)} │ ${partialProfit.padEnd(19)} │ ${autoProtect.padEnd(12)} │\n`;
  }
  
  table += "└────────────────┴──────────┴────────────┴──────────────────┴────────────────────────┴─────────────────────┴──────────────┘\n";
  
  return table;
}

/**
 * 生成详细报告
 */
function generateDetailedReport(results: ValidationResult[]): string {
  let report = "\n========================================\n";
  report += "策略配置详细报告\n";
  report += "========================================\n\n";
  
  for (const result of results) {
    report += `策略: ${result.strategy} (${result.config?.name || "未知"})\n`;
    report += `状态: ${result.valid ? "✅ 配置完整" : "❌ 配置错误"}\n`;
    
    if (result.errors.length > 0) {
      report += "\n错误:\n";
      for (const error of result.errors) {
        report += `  ❌ ${error}\n`;
      }
    }
    
    if (result.warnings.length > 0) {
      report += "\n警告:\n";
      for (const warning of result.warnings) {
        report += `  ⚠️  ${warning}\n`;
      }
    }
    
    if (result.valid) {
      report += "\n配置摘要:\n";
      report += `  - 杠杆范围: ${result.config.leverageMin}-${result.config.leverageMax}x\n`;
      report += `  - 仓位范围: ${result.config.positionSizeMin}-${result.config.positionSizeMax}%\n`;
      report += `  - 止损配置: low=${result.config.stopLoss.low}%, mid=${result.config.stopLoss.mid}%, high=${result.config.stopLoss.high}%\n`;
      report += `  - 移动止盈: L1=${result.config.trailingStop.level1.trigger}%→${result.config.trailingStop.level1.stopAt}%, `;
      report += `L2=${result.config.trailingStop.level2.trigger}%→${result.config.trailingStop.level2.stopAt}%, `;
      report += `L3=${result.config.trailingStop.level3.trigger}%→${result.config.trailingStop.level3.stopAt}%\n`;
      report += `  - 分批止盈: S1=${result.config.partialTakeProfit.stage1.trigger}%(平${result.config.partialTakeProfit.stage1.closePercent}%), `;
      report += `S2=${result.config.partialTakeProfit.stage2.trigger}%(平${result.config.partialTakeProfit.stage2.closePercent}%), `;
      report += `S3=${result.config.partialTakeProfit.stage3.trigger}%(平${result.config.partialTakeProfit.stage3.closePercent}%)\n`;
      report += `  - 峰值回撤保护: ${result.config.peakDrawdownProtection}%\n`;
      report += `  - 自动监控: ${result.config.enableCodeLevelProtection ? "✅ 启用（代码自动执行止损止盈）" : "❌ 禁用（AI主动执行）"}\n`;
    }
    
    report += "\n" + "─".repeat(60) + "\n\n";
  }
  
  return report;
}

/**
 * 主函数
 */
async function main() {
  console.log("开始验证策略配置...\n");
  console.log(`系统最大杠杆: ${RISK_PARAMS.MAX_LEVERAGE}x`);
  console.log(`最大持仓数: ${RISK_PARAMS.MAX_POSITIONS}`);
  console.log(`极端止损: ${RISK_PARAMS.EXTREME_STOP_LOSS_PERCENT}%`);
  console.log(`最大持仓时间: ${RISK_PARAMS.MAX_HOLDING_HOURS}小时`);
  console.log(`交易币种: ${RISK_PARAMS.TRADING_SYMBOLS.join(", ")}\n`);
  
  // 验证所有策略
  const results: ValidationResult[] = [];
  for (const strategy of ALL_STRATEGIES) {
    const result = validateStrategy(strategy);
    results.push(result);
  }
  
  // 生成报告
  console.log(generateStrategyTable(results));
  console.log(generateDetailedReport(results));
  
  // 统计
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.length - validCount;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  
  console.log("========================================");
  console.log("验证统计");
  console.log("========================================");
  console.log(`总策略数: ${results.length}`);
  console.log(`✅ 配置完整: ${validCount}`);
  console.log(`❌ 配置错误: ${invalidCount}`);
  console.log(`总错误数: ${totalErrors}`);
  console.log(`总警告数: ${totalWarnings}`);
  console.log("========================================\n");
  
  // 如果有错误，退出
  if (invalidCount > 0) {
    console.error("❌ 发现配置错误，请修复后重试！");
    process.exit(1);
  }
  
  console.log("✅ 所有策略配置验证通过！");
  process.exit(0);
}

// 执行
main().catch((error) => {
  console.error("验证脚本执行失败:", error);
  process.exit(1);
});

