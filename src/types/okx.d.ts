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
 * OKX API 类型定义
 */

declare module "okx" {
  // OKX API 响应基础格式
  export interface OkxResponse<T> {
    code: string;
    msg: string;
    data: T;
  }

  // 账户余额信息
  export interface OkxBalance {
    totalEq: string;  // 美元层面权益
    isoEq: string;    // 美元层面逐仓仓位权益
    adjEq: string;    // 美元层面有效保证金
    ordFroz: string;  // 美元层面全仓挂单占用保证金
    imr: string;      // 美元层面占用保证金
    mmr: string;      // 美元层面维持保证金
    mgnRatio: string; // 美元层面保证金率
    notionalUsd: string; // 以美元价值为单位的持仓数量
    details: OkxBalanceDetail[];
  }

  export interface OkxBalanceDetail {
    ccy: string;         // 币种
    eq: string;          // 币种总权益
    cashBal: string;     // 币种余额
    availBal: string;    // 可用保证金
    frozenBal: string;   // 币种占用金额
    ordFrozen: string;   // 挂单冻结数量
    liab: string;        // 币种负债额
    upl: string;         // 未实现盈亏
    uplLiab: string;     // 由于仓位未实现亏损导致的负债
    crossLiab: string;   // 币种全仓负债额
    isoLiab: string;     // 币种逐仓负债额
    mgnRatio: string;    // 保证金率
    interest: string;    // 计息
    twap: string;        // 当前负债币种触发系统自动换币的风险
    maxLoan: string;     // 币种最大可借
    eqUsd: string;       // 币种权益美元价值
    notionalLever: string; // 币种杠杆倍数
    stgyEq: string;      // 策略权益
    isoUpl: string;      // 逐仓未实现盈亏
  }

  // 持仓信息
  export interface OkxPosition {
    instId: string;      // 产品ID
    instType: string;    // 产品类型
    mgnMode: string;     // 保证金模式
    posSide: string;     // 持仓方向
    pos: string;         // 持仓数量
    availPos: string;    // 可平仓数量
    avgPx: string;       // 开仓平均价
    upl: string;         // 未实现盈亏
    uplRatio: string;    // 未实现盈亏比率
    lever: string;       // 杠杆倍数
    liqPx: string;       // 预估强平价
    markPx: string;      // 最新标记价格
    margin: string;      // 保证金余额
    mgnRatio: string;    // 保证金率
    mmr: string;         // 维持保证金
    liab: string;        // 负债额
    liabCcy: string;     // 负债币种
    interest: string;    // 利息
    last: string;        // 最新成交价
    notionalUsd: string; // 以美元价值为单位的持仓数量
    adl: string;         // 信号区
    ccy: string;         // 保证金币种
    realizedPnl: string; // 已实现盈亏
  }

  // 订单信息
  export interface OkxOrder {
    instId: string;      // 产品ID
    instType: string;    // 产品类型
    ordId: string;       // 订单ID
    clOrdId: string;     // 客户自定义订单ID
    px: string;          // 委托价格
    sz: string;          // 委托数量
    ordType: string;     // 订单类型
    side: string;        // 订单方向
    posSide: string;     // 持仓方向
    tdMode: string;      // 交易模式
    tgtCcy: string;      // 委托数量的类型
    fillPx: string;      // 最新成交价格
    tradeId: string;     // 最新成交ID
    fillSz: string;      // 最新成交数量
    fillTime: string;    // 最新成交时间
    avgPx: string;       // 成交均价
    state: string;       // 订单状态
    lever: string;       // 杠杆倍数
    accFillSz: string;   // 累计成交数量
    fillNotionalUsd: string; // 最新成交金额
    pnl: string;         // 收益
    fee: string;         // 订单交易手续费
    feeCcy: string;      // 交易手续费币种
    rebate: string;      // 返佣金额
    rebateCcy: string;   // 返佣币种
    category: string;    // 订单种类
    uTime: string;       // 订单状态更新时间
    cTime: string;       // 订单创建时间
    reduceOnly: string;  // 是否只减仓
  }

  // Ticker 信息
  export interface OkxTicker {
    instId: string;      // 产品ID
    instType: string;    // 产品类型
    last: string;        // 最新成交价
    lastSz: string;      // 最新成交的数量
    askPx: string;       // 卖一价
    askSz: string;       // 卖一数量
    bidPx: string;       // 买一价
    bidSz: string;       // 买一数量
    open24h: string;     // 24小时开盘价
    high24h: string;     // 24小时最高价
    low24h: string;      // 24小时最低价
    volCcy24h: string;   // 24小时成交量（计价货币）
    vol24h: string;      // 24小时成交量（交易货币）
    ts: string;          // Ticker数据产生时间
    sodUtc0: string;     // UTC 0 时开盘价
    sodUtc8: string;     // UTC+8 时开盘价
    idxPx: string;       // 指数价格
    markPx: string;      // 标记价格
  }

