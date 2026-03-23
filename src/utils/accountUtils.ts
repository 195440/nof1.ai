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
 * 统一账户资金口径：
 * - cashBalance: 账户现金余额（不含未实现盈亏）
 * - equityBalance: 真实总资产 = 现金余额 + 未实现盈亏
 * - totalBalance: equityBalance 的别名，供旧调用方平滑迁移
 */

export interface NormalizedFuturesAccount {
  cashBalance: number;
  equityBalance: number;
  totalBalance: number;
  availableBalance: number;
  positionMargin: number;
  orderMargin: number;
  unrealisedPnl: number;
}

function parseAccountNumber(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFuturesAccount(account: any): NormalizedFuturesAccount {
  const cashBalance = parseAccountNumber(account?.total);
  const unrealisedPnl = parseAccountNumber(account?.unrealisedPnl ?? account?.unrealizedPnl);
  const equityBalance = cashBalance + unrealisedPnl;

  return {
    cashBalance,
    equityBalance,
    totalBalance: equityBalance,
    availableBalance: parseAccountNumber(account?.available),
    positionMargin: parseAccountNumber(account?.positionMargin ?? account?.position_margin),
    orderMargin: parseAccountNumber(account?.orderMargin ?? account?.order_margin),
    unrealisedPnl,
  };
}

export function calculateReturnPercent(currentBalance: number, initialBalance: number): number {
  return initialBalance > 0 ? ((currentBalance - initialBalance) / initialBalance) * 100 : 0;
}

