# OKX API 问题修复总结

## 问题背景

根据错误日志分析，发现 OKX 客户端存在两个主要问题：

1. **quantoMultiplier 字段读取失败**：返回值为 0，导致合约乘数计算错误
2. **GET /api/v5/trade/order 接口调用失败**：缺少必需参数 `instId`

## 问题详情

### 问题 1：字段名不一致

**位置**：
- `src/services/okxClient.ts:810` (修复前)
- `src/utils/contractUtils.ts:74`

**原因**：
- OKX 客户端的 `getContractInfo` 方法返回的字段使用 `quanto_multiplier`（下划线命名）
- 但 `contractUtils.ts` 期望读取 `quantoMultiplier`（驼峰命名）
- 导致读取到 `undefined`，解析为 `0`

**修复**：
```typescript
// 修复前
return {
  name: contract,
  orderSizeMin: parseFloat(info.minSz || "1"),
  orderSizeMax: parseFloat(info.maxLmtSz || "1000000"),
  quanto_multiplier: parseFloat(info.ctVal || "0.01"), // ❌ 下划线命名
};

// 修复后
return {
  name: contract,
  orderSizeMin: parseFloat(info.minSz || "1"),
  orderSizeMax: parseFloat(info.maxLmtSz || "1000000"),
  quantoMultiplier: parseFloat(info.ctVal || "0.01"), // ✅ 驼峰命名
};
```

### 问题 2：缺少必需参数 instId

**位置**：`src/services/okxClient.ts:598` (修复前)

**原因**：
- 根据 OKX API 文档，`GET /api/v5/trade/order` 接口需要同时提供 `instId` 和 `ordId` 参数
- 原实现只传递了 `ordId` 参数
- 这导致 API 返回错误："Invalid quanto multiplier: 0"（实际上是缺少参数导致）

**附加问题**：
- `getOrder` 方法只接收 `orderId` 参数，无法获取 `instId`
- `cancelOrder` 方法需要调用 `getOrder` 来获取订单信息，形成循环依赖

**修复方案**：

1. **修改接口定义**（`src/services/exchangeClient.ts`）：
```typescript
// 修复前
getOrder(orderId: string): Promise<any>;

// 修复后
getOrder(orderId: string, contract?: string): Promise<any>;
```

2. **修改 OKX 实现**（`src/services/okxClient.ts`）：
```typescript
async getOrder(orderId: string, contract?: string): Promise<any> {
  // 如果提供了 contract，直接使用 instId + ordId 查询
  if (contract) {
    const instId = this.toOkxContract(contract);
    const data = await this.request("GET", "/api/v5/trade/order", {
      instId,
      ordId: orderId,
    });
    // ... 处理返回数据
  } else {
    // 如果没有提供 contract，从订单列表中查找
    // 1. 先查未完成订单
    const openOrders = await this.getOpenOrders();
    let order = openOrders.find((o: any) => o.id === orderId);
    
    // 2. 如果找不到，再查历史订单
    if (!order) {
      const historyOrders = await this.getOrderHistory(undefined, 100);
      order = historyOrders.find((o: any) => o.id === orderId);
    }
    
    if (!order) {
      throw new Error("Order not found");
    }
    
    return order;
  }
}
```

3. **修改 Gate 实现**（`src/services/gateClient.ts`）：
```typescript
// 添加可选参数以兼容新接口，但 Gate.io 不需要使用该参数
async getOrder(orderId: string, contract?: string) {
  // Gate.io API 不需要 contract 参数，忽略该参数
  const result = await this.futuresApi.getFuturesOrder(this.settle, orderId);
  return result.body;
}
```

## 修复的文件

1. ✅ `src/services/exchangeClient.ts` - 修改接口定义
2. ✅ `src/services/okxClient.ts` - 修复 quantoMultiplier 字段名 + 修改 getOrder 实现
3. ✅ `src/services/gateClient.ts` - 添加可选参数以兼容新接口

## 兼容性说明

### 向后兼容性

所有修改都是**向后兼容**的：

- `getOrder(orderId)` - 原有调用方式仍然有效，OKX 会自动从订单列表中查找
- `getOrder(orderId, contract)` - 新的调用方式，性能更好（直接查询，无需遍历）

### 调用方无需修改

现有代码中的所有 `getOrder` 调用都无需修改，因为 `contract` 参数是可选的：

```typescript
// 这些调用都能正常工作
await exchangeClient.getOrder(order.id);
await exchangeClient.getOrder(order.id, "BTC_USDT"); // 性能更好
```

## 性能影响

### OKX 客户端

**不带 contract 参数**：
- 需要调用 `getOpenOrders()` 或 `getOrderHistory()`
- 然后在内存中查找匹配的订单
- 适用于现有代码（无需修改）

**带 contract 参数**：
- 直接调用 OKX API 查询单个订单
- 性能最佳（推荐）
- 需要调用方提供 contract 参数

### Gate.io 客户端

无影响，contract 参数会被忽略。

## 验证方法

### 1. 验证 quantoMultiplier 字段

```typescript
const client = createExchangeClient();
const contractInfo = await client.getContractInfo("BTC_USDT");
console.log(contractInfo.quantoMultiplier); // 应该输出 0.0001 而不是 0
```

### 2. 验证 getOrder 方法（带 contract）

```typescript
const order = await client.getOrder(orderId, "BTC_USDT");
console.log(order); // 应该返回完整的订单信息
```

### 3. 验证 getOrder 方法（不带 contract）

```typescript
const order = await client.getOrder(orderId);
console.log(order); // 应该返回完整的订单信息
```

## 测试脚本

已创建测试脚本 `test_okx_fix.ts`，可以通过以下命令运行：

```bash
# 确保已配置 OKX API 密钥
npm run build
node dist/test_okx_fix.js
```

## 相关文档

- [OKX API v5 文档 - 获取订单信息](https://www.okx.com/docs-v5/zh/#order-book-trading-trade-get-order-details)
- [OKX API v5 文档 - 获取产品信息](https://www.okx.com/docs-v5/zh/#public-data-rest-api-get-instruments)

## 注意事项

1. **OKX API 字段命名**：OKX API v5 使用驼峰命名（如 `instId`, `ordId`, `ctVal`），需要与内部统一格式保持一致
2. **订单查询限制**：不带 contract 参数时，只能查询最近 100 条历史订单，如果订单过旧可能查不到
3. **性能建议**：在已知 contract 的场景下，建议提供 contract 参数以提升性能

## 解决的错误

✅ 修复了以下错误：
- "Invalid quanto multiplier: 0" - quantoMultiplier 字段现在能正确读取
- "Insufficient USDT margin in account" - 由于合约乘数错误导致的保证金计算错误
- "Invalid quanto multiplier: 0" - GET /api/v5/trade/order 现在能正确调用

## 后续建议

1. **性能优化**：在所有已知 contract 的场景下，更新代码使用 `getOrder(orderId, contract)` 调用方式
2. **缓存优化**：考虑缓存订单的 instId 映射关系，进一步提升性能
3. **监控告警**：添加 quantoMultiplier 为 0 的监控告警，及时发现类似问题

