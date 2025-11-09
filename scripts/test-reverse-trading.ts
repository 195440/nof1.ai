/**
 * 反向交易功能测试脚本
 * 用于验证 REVERSE_TRADING_ENABLED 环境变量的功能
 */

import { config } from 'dotenv';

// 加载环境变量
config();

console.log('🔄 反向交易功能测试');
console.log('==========================');

// 检查环境变量配置
const reverseTradingEnabled = process.env.REVERSE_TRADING_ENABLED === 'true';
console.log(`REVERSE_TRADING_ENABLED: ${reverseTradingEnabled}`);

// 模拟AI决策方向
const aiDecisions = ['long', 'short', 'long', 'short'];
console.log('\n📊 模拟AI决策与反向交易效果:');
console.log('AI决策 -> 实际开仓方向');
console.log('------------------------');

aiDecisions.forEach(decision => {
  const actualSide = reverseTradingEnabled ? (decision === 'long' ? 'short' : 'long') : decision;
  const arrow = reverseTradingEnabled ? '🔀' : '➡️';
  console.log(`${decision.padEnd(6)} ${arrow} ${actualSide}`);
});

console.log('\n✅ 反向交易功能测试完成');
if (reverseTradingEnabled) {
  console.log('🔄 反向交易已启用：AI做多决策将实际做空，AI做空决策将实际做多');
} else {
  console.log('➡️ 反向交易已禁用：AI决策方向与实际开仓方向一致');
}

console.log('\n📋 当前配置状态:');
console.log(`- 交易策略: ${process.env.TRADING_STRATEGY || 'balanced'}`);
console.log(`- 交易间隔: ${process.env.TRADING_INTERVAL_MINUTES || '5'}分钟`);
console.log(`- 初始资金: ${process.env.INITIAL_BALANCE || '500'} USDT`);
console.log(`- 账户记录间隔: ${process.env.ACCOUNT_RECORD_INTERVAL_MINUTES || '1'}分钟`);
console.log(`- 反向交易: ${reverseTradingEnabled ? '启用' : '禁用'}`);