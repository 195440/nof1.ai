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
 * 日志工具模块
 * 提供统一的日志记录功能，支持中国时区和中文编码处理
 */

import { createPinoLogger } from "@voltagent/logger";
import { createSafeLogger } from "./encodingUtils";

/**
 * 日志级别类型定义
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  /** 日志名称 */
  name: string;
  /** 日志级别 */
  level: LogLevel;
  /** 是否启用颜色 */
  colorize?: boolean;
  /** 时间格式 */
  timeFormat?: string;
  /** 是否启用单行模式 */
  singleLine?: boolean;
}

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG: LoggerConfig = {
  name: "ai-btc",
  level: "info",
  colorize: true,
  timeFormat: 'SYS:yyyy-mm-dd HH:MM:ss',
  singleLine: true
};

/**
 * 创建基础Pino日志实例
 * @param config 日志配置
 * @returns Pino日志实例
 */
function createPinoInstance(config: LoggerConfig) {
  return createPinoLogger({
    name: config.name,
    level: config.level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: config.colorize ?? true,
        translateTime: config.timeFormat ?? 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname,env,component',
        messageFormat: '{msg}',
        singleLine: config.singleLine ?? true
      }
    }
  });
}

/**
 * 包装日志方法，处理中文编码问题
 * @param loggerInstance Pino日志实例
 * @returns 安全的日志方法对象
 */
function wrapLoggerMethods(loggerInstance: any) {
  return {
    info: createSafeLogger(loggerInstance.info.bind(loggerInstance)),
    error: createSafeLogger(loggerInstance.error.bind(loggerInstance)),
    warn: createSafeLogger(loggerInstance.warn.bind(loggerInstance)),
    debug: createSafeLogger(loggerInstance.debug.bind(loggerInstance)),
    trace: createSafeLogger(loggerInstance.trace.bind(loggerInstance)),
    fatal: createSafeLogger(loggerInstance.fatal.bind(loggerInstance)),
    // 添加 child 方法支持
    child: (bindings: any) => {
      const childLogger = loggerInstance.child(bindings);
      return wrapLoggerMethods(childLogger);
    }
  };
}

/**
 * 创建自定义配置的日志实例
 * @param config 日志配置
 * @returns 配置好的安全日志实例
 */
export function createLogger(config: LoggerConfig) {
  const pinoInstance = createPinoInstance(config);
  return wrapLoggerMethods(pinoInstance);
}

/**
 * 创建默认配置的日志实例
 * @param options 可选配置，可覆盖默认配置
 * @returns 默认配置的安全日志实例
 */
export function createDefaultLogger(options: Partial<LoggerConfig> = {}) {
  const config: LoggerConfig = { ...DEFAULT_CONFIG, ...options };
  return createLogger(config);
}

/**
 * 默认的日志实例（单例模式）
 * 使用默认配置创建的安全日志实例
 */
export const logger = createDefaultLogger();