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
 * 消息面数据工具 - 通过 Gate MCP News 获取快讯/公告/事件异动
 */
import { createTool } from "@voltagent/core";
import { z } from "zod";
import { fetchCryptoNews, fetchExchangeAnnouncements, fetchLatestEvents } from "../../services/newsClient";

export const getCryptoNewsTool = createTool({
  name: "getCryptoNews",
  description: "获取指定币种的最新加密货币快讯和新闻，帮助分析市场情绪和重大事件影响",
  parameters: z.object({
    coin: z.string().describe("币种名称，如 BTC、ETH、SOL"),
    limit: z.number().optional().default(5).describe("返回数量，默认5条"),
  }),
  execute: async ({ coin, limit }) => {
    const items = await fetchCryptoNews(coin, limit);
    return {
      coin,
      count: items.length,
      items: items.map((item: any) => ({
        title: item?.metadata?.title || "",
        time: item?.metadata?.create_time || "",
        sentiment: item?.metadata?.labels?.sentiment || "unknown",
        score: item?.metadata?.total_score || 0,
        text: item?.text || "",
      })),
    };
  },
});

export const getExchangeAnnouncementsTool = createTool({
  name: "getExchangeAnnouncements",
  description: "获取指定币种相关的交易所公告，包括上新、下架、维护等重要信息",
  parameters: z.object({
    coin: z.string().describe("币种名称，如 BTC、ETH、SOL"),
    limit: z.number().optional().default(5).describe("返回数量，默认5条"),
  }),
  execute: async ({ coin, limit }) => {
    const items = await fetchExchangeAnnouncements(coin, limit);
    return {
      coin,
      count: items.length,
      items: items.map((item: any) => ({
        title: item?.metadata?.title || item?.title || "",
        time: item?.metadata?.create_time || item?.create_time || "",
        type: item?.metadata?.labels?.categories?.[0] || "",
        text: item?.text || "",
      })),
    };
  },
});

export const getLatestEventsTool = createTool({
  name: "getLatestEvents",
  description: "获取指定币种的最新事件异动，包括市场重大变动、项目动态等影响交易决策的事件",
  parameters: z.object({
    coin: z.string().describe("币种名称，如 BTC、ETH、SOL"),
    limit: z.number().optional().default(5).describe("返回数量，默认5条"),
  }),
  execute: async ({ coin, limit }) => {
    const items = await fetchLatestEvents(coin, limit);
    return {
      coin,
      count: items.length,
      items: items.map((item: any) => ({
        title: item?.event_title || "",
        time: item?.event_time || "",
        type: item?.event_type || "",
        context: item?.context || "",
        impact: item?.impact_analysis || "",
        tags: item?.tags || [],
      })),
    };
  },
});