  // K线数据
  export type OkxCandle = [
    string,  // 开始时间
    string,  // 开盘价
    string,  // 最高价
    string,  // 最低价
    string,  // 收盘价
    string,  // 成交量（交易货币）
    string,  // 成交量（计价货币）
    string,  // 成交量（计价货币）（衍生品不适用）
    string   // 确认状态
  ];

  // 资金费率
  export interface OkxFundingRate {
    instId: string;         // 产品ID
    instType: string;       // 产品类型
    fundingRate: string;    // 当期资金费率
    nextFundingRate: string; // 预测下期资金费率
    fundingTime: string;    // 资金费时间
  }

  // 产品信息
  export interface OkxInstrument {
    instId: string;      // 产品ID
    instType: string;    // 产品类型
    uly: string;         // 标的指数
    category: string;    // 币种类别
    baseCcy: string;     // 交易货币币种
    quoteCcy: string;    // 计价货币币种
    settleCcy: string;   // 盈亏结算和保证金币种
    ctVal: string;       // 合约面值
    ctMult: string;      // 合约乘数
    ctValCcy: string;    // 合约面值计价币种
    optType: string;     // 期权类型
    stk: string;         // 行权价格
    listTime: string;    // 上线时间
    expTime: string;     // 产品下线时间
    lever: string;       // 该instId支持的最大杠杆倍数
    tickSz: string;      // 下单价格精度
    lotSz: string;       // 下单数量精度
    minSz: string;       // 最小下单数量
    ctType: string;      // 合约类型
    alias: string;       // 合约日期别名
    state: string;       // 产品状态
    maxLmtSz: string;    // 最大限价单委托数量
    maxMktSz: string;    // 最大市价单委托数量
    maxTwapSz: string;   // 最大冰山委托数量
    maxIcebergSz: string; // 最大冰山委托数量
    maxTriggerSz: string; // 最大计划委托数量
    maxStopSz: string;   // 最大止盈止损市价委托数量
  }

  // 订单簿
  export interface OkxOrderBook {
    asks: string[][];    // 卖方深度
    bids: string[][];    // 买方深度
    ts: string;          // 订单簿产生的时间
  }

  // 成交记录
  export interface OkxTrade {
    instId: string;      // 产品ID
    tradeId: string;     // 成交ID
    px: string;          // 成交价格
    sz: string;          // 成交数量
    side: string;        // 成交方向
    ts: string;          // 成交时间
  }

  // 账户成交记录
  export interface OkxFill {
    instId: string;      // 产品ID
    instType: string;    // 产品类型
    tradeId: string;     // 最新成交ID
    ordId: string;       // 订单ID
    clOrdId: string;     // 客户自定义订单ID
    billId: string;      // 账单ID
    tag: string;         // 订单标签
    fillPx: string;      // 最新成交价格
    fillSz: string;      // 最新成交数量
    side: string;        // 订单方向
    posSide: string;     // 持仓方向
    execType: string;    // 流动性方向
    feeCcy: string;      // 交易手续费币种
    fee: string;         // 交易手续费
    ts: string;          // 成交时间
  }

  // WebSocket 订阅参数
  export interface OkxWsSubscription {
    channel: string;     // 频道名称
    instId?: string;     // 产品ID（可选）
    instType?: string;   // 产品类型（可选）
  }

  // WebSocket 消息基础格式
  export interface OkxWsMessage {
    event?: string;      // 事件类型
    arg?: OkxWsSubscription;
    data?: any[];        // 推送数据
    code?: string;       // 错误码
    msg?: string;        // 错误信息
  }

  // WebSocket 订阅响应
  export interface OkxWsSubscribeResponse {
    event: "subscribe" | "unsubscribe" | "error";
    arg: OkxWsSubscription;
    code?: string;
    msg?: string;
  }

  // WebSocket ticker 推送数据
  export interface OkxWsTickerData {
    instId: string;      // 产品ID
    last: string;        // 最新成交价
    lastSz: string;      // 最新成交的数量
    askPx: string;       // 卖一价
    askSz: string;       // 卖一数量
    bidPx: string;       // 买一价
    bidSz: string;       // 买一数量
    open24h: string;     // 24小时开盘价
    high24h: string;     // 24小时最高价
    low24h: string;      // 24小时最低价
    vol24h: string;      // 24小时成交量（交易货币）
    volCcy24h: string;   // 24小时成交量（计价货币）
    ts: string;          // ticker数据产生时间
    idxPx: string;       // 指数价格
    markPx: string;      // 标记价格
  }

  // WebSocket candle 推送数据
  export type OkxWsCandleData = [
    string,  // 开始时间（毫秒时间戳）
    string,  // 开盘价
    string,  // 最高价
    string,  // 最低价
    string,  // 收盘价
    string,  // 成交量（交易货币）
    string,  // 成交量（计价货币）
    string,  // 成交量（计价货币）（衍生品不适用）
    string   // 确认状态（0：未确认，1：已确认）
  ];
}

