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
 * 交易策略类型定义
 * 
 * 支持11种交易策略：
 * - conservative: 稳健策略，低风险低杠杆
 * - balanced: 平衡策略，中等风险，适合大多数投资者
 * - aggressive: 激进策略，高风险高杠杆
 * - aggressive-team: 激进团策略，团长+双团员突击决策模式
 * - ultra-short: 超短线策略，5分钟执行周期
 * - swing-trend: 波段趋势策略，20分钟执行周期，中长线持仓
 * - medium-long: 中长线策略，30分钟执行周期，AI主导决策，最小限制
 * - rebate-farming: 返佣套利策略，2-3分钟执行周期，高频微利交易
 * - ai-autonomous: AI自主策略，完全由AI主导，不提供任何策略建议
 * - multi-agent-consensus: 陪审团策略
 * - alpha-beta: Alpha Beta策略，零策略指导的AI完全自主决策
 */
export type TradingStrategy = "conservative" | "balanced" | "aggressive" | "aggressive-team" | "ultra-short" | "swing-trend" | "medium-long" | "rebate-farming" | "ai-autonomous" | "multi-agent-consensus" | "alpha-beta";

/**
 * 策略提示词生成上下文
 * 
 * 用于向各个策略的提示词生成函数传递运行时参数
 */
export interface StrategyPromptContext {
  /** 交易执行周期（分钟），如5分钟、20分钟 */
  intervalMinutes: number;
  /** 最大同时持仓数量 */
  maxPositions: number;
  /** 系统强制止损阈值（百分比），如-15表示亏损15%强制平仓 */
  extremeStopLossPercent: number;
  /** 最大持仓时间（小时），超过后强制平仓 */
  maxHoldingHours: number;
  /** 交易的币种列表，如['BTC', 'ETH'] */
  tradingSymbols: string[];
}

/**
 * 策略参数配置接口
 * 
 * 定义了一个完整交易策略所需的所有配置参数，包括：
 * - 杠杆配置
 * - 仓位管理
 * - 风控规则（止损、止盈、回撤保护）
 * - 波动率调整
 * - 自动监控配置（可选）
 */
export interface StrategyParams {
  /** 策略名称（中文），如"激进"、"平衡"等 */
  name: string;
  
  /** 策略描述，简要说明策略特点和适用人群 */
  description: string;
  
  /** 最小杠杆倍数，策略允许使用的最低杠杆 */
  leverageMin: number;
  
  /** 最大杠杆倍数，策略允许使用的最高杠杆 */
  leverageMax: number;
  
  /** 推荐杠杆配置，根据信号强度选择不同杠杆 */
  leverageRecommend: {
    /** 普通信号时使用的杠杆，如"15倍" */
    normal: string;
    /** 良好信号时使用的杠杆，如"19倍" */
    good: string;
    /** 强信号时使用的杠杆，如"25倍" */
    strong: string;
  };
  
  /** 最小仓位大小（账户净值百分比），如25表示25% */
  positionSizeMin: number;
  
  /** 最大仓位大小（账户净值百分比），如32表示32% */
  positionSizeMax: number;
  
  /** 所有持仓总保证金不超过此百分比（可选），如50表示50% */
  maxTotalMarginPercent?: number;
  
  /** 推荐仓位配置，根据信号强度选择不同仓位 */
  positionSizeRecommend: {
    /** 普通信号时使用的仓位，如"25-28%" */
    normal: string;
    /** 良好信号时使用的仓位，如"28-30%" */
    good: string;
    /** 强信号时使用的仓位，如"30-32%" */
    strong: string;
  };
  
  /** 止损配置，根据杠杆倍数分级（由AI主动执行） */
  stopLoss: {
    /** 低杠杆时的止损线（百分比），如-2.5表示亏损2.5%止损 */
    low: number;
    /** 中杠杆时的止损线（百分比），如-2表示亏损2%止损 */
    mid: number;
    /** 高杠杆时的止损线（百分比），如-1.5表示亏损1.5%止损 */
    high: number;
  };
  
