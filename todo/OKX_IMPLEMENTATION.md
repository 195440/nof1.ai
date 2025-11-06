# OKX 交易所接入 - 开发任务清单

> 📅 创建时间：2025-11-06  
> 📊 当前状态：架构完成，实现待补充  
> 🎯 目标：完整实现 OKX 交易所支持

---

## 📋 当前完成情况

### ✅ 已完成（100%）

1. **多交易所架构设计**
   - ✅ 创建统一接口 `IExchangeClient`（17个方法）
   - ✅ 实现工厂模式 `createExchangeClient()`
   - ✅ 环境变量配置系统
   - ✅ Gate.io 客户端改造（零逻辑变动）
   - ✅ 全局替换 53 处调用点
   - ✅ TypeScript 类型检查通过
   - ✅ 项目成功构建

2. **向后兼容性**
   - ✅ Gate 用户零影响
   - ✅ 默认使用 Gate.io
   - ✅ 保留旧函数 `createGateClient()`

3. **OKX 客户端框架**
   - ✅ 安装 `okx-api` SDK (v3.0.8)
   - ✅ 创建 `OKXClient` 类
   - ✅ 实现 `IExchangeClient` 接口
   - ✅ 合约名称转换逻辑

### ⚠️ 待实现（0%）

**所有 17 个 API 方法当前为占位实现**，调用时会抛出：
```
Error: OKX.{method}() 尚未实现。请参考 OKX API 文档完善实现：https://www.okx.com/docs-v5/
```

---

## 🎯 实施任务清单

### 阶段 1：环境准备（优先级：P0）

#### 任务 1.1：注册 OKX 测试账户
- [ ] 访问 OKX 官网注册账户
- [ ] 开通测试网权限
- [ ] 创建 API Key（测试网）
  - API Key
  - Secret Key  
  - Passphrase
- [ ] 在 `.env` 文件中配置：
  ```bash
  EXCHANGE=okx
  EXCHANGE_NETWORK=testnet
  OKX_API_KEY=your_test_key
  OKX_API_SECRET=your_test_secret
  OKX_PASSPHRASE=your_test_passphrase
  ```

#### 任务 1.2：验证 API 连通性
- [ ] 创建简单测试脚本
- [ ] 测试基本 API 调用
- [ ] 确认测试网/正式网切换

### 阶段 2：核心功能实现（优先级：P0）

这些是交易系统运行的必需功能。

#### 任务 2.1：实现 `getFuturesAccount()` - 获取账户余额
**文件位置**：`src/services/okxClient.ts:87`

**OKX API 参考**：
- 端点：`GET /api/v5/account/balance`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-account-get-balance

**实现要点**：
```typescript
async getFuturesAccount(retries: number = 2): Promise<any> {
  // 1. 调用 OKX API 获取账户信息
  // 2. 查找 USDT 账户数据
  // 3. 转换为 Gate 兼容格式：
  //    {
  //      currency: "USDT",
  //      total: string,           // 权益
  //      available: string,       // 可用余额
  //      positionMargin: string,  // 持仓保证金
  //      orderMargin: string,     // 订单保证金
  //      unrealisedPnl: string    // 未实现盈亏
  //    }
  // 4. 添加重试机制
  // 5. 错误处理
}
```

**Gate 对照实现**：`src/services/gateClient.ts:126`

---

#### 任务 2.2：实现 `getPositions()` - 获取当前持仓
**文件位置**：`src/services/okxClient.ts:91`

**OKX API 参考**：
- 端点：`GET /api/v5/account/positions`
- 参数：`instType=SWAP`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-account-get-positions

**实现要点**：
```typescript
async getPositions(retries: number = 2): Promise<any[]> {
  // 1. 获取所有永续合约持仓
  // 2. 过滤只保留 RISK_PARAMS.TRADING_SYMBOLS 允许的币种
  // 3. 转换合约名称：BTC-USDT-SWAP -> BTC_USDT
  // 4. 转换为 Gate 兼容格式：
  //    {
  //      contract: string,      // BTC_USDT
  //      size: string,          // 持仓数量（正数=多，负数=空）
  //      leverage: string,      // 杠杆倍数
  //      entryPrice: string,    // 开仓均价
  //      markPrice: string,     // 标记价格
  //      liqPrice: string,      // 强平价格
  //      unrealisedPnl: string, // 未实现盈亏
  //      realisedPnl: string,   // 已实现盈亏
  //      margin: string         // 保证金
  //    }
}
```

**Gate 对照实现**：`src/services/gateClient.ts:150`

---

#### 任务 2.3：实现 `getFuturesTicker()` - 获取行情价格
**文件位置**：`src/services/okxClient.ts:74`

**OKX API 参考**：
- 端点：`GET /api/v5/market/ticker?instId={instId}`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-market-data-get-ticker

