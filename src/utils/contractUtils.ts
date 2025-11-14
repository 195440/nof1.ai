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
 * 合约工具函数
 */
import { createExchangeClient } from "../services/exchangeClient";
import { createLogger } from "./loggerUtils";

const logger = createLogger({
  name: "contract-utils",
  level: "info",
});

// 合约乘数缓存（避免重复API调用）
const quantoMultiplierCache = new Map<string, number>();

/**
 * 默认合约乘数映射
 * 从 Gate.io API 获取失败时使用
 */
const DEFAULT_MULTIPLIERS: Record<string, number> = {
  'BTC': 0.0001,  // 1张 = 0.0001 BTC
  'ETH': 0.01,    // 1张 = 0.01 ETH
  'SOL': 1,       // 1张 = 1 SOL
  'XRP': 10,      // 1张 = 10 XRP
  'BNB': 0.001,   // 1张 = 0.001 BNB (修复：原来错误地配置为0.01)
  'BCH': 0.01,    // 1张 = 0.01 BCH
  'POL': 1,       // 1张 = 1 POL
};

/**
 * 获取合约乘数（quanto multiplier）
 * 
 * 合约乘数表示：1张合约代表多少个币
 * 例如：BTC_USDT合约，1张 = 0.0001 BTC
 * 
 * 优先从 Gate.io API 获取，失败时使用默认值
 * 支持缓存以减少API调用次数
 * 
 * @param contract 合约名称，如 "BTC_USDT"
 * @param useCache 是否使用缓存（默认true）
 * @returns 合约乘数
 */
export async function getQuantoMultiplier(
  contract: string,
  useCache: boolean = true
): Promise<number> {
  // 检查缓存
  if (useCache && quantoMultiplierCache.has(contract)) {
    const cached = quantoMultiplierCache.get(contract)!;
    logger.debug(`使用缓存的 ${contract} 合约乘数: ${cached}`);
    return cached;
  }
  
  try {
    const client = createExchangeClient();
    const contractInfo = await client.getContractInfo(contract);
    const multiplier = Number.parseFloat(contractInfo.quantoMultiplier || "0");
    
    // 验证乘数有效性
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new Error(`Invalid quanto multiplier: ${multiplier}`);
    }
    
    logger.debug(`从API获取 ${contract} 合约乘数: ${multiplier}`);
    
    // 缓存结果
    if (useCache) {
      quantoMultiplierCache.set(contract, multiplier);
    }
    
    return multiplier;
    
  } catch (error: any) {
    logger.warn(`获取 ${contract} 合约信息失败: ${error.message}，使用默认值`);
    
    // 使用默认值
    const symbol = contract.replace("_USDT", "");
    const defaultValue = DEFAULT_MULTIPLIERS[symbol] || 0.01;
    
    logger.info(`使用 ${contract} 默认合约乘数: ${defaultValue}`);
    
    // 缓存默认值（避免重复尝试失败的API调用）
    if (useCache) {
      quantoMultiplierCache.set(contract, defaultValue);
    }
    
    return defaultValue;
  }
}

/**
 * 清除缓存（用于测试或强制刷新）
 */
export function clearQuantoMultiplierCache(contract?: string) {
  if (contract) {
    quantoMultiplierCache.delete(contract);
    logger.debug(`清除 ${contract} 合约乘数缓存`);
  } else {
    quantoMultiplierCache.clear();
    logger.debug(`清除所有合约乘数缓存`);
  }
}

/**
 * 预加载常用合约的乘数（可选，用于启动时预热缓存）
 */
export async function preloadQuantoMultipliers(contracts: string[]): Promise<void> {
  logger.info(`预加载 ${contracts.length} 个合约的乘数...`);
  
  const results = await Promise.allSettled(
    contracts.map(contract => getQuantoMultiplier(contract, true))
  );
  
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  logger.info(`成功预加载 ${successCount}/${contracts.length} 个合约乘数`);
}

