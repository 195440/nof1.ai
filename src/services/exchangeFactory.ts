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
 * 交易所客户端工厂
 * 根据环境变量动态创建对应的交易所客户端
 */
import { GateClient } from "./gateClient";
import { OKXClient } from "./okxClient";
import type { IExchangeClient } from "./exchangeClient";

/**
 * 全局交易所客户端实例（单例模式）
 */
let exchangeClientInstance: IExchangeClient | null = null;

/**
 * 创建交易所客户端实例（单例模式）
 * 
 * 根据环境变量 EXCHANGE 决定使用哪个交易所：
 * - "gate" (默认): 使用 Gate.io
 * - "okx": 使用 OKX
 * 
 * 网络环境由 EXCHANGE_NETWORK 控制：
 * - "testnet": 测试网
 * - "mainnet": 正式网（默认）
 * 
 * 向后兼容：
 * - Gate.io 仍然可以使用 GATE_USE_TESTNET 环境变量
 * - 如果未设置 EXCHANGE，默认使用 Gate.io
 */
export function createExchangeClient(): IExchangeClient {
  // 如果已存在实例，直接返回（单例模式）
  if (exchangeClientInstance) {
    return exchangeClientInstance;
  }

  // 读取环境变量，默认使用 Gate
  const exchange = process.env.EXCHANGE?.toLowerCase() || "gate";

  // 根据交易所类型创建对应的客户端
  if (exchange === "okx") {
    // 创建 OKX 客户端
    const apiKey = process.env.OKX_API_KEY;
    const apiSecret = process.env.OKX_API_SECRET;
    const passphrase = process.env.OKX_PASSPHRASE;

    if (!apiKey || !apiSecret || !passphrase) {
      throw new Error(
        "OKX_API_KEY、OKX_API_SECRET 和 OKX_PASSPHRASE 必须在环境变量中设置"
      );
    }

    exchangeClientInstance = new OKXClient(apiKey, apiSecret, passphrase);
  } else if (exchange === "gate") {
    // 创建 Gate 客户端（默认）
    const apiKey = process.env.GATE_API_KEY;
    const apiSecret = process.env.GATE_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("GATE_API_KEY 和 GATE_API_SECRET 必须在环境变量中设置");
    }

    exchangeClientInstance = new GateClient(apiKey, apiSecret);
  } else {
    throw new Error(
      `不支持的交易所: ${exchange}。支持的交易所: gate, okx`
    );
  }

  return exchangeClientInstance;
}

/**
 * 保留原有的 createGateClient 函数以确保向后兼容
 * 
 * @deprecated 建议使用 createExchangeClient() 代替
 */
export function createGateClient(): GateClient {
  // 如果 EXCHANGE 未设置或设置为 gate，返回 Gate 客户端
  const exchange = process.env.EXCHANGE?.toLowerCase() || "gate";
  
  if (exchange !== "gate") {
    throw new Error(
      "createGateClient() 只能在 EXCHANGE=gate 时使用。请使用 createExchangeClient() 代替。"
    );
  }
  
  const client = createExchangeClient();
  
  // 类型检查：确保是 GateClient
  if (!(client instanceof GateClient)) {
    throw new Error("createGateClient() 返回的不是 GateClient 实例");
  }
  
  return client;
}