**实现要点**：
```typescript
async getFuturesTicker(contract: string, retries: number = 2): Promise<any> {
  // 1. 转换合约名称：BTC_USDT -> BTC-USDT-SWAP
  // 2. 调用 OKX ticker API
  // 3. 转换为 Gate 兼容格式：
  //    {
  //      contract: string,
  //      last: string,           // 最新价
  //      markPrice: string,      // 标记价格
  //      indexPrice: string,     // 指数价格
  //      high24h: string,        // 24h最高价
  //      low24h: string,         // 24h最低价
  //      volume24h: string,      // 24h成交量
  //      changePercentage: string // 24h涨跌幅
  //    }
  // 4. 添加重试机制
}
```

**Gate 对照实现**：`src/services/gateClient.ts:66`

---

#### 任务 2.4：实现 `placeOrder()` - 下单交易
**文件位置**：`src/services/okxClient.ts:95`

**OKX API 参考**：
- 端点：`POST /api/v5/trade/order`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-trade-place-order

**实现要点**：
```typescript
async placeOrder(params: PlaceOrderParams): Promise<any> {
  // 1. 转换合约名称
  // 2. 构建 OKX 订单参数：
  //    {
  //      instId: string,        // BTC-USDT-SWAP
  //      tdMode: "cross",       // 全仓模式
  //      side: "buy"|"sell",    // 根据 size 正负判断
  //      ordType: "market"|"limit",
  //      sz: string,            // 数量（绝对值）
  //      px?: string            // 限价单价格
  //    }
  // 3. 处理 reduceOnly（只减仓）
  // 4. 调用 API 下单
  // 5. 转换返回格式
  // 6. 错误处理（特别是保证金不足等情况）
}
```

**重要**：
- OKX 的止盈止损需要单独设置，与 Gate 不同
- 需要处理市价单和限价单的不同参数

**Gate 对照实现**：`src/services/gateClient.ts:186`（这是最复杂的方法，参考价值最高）

---

#### 任务 2.5：实现 `cancelOrder()` - 取消订单
**文件位置**：`src/services/okxClient.ts:103`

**OKX API 参考**：
- 端点：`POST /api/v5/trade/cancel-order`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-trade-cancel-order

**实现要点**：
```typescript
async cancelOrder(orderId: string): Promise<any> {
  // 1. 调用 OKX 取消订单 API
  // 2. 需要 instId（从哪里获取？可能需要先查询订单）
  // 3. 返回取消结果
}
```

**Gate 对照实现**：`src/services/gateClient.ts:427`

---

### 阶段 3：功能完善（优先级：P1）

#### 任务 3.1：实现 `setLeverage()` - 设置杠杆
**文件位置**：`src/services/okxClient.ts:111`

**OKX API 参考**：
- 端点：`POST /api/v5/account/set-leverage`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-account-set-leverage

---

#### 任务 3.2：实现 `getOpenOrders()` - 获取未成交订单
**文件位置**：`src/services/okxClient.ts:107`

**OKX API 参考**：
- 端点：`GET /api/v5/trade/orders-pending`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-trade-get-order-list

---

#### 任务 3.3：实现 `getFuturesCandles()` - 获取K线数据
**文件位置**：`src/services/okxClient.ts:78`

**OKX API 参考**：
- 端点：`GET /api/v5/market/candles`
- 文档：https://www.okx.com/docs-v5/en/#rest-api-market-data-get-candlesticks

**时间周期转换**：
- Gate: `5m`, `15m`, `1h`, `4h`
- OKX: `5m`, `15m`, `1H`, `4H`（注意大小写）

---

#### 任务 3.4：实现 `getOrder()` - 获取订单详情
**文件位置**：`src/services/okxClient.ts:99`

---

#### 任务 3.5：实现 `getFundingRate()` - 获取资金费率
**文件位置**：`src/services/okxClient.ts:115`

---

#### 任务 3.6：实现 `getContractInfo()` - 获取合约信息
**文件位置**：`src/services/okxClient.ts:119`

---

### 阶段 4：辅助功能（优先级：P2）

这些功能对交易非必需，但有助于完善系统。

- [ ] `getAllContracts()` - 获取所有合约列表
- [ ] `getOrderBook()` - 获取订单簿
- [ ] `getMyTrades()` - 获取我的成交记录
- [ ] `getPositionHistory()` - 获取历史持仓
- [ ] `getSettlementHistory()` - 获取结算记录
- [ ] `getOrderHistory()` - 获取历史订单

---

## 📚 技术参考

### OKX API 文档
- **官方文档**：https://www.okx.com/docs-v5/
- **REST API**：https://www.okx.com/docs-v5/en/#rest-api
- **错误码**：https://www.okx.com/docs-v5/en/#error-code

### SDK 使用
```typescript
import { RestClient } from "okx-api";

const client = new RestClient({
  apiKey: process.env.OKX_API_KEY,
  apiSecret: process.env.OKX_API_SECRET,
  apiPass: process.env.OKX_PASSPHRASE,
});

// 示例调用
const balance = await client.getBalance();
const positions = await client.getPositions({ instType: "SWAP" });
```

### 关键差异对照表

