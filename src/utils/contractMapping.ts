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
 * 交易所合约名称映射工具
 * 处理不同交易所的合约格式转换
 */

/**
 * 统一合约格式 (使用Gate格式作为内部标准)
 * 例如: BTC_USDT
 */
export type UnifiedContract = string;

/**
 * 将统一格式转换为Gate格式
 * BTC_USDT -> BTC_USDT (无需转换)
 */
export function toGateContract(unifiedContract: UnifiedContract): string {
  return unifiedContract;
}

/**
 * 将统一格式转换为OKX格式
 * BTC_USDT -> BTC-USDT-SWAP
 */
export function toOkxContract(unifiedContract: UnifiedContract): string {
  const symbol = unifiedContract.replace("_USDT", "");
  return `${symbol}-USDT-SWAP`;
}

/**
 * 从Gate格式转换为统一格式
 * BTC_USDT -> BTC_USDT (无需转换)
 */
export function fromGateContract(gateContract: string): UnifiedContract {
  return gateContract;
}

/**
 * 从OKX格式转换为统一格式
 * BTC-USDT-SWAP -> BTC_USDT
 */
export function fromOkxContract(okxContract: string): UnifiedContract {
  const symbol = okxContract.replace("-USDT-SWAP", "");
  return `${symbol}_USDT`;
}

/**
 * 根据当前交易所将统一格式转换为对应格式
 */
export function toExchangeContract(unifiedContract: UnifiedContract, exchange: "gate" | "okx"): string {
  if (exchange === "okx") {
    return toOkxContract(unifiedContract);
  }
  return toGateContract(unifiedContract);
}

/**
 * 根据当前交易所将交易所格式转换为统一格式
 */
export function fromExchangeContract(exchangeContract: string, exchange: "gate" | "okx"): UnifiedContract {
  if (exchange === "okx") {
    return fromOkxContract(exchangeContract);
  }
  return fromGateContract(exchangeContract);
}

/**
 * 从合约名称中提取币种代码
 * BTC_USDT -> BTC
 */
export function extractSymbol(unifiedContract: UnifiedContract): string {
  return unifiedContract.split("_")[0];
}

/**
 * 从币种代码构建统一合约名称
 * BTC -> BTC_USDT
 */
export function buildContract(symbol: string): UnifiedContract {
  return `${symbol}_USDT`;
}

