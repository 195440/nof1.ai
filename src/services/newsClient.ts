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
 * Gate MCP News 客户端
 * 通过 MCP 协议连接 Gate News 端点获取消息面数据（快讯/公告/事件异动）
 *
 * MCP 返回格式：{ content: [{ type: "text", text: "JSON" }], structuredContent: {...} }
 * structuredContent 中包含 items 数组，每条 item 结构：
 *   - metadata.title: 标题
 *   - metadata.create_time: 时间
 *   - metadata.labels.sentiment: 情绪（pos/neu/neg）
 *   - metadata.labels.categories: 分类
 *   - metadata.total_score: 影响力评分
 *   - text: 正文
 */
import { MCPConfiguration } from "@voltagent/core";
import { createLogger } from "../utils/loggerUtils";

const DEFAULT_MCP_URL = "https://api.gatemcp.ai/mcp/news";

const logger = createLogger({
  name: "news-client",
  level: "info",
});

let mcpConfig: MCPConfiguration | null = null;

function isEnabled(): boolean {
  return process.env.GATE_NEWS_MCP_ENABLED !== "false";
}

/**
 * 从 MCP callTool 返回的 content 中提取结构化数据
 * 优先使用 structuredContent，否则从 content[].text 中 JSON.parse
 */
function extractData(rawContent: unknown): any {
  if (rawContent == null) return null;

  if (typeof rawContent === "object" && !Array.isArray(rawContent)) {
    const obj = rawContent as Record<string, any>;

    if (obj.structuredContent) {
      return obj.structuredContent;
    }

    if (Array.isArray(obj.content)) {
      for (const item of obj.content) {
        if (item?.type === "text" && typeof item.text === "string") {
          try {
            return JSON.parse(item.text);
          } catch {
            return item.text;
          }
        }
      }
    }
  }

  if (Array.isArray(rawContent)) {
    for (const item of rawContent) {
      if (item && typeof item === "object" && (item as any).type === "text") {
        try {
          return JSON.parse((item as any).text);
        } catch {
          return (item as any).text;
        }
      }
    }
  }

  if (typeof rawContent === "string") {
    try {
      return JSON.parse(rawContent);
    } catch {
      return rawContent;
    }
  }

  return rawContent;
}

/**
 * 从提取的数据中获取 items 数组
 */
function extractItems(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.items && Array.isArray(data.items)) return data.items;
  return [];
}

/**
 * 检查 MCP 返回是否为错误
 */
function isErrorResult(rawContent: unknown): boolean {
  if (rawContent && typeof rawContent === "object" && (rawContent as any).isError) {
    return true;
  }
  return false;
}

export async function initNewsClient(): Promise<void> {
  if (!isEnabled()) {
    logger.info("Gate News MCP 已禁用 (GATE_NEWS_MCP_ENABLED=false)");
    return;
  }

  try {
    const url = process.env.GATE_NEWS_MCP_URL || DEFAULT_MCP_URL;
    mcpConfig = new MCPConfiguration({
      servers: {
        gateNews: {
          type: "http",
          url,
          timeout: 15000,
        },
      },
    });
    logger.info(`Gate News MCP 客户端初始化成功: ${url}`);
  } catch (error) {
    logger.error("Gate News MCP 客户端初始化失败:", error as any);
    mcpConfig = null;
  }
}

/**
 * 搜索币种相关快讯（news_feed_search_news）
 * 返回 items 数组，每条含 metadata.title / metadata.create_time / metadata.labels.sentiment / text
 */
export async function fetchCryptoNews(coin: string, limit: number = 5): Promise<any[]> {
  if (!mcpConfig) return [];

  try {
    const client = await mcpConfig.getClient("gateNews");
    if (!client) return [];

    const result = await client.callTool({
      name: "news_feed_search_news",
      arguments: { coin, limit },
    });

    if (isErrorResult(result.content)) {
      logger.warn(`获取 ${coin} 快讯返回错误`);
      return [];
    }

    const data = extractData(result.content);
    return extractItems(data);
  } catch (error) {
    logger.warn(`获取 ${coin} 快讯失败:`, error as any);
    return [];
  }
}

/**
 * 获取交易所公告（news_feed_get_exchange_announcements）
 */
export async function fetchExchangeAnnouncements(coin: string, limit: number = 5): Promise<any[]> {
  if (!mcpConfig) return [];

  try {
    const client = await mcpConfig.getClient("gateNews");
    if (!client) return [];

    const result = await client.callTool({
      name: "news_feed_get_exchange_announcements",
      arguments: { coin, limit },
    });

    if (isErrorResult(result.content)) {
      logger.warn(`获取 ${coin} 交易所公告返回错误`);
      return [];
    }

    const data = extractData(result.content);
    return extractItems(data);
  } catch (error) {
    logger.warn(`获取 ${coin} 交易所公告失败:`, error as any);
    return [];
  }
}

/**
 * 获取最新事件异动（news_events_get_latest_events）
 * 替代原 fetchSocialSentiment，可按币种查询市场异动事件
 */
export async function fetchLatestEvents(coin: string, limit: number = 5): Promise<any[]> {
  if (!mcpConfig) return [];

  try {
    const client = await mcpConfig.getClient("gateNews");
    if (!client) return [];

    const result = await client.callTool({
      name: "news_events_get_latest_events",
      arguments: { coin, limit, time_range: "24h" },
    });

    if (isErrorResult(result.content)) {
      logger.warn(`获取 ${coin} 事件异动返回错误`);
      return [];
    }

    const data = extractData(result.content);
    return extractItems(data);
  } catch (error) {
    logger.warn(`获取 ${coin} 事件异动失败:`, error as any);
    return [];
  }
}

/**
 * 从快讯 items 中聚合情绪分布
 * 每条快讯的 metadata.labels.sentiment 为 pos/neu/neg
 */
export function aggregateSentiment(newsItems: any[]): { pos: number; neu: number; neg: number; direction: string } {
  const counts = { pos: 0, neu: 0, neg: 0 };

  for (const item of newsItems) {
    const s = item?.metadata?.labels?.sentiment;
    if (s === "pos") counts.pos++;
    else if (s === "neg") counts.neg++;
    else counts.neu++;
  }

  const total = counts.pos + counts.neu + counts.neg;
  let direction = "中性";
  if (total > 0) {
    if (counts.pos > counts.neg && counts.pos >= total * 0.4) direction = "偏多";
    else if (counts.neg > counts.pos && counts.neg >= total * 0.4) direction = "偏空";
  }

  return { ...counts, direction };
}

export async function getNewsMCPTools(): Promise<any[]> {
  if (!mcpConfig) return [];
  try {
    return await mcpConfig.getTools();
  } catch (error) {
    logger.warn("获取 News MCP 工具失败:", error as any);
    return [];
  }
}

export async function disconnectNewsClient(): Promise<void> {
  if (mcpConfig) {
    try {
      await mcpConfig.disconnect();
      logger.info("Gate News MCP 客户端已断开连接");
    } catch (error) {
      logger.warn("断开 Gate News MCP 客户端连接失败:", error as any);
    }
    mcpConfig = null;
  }
}