  /** 移动止盈配置，盈利达到一定程度后移动止损线保护利润（由AI主动执行） */
  trailingStop: {
    /** 第一级：盈利达到trigger%时，止损线移至stopAt% */
    level1: { trigger: number; stopAt: number };
    /** 第二级：盈利达到trigger%时，止损线移至stopAt% */
    level2: { trigger: number; stopAt: number };
    /** 第三级：盈利达到trigger%时，止损线移至stopAt% */
    level3: { trigger: number; stopAt: number };
  };
  
  /** 分批止盈配置，逐步锁定利润（由AI主动执行） */
  partialTakeProfit: {
    /** 第一阶段：盈利达到trigger%时，平仓closePercent%的仓位 */
    stage1: { trigger: number; closePercent: number };
    /** 第二阶段：盈利达到trigger%时，平仓closePercent%的仓位 */
    stage2: { trigger: number; closePercent: number };
    /** 第三阶段：盈利达到trigger%时，平仓closePercent%的仓位（通常是100%全部清仓） */
    stage3: { trigger: number; closePercent: number };
  };
  
  /** 峰值回撤保护阈值（百分比），盈利从峰值回撤达到此值时强烈建议平仓 */
  peakDrawdownProtection: number;
  
  /** 波动率调整系数，根据市场波动率动态调整杠杆和仓位 */
  volatilityAdjustment: {
    /** 高波动时的调整系数（ATR > 5%） */
    highVolatility: {
      /** 杠杆调整系数，如0.8表示降低20%杠杆 */
      leverageFactor: number;
      /** 仓位调整系数，如0.85表示降低15%仓位 */
      positionFactor: number;
    };
    /** 正常波动时的调整系数（ATR 2-5%） */
    normalVolatility: {
      /** 杠杆调整系数，1.0表示不调整 */
      leverageFactor: number;
      /** 仓位调整系数，1.0表示不调整 */
      positionFactor: number;
    };
    /** 低波动时的调整系数（ATR < 2%） */
    lowVolatility: {
      /** 杠杆调整系数，如1.2表示提高20%杠杆 */
      leverageFactor: number;
      /** 仓位调整系数，如1.1表示提高10%仓位 */
      positionFactor: number;
    };
  };
  
  /** 入场条件描述，说明开仓时需要满足的信号要求 */
  entryCondition: string;
  
  /** 风险容忍度描述，说明策略的风险承受能力 */
  riskTolerance: string;
  
  /** 交易风格描述，说明策略的交易频率和持仓特点 */
  tradingStyle: string;
  
  /**
   * 是否启用代码级止损和移动止盈自动监控
   * 
   * true: 启用代码级保护，系统每10秒自动检查止损和移动止盈，AI不需要主动平仓
   * false: 禁用代码级保护，由AI根据策略规则主动执行止损和止盈
   * 
   * 默认配置：
   * - swing-trend（波段策略）：true（启用）
   * - 其他策略：false（禁用，由AI主动执行）
   */
  enableCodeLevelProtection: boolean;
  
  /**
   * 是否允许AI在代码级保护之外继续主动操作止盈止损（双重防护模式）
   * 
   * true: 即使启用了代码级保护，AI仍然可以主动执行止盈止损（双重防护）
   * false: 启用代码级保护后，AI不再主动执行止盈止损（单一防护）
   * 
   * 使用场景：
   * - ai-autonomous（AI自主策略）：true（双重防护，代码自动监控 + AI主动决策）
   * - 其他策略：false（单一防护，要么代码监控，要么AI决策）
   * 
   * 注意：此字段仅在 enableCodeLevelProtection = true 时有意义
   */
  allowAiOverrideProtection?: boolean;
  
  /**
   * 最大空仓时间（小时）
   * 
   * 如果设置此参数，当连续空仓超过指定小时数时，系统会提醒AI必须开仓
   * 用于防止过度保守，确保策略保持活跃
   * 
   * undefined: 不限制空仓时间
   * number: 最大空仓小时数，超过后强制要求开仓
   * 
   * 使用场景：
   * - alpha-beta策略：6小时（防止连续6小时不开仓）
   */
  maxIdleHours?: number;
}