| 功能 | Gate API | OKX API |
|------|----------|---------|
| **合约命名** | `BTC_USDT` | `BTC-USDT-SWAP` |
| **永续合约类型** | settle="usdt" | instType="SWAP" |
| **响应格式** | `{ body: [...] }` | `{ code: "0", data: [...], msg: "" }` |
| **订单方向** | size 正负表示多空 | side="buy"/"sell" |
| **时间戳** | 秒 | 毫秒 |
| **成功判断** | HTTP 200 | code="0" |

---

## 🧪 测试策略

### 单元测试
每实现一个方法后：
1. 创建测试脚本 `test-okx-{method}.ts`
2. 验证正确场景
3. 验证错误处理
4. 对比 Gate 行为一致性

### 集成测试
完成核心功能后：
1. 完整交易流程测试：
   - 获取账户余额 ✓
   - 获取市场价格 ✓
   - 开仓 ✓
   - 查询持仓 ✓
   - 平仓 ✓
2. 边界条件测试
3. 错误恢复测试

### 生产验证
1. 小额资金测试
2. 监控日志
3. 对比 Gate 交易结果

---

## 🔧 实现建议

### 1. 逐个实现，逐个测试
不要一次实现所有方法，建议顺序：
1. `getFuturesAccount()` → 验证连通性
2. `getFuturesTicker()` → 验证数据转换
3. `getPositions()` → 验证持仓逻辑
4. `placeOrder()` → 验证交易逻辑（最复杂）
5. 其他方法...

### 2. 错误处理模板
```typescript
async someMethod(params) {
  let lastError: any;
  
  for (let i = 0; i <= retries; i++) {
    try {
      // API 调用
      const result = await this.client.someApi(...);
      
      // OKX 特定的错误检查
      if (result.code !== "0") {
        throw new Error(`OKX API 错误: ${result.msg}`);
      }
      
      // 数据转换
      return this.convertToGateFormat(result.data);
      
    } catch (error) {
      lastError = error;
      if (i < retries) {
        logger.warn(`操作失败，重试 ${i + 1}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, 300 * (i + 1)));
      }
    }
  }
  
  logger.error(`操作失败（${retries}次重试）:`, lastError);
  throw lastError;
}
```

### 3. 数据转换辅助函数
建议添加私有方法：
```typescript
private convertTickerToGateFormat(okxTicker: any) { ... }
private convertPositionToGateFormat(okxPosition: any) { ... }
private convertOrderToGateFormat(okxOrder: any) { ... }
```

### 4. 日志记录
每个方法都应该记录：
- 入参（脱敏）
- API 调用结果
- 转换后的数据
- 错误信息

---

## 📊 进度追踪

创建一个检查清单，每完成一项打钩：

### 核心功能（必需）
- [ ] getFuturesAccount - 获取账户
- [ ] getPositions - 获取持仓
- [ ] getFuturesTicker - 获取价格
- [ ] placeOrder - 下单
- [ ] cancelOrder - 撤单

### 功能完善
- [ ] setLeverage - 设置杠杆
- [ ] getOpenOrders - 未成交订单
- [ ] getFuturesCandles - K线数据
- [ ] getOrder - 订单详情
- [ ] getFundingRate - 资金费率
- [ ] getContractInfo - 合约信息

### 辅助功能
- [ ] getAllContracts - 合约列表
- [ ] getOrderBook - 订单簿
- [ ] getMyTrades - 成交记录
- [ ] getPositionHistory - 历史持仓
- [ ] getSettlementHistory - 结算记录
- [ ] getOrderHistory - 历史订单

---

## 🎯 成功标准

当以下所有条件满足时，OKX 接入完成：

1. ✅ 所有 17 个方法都有实际实现（不再抛出"未实现"错误）
2. ✅ 通过单元测试（每个方法）
3. ✅ 通过集成测试（完整交易流程）
4. ✅ 测试网验证通过
5. ✅ 生产环境小额验证通过
6. ✅ TypeScript 编译无错误
7. ✅ 与 Gate 行为对比一致
8. ✅ 错误处理完善
9. ✅ 日志记录完整
10. ✅ 文档更新（README、配置说明）

---

## 📝 注意事项

1. **测试网优先**：所有开发都在测试网进行，验证无误后才上生产
2. **小步快跑**：每实现一个方法就测试，不要积累问题
3. **参考 Gate 实现**：遇到疑问时对照 `gateClient.ts`
4. **保持一致性**：返回格式、错误处理都要与 Gate 保持一致
5. **记录问题**：遇到 OKX API 的特殊行为要记录下来

---

## 🆘 遇到问题？

1. **API 返回格式不明确**：
   - 添加详细日志打印实际返回
   - 参考 OKX 官方示例代码
   - 查看社区讨论

2. **类型错误**：
   - 使用 `any` 类型先通过编译
   - 后续根据实际返回优化类型定义

3. **行为不一致**：
   - 对比 Gate 和 OKX 文档差异
   - 考虑是否需要额外转换逻辑

---

**Good Luck! 🚀**

实现过程中有任何问题，可以参考本文档和 `gateClient.ts` 的实现。

