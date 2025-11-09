# 交易策略配置指南

本文档详细说明 open-nof1.ai 系统支持的所有交易策略及其配置方法。

## 快速配置指南

### 如何修改策略配置？

1. **修改策略类型**：编辑 `.env` 文件，修改 `TRADING_STRATEGY` 参数
2. **修改执行周期**：编辑 `.env` 文件，修改 `TRADING_INTERVAL_MINUTES` 参数
3. **修改风控参数**：编辑 `.env` 文件，修改 `MAX_LEVERAGE`、`MAX_POSITIONS` 等参数
4. **修改策略核心参数**：编辑对应策略文件（如 `src/strategies/swingTrend.ts`）
5. **查看完整配置对照**：参考本文档末尾的"配置项与代码对照表"

### 配置文件位置速查

| 配置类型 | 文件位置 | 说明 |
|---------|---------|------|
| 环境变量配置 | `.env` | 策略选择、执行周期、风控参数 |
| 策略参数定义 | `src/strategies/*.ts` | 各策略的杠杆、仓位、止损等参数 |
| 风控参数 | `src/config/riskParams.ts` | 系统级风控参数 |
| 策略选择逻辑 | `src/strategies/index.ts` | 策略切换逻辑 |
| 交易循环 | `src/scheduler/tradingLoop.ts` | 自动监控、止损止盈实现 |
| AI决策提示词 | `src/agents/tradingAgent.ts` | AI交易决策逻辑 |

---

## 策略文件位置

所有策略实现文件位于 `src/strategies/` 目录下：

- `src/strategies/index.ts` - 策略模块统一导出
- `src/strategies/types.ts` - 策略类型定义
- `src/strategies/ultraShort.ts` - 超短线策略实现
- `src/strategies/swingTrend.ts` - 波段趋势策略实现
- `src/strategies/conservative.ts` - 稳健策略实现
- `src/strategies/balanced.ts` - 平衡策略实现
- `src/strategies/aggressive.ts` - 激进策略实现
- `src/strategies/rebateFarming.ts` - 返佣套利策略实现

## 策略概览

系统目前支持 **6 种交易策略**，适应不同的市场环境和风险偏好：

| 策略代码 | 策略名称 | 执行周期 | 持仓时长 | 风险等级 | 适合人群 |
|---------|---------|---------|---------|---------|---------|
| `ultra-short` | 超短线 | 5分钟 | 30分钟-2小时 | 中高 | 喜欢高频交易、快进快出的交易者 |
| `swing-trend` | **波段趋势** | **20分钟** | **数小时-3天** | **中低** | **追求中长期趋势、稳健成长的投资者** |
| `conservative` | 稳健 | 5-15分钟 | 数小时-24小时 | 低 | 保守投资者 |
| `balanced` | 平衡 | 5-15分钟 | 数小时-24小时 | 中 | 一般投资者 |
| `aggressive` | 激进 | 5-15分钟 | 数小时-24小时 | 高 | 激进投资者 |
| `rebate-farming` | **返佣套利** | **5分钟** | **10-60分钟** | **中** | **拥有高额手续费返佣的用户** |

## 策略详细说明

### 超短线策略 (`ultra-short`)

**核心理念**：快进快出，捕捉短期价格波动，严格执行锁利规则

#### 策略参数

> **配置文件位置**：`src/strategies/ultraShort.ts`

- **执行周期**：5分钟（配置位置：`.env` 文件 `TRADING_INTERVAL_MINUTES=5`）
- **建议持仓时长**：30分钟 - 2小时
- **杠杆范围**：3-5倍（根据MAX_LEVERAGE的50%-75%）
  - 代码：`leverageMin: Math.max(3, Math.ceil(maxLeverage * 0.5))`
  - 代码：`leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.75))`
- **仓位大小**：18-25%
  - 代码：`positionSizeMin: 18, positionSizeMax: 25`
- **止损范围**：-1.5% ~ -2.5%
  - 代码：`stopLoss: { low: -2.5, mid: -2, high: -1.5 }`

#### 风控规则（系统强制执行）

> **代码实现位置**：`src/agents/tradingAgent.ts` → AI提示词 + `src/scheduler/tradingLoop.ts`

1. **周期锁利规则**：每个5分钟周期内，盈利>2%且<4%时，立即平仓锁定利润
   - AI在每个周期会检查盈利情况并执行锁利
2. **30分钟规则**：持仓超过30分钟且盈利>手续费成本时，如未达移动止盈线，执行保守平仓
   - AI在提示词中包含此规则，自动判断执行
3. **移动止盈**：
   - 盈利≥+4% → 止损移至+1.5%
     - 代码：`trailingStop.level1: { trigger: 4, stopAt: 1.5 }`
   - 盈利≥+8% → 止损移至+4%
     - 代码：`trailingStop.level2: { trigger: 8, stopAt: 4 }`
   - 盈利≥+15% → 止损移至+8%
     - 代码：`trailingStop.level3: { trigger: 15, stopAt: 8 }`

#### 适用场景
- 市场波动剧烈，短期趋势明确
- 有充足时间监控系统运行
- 追求快速资金周转

#### 配置示例

> **配置文件位置**：`.env` 文件（参考 `.env.example`）

```bash
TRADING_STRATEGY=ultra-short
TRADING_INTERVAL_MINUTES=5
MAX_LEVERAGE=10
```

---

### 波段趋势策略 (`swing-trend`)

**核心理念**：短周期精准入场，耐心持仓，自动监控保护，让利润充分奔跑

#### 策略参数

> **配置文件位置**：`src/strategies/swingTrend.ts`

- **执行周期**：**20分钟**（配置位置：`.env` 文件 `TRADING_INTERVAL_MINUTES=20`）
- **建议持仓时长**：**数小时 - 3天**
- **杠杆范围**：**2-5倍**（根据信号强度灵活选择）
  - 代码：`leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.2))`
  - 代码：`leverageMax: Math.max(5, Math.ceil(maxLeverage * 0.5))`
- **仓位大小**：**20-35%**（根据信号强度：普通20-25%、良好25-30%、强30-35%）
  - 代码：`positionSizeMin: 20, positionSizeMax: 35`
- **止损范围**：**-5.5% ~ -9%**（根据杠杆：高杠杆-5.5%、中杠杆-7.5%、低杠杆-9%）
  - 代码：`stopLoss: { low: -9, mid: -7.5, high: -5.5 }`

#### 核心优势
1. **短周期精准入场**：使用1分钟、3分钟、5分钟、15分钟四个时间框架共振
2. **自动监控保护**：止损和止盈完全由自动监控系统执行（每10秒检查）
3. **AI专注开仓**：AI只负责寻找高质量开仓机会，不主动平仓
4. **更大仓位**：最高可达35%，提升盈利潜力
5. **追求趋势利润**：首次止盈目标+50%，最高可达+120%

#### 自动监控止损（每10秒自动检查）

> **代码实现位置**：`src/scheduler/tradingLoop.ts` → `stopLossMonitor()`

- **5-7倍杠杆**：亏损达到 -8% 时自动止损
- **8-12倍杠杆**：亏损达到 -6% 时自动止损
- **13倍以上杠杆**：亏损达到 -5% 时自动止损

#### 自动监控移动止盈（每10秒自动检查，5级规则）

> **代码实现位置**：`src/scheduler/tradingLoop.ts` → `stopLossMonitor()`

- **阶段1**：峰值盈利4-6%，回退1.5%自动平仓（保底2.5%）
- **阶段2**：峰值盈利6-10%，回退2%自动平仓（保底4%）
- **阶段3**：峰值盈利10-15%，回退2.5%自动平仓（保底7.5%）
- **阶段4**：峰值盈利15-25%，回退3%自动平仓（保底12%）
- **阶段5**：峰值盈利25%+，回退5%自动平仓（保底20%）

#### 入场条件（AI执行）
- **必须1分钟、3分钟、5分钟、15分钟这4个时间框架信号全部强烈一致**
- **关键指标共振（MACD、RSI、EMA方向一致）**
- **短周期精准捕捉，快速入场**
- **重视信号质量而非数量**

#### AI职责说明
- **只负责开仓**：分析市场，寻找高质量开仓机会
- **禁止主动平仓**：AI不会也不应该主动调用平仓操作
- **监控和报告**：分析持仓状态，在报告中说明风险和趋势健康度
- **信任自动监控**：所有平仓由自动监控系统自动处理

#### 适用场景
- **追求稳定收益，降低人为干预**
- **希望系统自动化保护利润**
- **能接受数小时到数天的持仓周期**
- **资金规模较大，重视风险控制**

#### 配置示例

> **配置文件位置**：`.env` 文件（参考 `.env.example`）

```bash
# 环境变量配置
TRADING_STRATEGY=swing-trend
TRADING_INTERVAL_MINUTES=20
MAX_LEVERAGE=10  # 策略实际使用2-5倍，留足安全边际
MAX_POSITIONS=3  # 减少同时持仓数量
INITIAL_BALANCE=2000
```

#### 预期收益
- **月目标收益**：20-35%
- **胜率目标**：35-45%
- **盈亏比目标**：≥2:1
- **夏普比率**：≥1.5

#### 与超短线策略对比

| 维度 | 超短线 (ultra-short) | 波段趋势 (swing-trend) |
|-----|---------------------|---------------------|
| 执行周期 | 5分钟 | **20分钟** |
| 杠杆倍数 | 3-5倍 | **2-5倍** |
| 仓位大小 | 18-25% | **20-35%** |
| 止损幅度 | -1.5%~-2.5% | **-5.5%~-9%** |
| 入场时间框架 | 多时间框架 | **1m/3m/5m/15m精准** |
| 持仓时长 | 30分钟-2小时 | **数小时-3天** |
| 平仓方式 | AI主动执行 | **自动监控执行** |
| AI职责 | 开仓+平仓 | **只负责开仓** |
| 风险等级 | 中高 | **中低** |
| 适合行情 | 短期波动 | **中期趋势** |

---

### 稳健策略 (`conservative`)

**核心理念**：保护本金优先，低风险低杠杆

> **配置文件位置**：`src/strategies/conservative.ts`

#### 策略参数
- **杠杆范围**：3-6倍（根据MAX_LEVERAGE的30%-60%）
  - 代码：`leverageMin: Math.max(1, Math.ceil(maxLeverage * 0.3))`
  - 代码：`leverageMax: Math.max(2, Math.ceil(maxLeverage * 0.6))`
  - 注：当MAX_LEVERAGE=10时，实际为3-6倍
- **仓位大小**：15-22%
  - 代码：`positionSizeMin: 15, positionSizeMax: 22`
- **止损范围**：-2.5% ~ -3.5%
  - 代码：`stopLoss: { low: -3.5, mid: -3, high: -2.5 }`

#### 移动止盈
- 盈利≥+6% → 止损移至+2%
  - 代码：`trailingStop.level1: { trigger: 6, stopAt: 2 }`
- 盈利≥+12% → 止损移至+6%
  - 代码：`trailingStop.level2: { trigger: 12, stopAt: 6 }`
- 盈利≥+20% → 止损移至+12%
  - 代码：`trailingStop.level3: { trigger: 20, stopAt: 12 }`

---

### 平衡策略 (`balanced`)

**核心理念**：风险收益平衡，适合大多数投资者

> **配置文件位置**：`src/strategies/balanced.ts`

#### 策略参数
- **杠杆范围**：6-9倍（根据MAX_LEVERAGE的60%-85%）
  - 代码：`leverageMin: Math.max(2, Math.ceil(maxLeverage * 0.6))`
  - 代码：`leverageMax: Math.max(3, Math.ceil(maxLeverage * 0.85))`
  - 注：当MAX_LEVERAGE=10时，实际为6-9倍
- **仓位大小**：20-27%
  - 代码：`positionSizeMin: 20, positionSizeMax: 27`
- **止损范围**：-2% ~ -3%
  - 代码：`stopLoss: { low: -3, mid: -2.5, high: -2 }`

#### 移动止盈
- 盈利≥+8% → 止损移至+3%
  - 代码：`trailingStop.level1: { trigger: 8, stopAt: 3 }`
- 盈利≥+15% → 止损移至+8%
  - 代码：`trailingStop.level2: { trigger: 15, stopAt: 8 }`
- 盈利≥+25% → 止损移至+15%
  - 代码：`trailingStop.level3: { trigger: 25, stopAt: 15 }`

---

### 激进策略 (`aggressive`)

**核心理念**：追求高收益，承担高风险

> **配置文件位置**：`src/strategies/aggressive.ts`

#### 策略参数
- **杠杆范围**：9-10倍（根据MAX_LEVERAGE的85%-100%）
  - 代码：`leverageMin: Math.max(3, Math.ceil(maxLeverage * 0.85))`
  - 代码：`leverageMax: maxLeverage`
  - 注：当MAX_LEVERAGE=10时，实际为9-10倍
- **仓位大小**：25-32%
  - 代码：`positionSizeMin: 25, positionSizeMax: 32`
- **止损范围**：-6% ~ -10%
  - 代码：`stopLoss: { low: -6, mid: -8, high: -10 }`
  - 说明：低杠杆-6%止损，中杠杆-8%止损，高杠杆-10%止损

#### 移动止盈
- 盈利≥+10% → 止损移至+4%
  - 代码：`trailingStop.level1: { trigger: 10, stopAt: 4 }`
- 盈利≥+18% → 止损移至+10%
  - 代码：`trailingStop.level2: { trigger: 18, stopAt: 10 }`
- 盈利≥+30% → 止损移至+18%
  - 代码：`trailingStop.level3: { trigger: 30, stopAt: 18 }`

---

### 返佣套利策略 (`rebate-farming`)

**核心理念**：高频微利交易，通过小额稳定盈利和高频交易累积手续费返佣

#### 策略特点

| 配置项 | 参数值 | 说明 |
|-------|--------|------|
| **执行周期** | 5 分钟 | 高频执行，快速捕捉短期价格波动 |
| **持仓时长** | 10-60 分钟 | 短期持仓，微利即走 |
| **杠杆范围** | 40%-60% 最大杠杆 | 如最大25倍，则使用10-15倍（中等杠杆） |
| **仓位范围** | 15-22% | 中小仓位，频繁交易 |
| **止损阈值** | -1.2% 至 -1.8% | 快速止损，不恋战 |
| **止盈策略** | 代码级自动止盈 | 盈利0.8%即触发移动止盈 |
| **风险等级** | 中等 | 单笔风险小，胜率高 |
| **适合人群** | 拥有高额手续费返佣的用户 | 返佣比例50-80% |

#### 盈利模式

```
总收益 = 交易盈利 + 手续费返佣

示例（按10倍杠杆计算）：
- 单笔盈利目标：0.5-1.5%
- 手续费成本：约0.2-0.3%（考虑杠杆）
- 手续费返佣：假设50-80%返佣
- 单笔净利润：0.5-1.5% + 0.1-0.24%返佣 = 0.6-1.74%

月度累积：
- 日均交易：10-30笔
- 月均交易：300-900笔
- 月度盈利：15-25%（交易盈利10-15% + 返佣5-10%）
```

#### 代码级止损配置

```typescript
stopLoss: {
  low: -1.8,   // 低杠杆(5-8倍)：亏损1.8%止损
  mid: -1.5,   // 中杠杆(9-12倍)：亏损1.5%止损
  high: -1.2,  // 高杠杆(13倍+)：亏损1.2%止损
}
```

#### 代码级移动止盈

**核心特点**：极快速锁利，微利即走

```typescript
trailingStop: {
  level1: { trigger: 0.8, stopAt: 0.3 },   // +0.8%触发，回落至+0.3%平仓（保护0.5%空间）
  level2: { trigger: 2, stopAt: 0.8 },     // +2%触发，回落至+0.8%平仓
  level3: { trigger: 4, stopAt: 2 },       // +4%触发，回落至+2%平仓（极少触发）
}
```

**说明**：
- 第一档触发点极低（0.8%），只要覆盖手续费+微利就走
- 不贪心，小确定性盈利优于大不确定性盈利
- 代码自动执行，AI不需要手动平仓

#### 入场规则（严格执行）

**必须同时满足**：
1. ✅ 至少1个长周期（30m或1h）趋势明确（涨或跌）
2. ✅ 至少2个短周期（3m、5m或15m）与长周期方向一致
3. ❌ 长周期震荡时，短周期信号再强也不开仓
4. ❌ 绝不做逆趋势交易

**信号强度评估**：
- 强信号：1长周期趋势 + 3短周期一致 → 15倍杠杆，20-22%仓位
- 良好信号：1长周期趋势 + 2短周期一致 → 12倍杠杆，17-20%仓位
- 普通信号：1长周期趋势 + 2短周期较弱 → 10倍杠杆，15-17%仓位

#### 风控规则

1. **严格止损**：代码自动执行，AI无需担心
2. **拒绝震荡**：长周期震荡时严禁开仓（最大风险）
3. **拒绝逆势**：绝不做逆趋势交易
4. **快速止损**：亏损不恋战，快速换下一个机会
5. **持仓时间**：单笔持仓超过30分钟需谨慎

#### 成功要诀

**✅ 正确做法**：
- 高频微利：单笔0.5-1.5%，单日10-30笔
- 顺势而为：只做顺趋势，拒绝震荡和逆势
- 微利即走：覆盖手续费+小盈利就满足
- 快速止损：保持高胜率
- 返佣收益：高频累积手续费返佣

**❌ 失败根源**：
- 震荡开仓：长周期震荡时频繁开仓 = 频繁止损
- 逆势交易：短期诱惑逆势开仓 = 大概率止损
- 过度贪心：微利不平仓，等待更高目标 = 利润回吐
- 恋战不止损：亏损不愿止损 = 扩大损失

#### 推荐配置

```bash
# .env 配置
TRADING_STRATEGY=rebate-farming
TRADING_INTERVAL_MINUTES=5      # 5分钟执行周期
MAX_LEVERAGE=25                  # 策略会使用10-15倍（40-60%）
MAX_POSITIONS=5                  # 最多5个持仓
```

#### 适用场景

**最适合的市场环境**：
- ✅ 单边趋势行情（涨或跌都可以）
- ✅ 短期波动但长期趋势明确
- ✅ 市场流动性好，滑点小

**不适合的市场环境**：
- ❌ 横盘震荡（长周期无明确趋势）
- ❌ 剧烈波动（止损频繁触发）
- ❌ 流动性差（滑点大，影响盈利）

#### 与超短线策略对比

| 对比项 | 返佣套利策略 | 超短线策略 |
|-------|------------|-----------|
| 执行周期 | 5分钟 | 5分钟 |
| 持仓时长 | 10-60分钟 | 30分钟-2小时 |
| 盈利目标 | 0.5-1.5%（微利） | 2-4%（小利） |
| 杠杆范围 | 10-15倍（中等） | 13-19倍（中高） |
| 止盈触发 | 0.8%（极快） | 4%（较快） |
| 交易频率 | 10-30笔/日（高频） | 10-20笔/日（高频） |
| 止盈方式 | 代码级自动 | AI主动 |
| 收益来源 | 交易盈利 + 返佣 | 交易盈利 |
| 适合人群 | 有高额返佣用户 | 高频交易爱好者 |

#### 策略代码位置

- 参数配置：`src/strategies/rebateFarming.ts` → `getRebateFarmingStrategy()`
- 提示词生成：`src/strategies/rebateFarming.ts` → `generateRebateFarmingPrompt()`
- 代码止损：`src/scheduler/stopLossMonitor.ts`
- 代码止盈：`src/scheduler/trailingStopMonitor.ts`

---

## 策略切换指南

### 波段趋势策略使用场景

**适合场景**：
- 希望系统自动化执行止损止盈，减少人为干预
- 追求更稳定的自动化交易体验
- 能接受数小时到数天的持仓周期
- 资金规模较大，重视风险控制
- 希望AI专注于开仓决策，不操心平仓

**不适合场景**：
- 市场处于震荡盘整，无明确趋势
- 你需要完全手动控制平仓时机
- 你无法接受数天的持仓周期

### 超短线策略使用场景

**适合场景**：
- 市场波动频繁，短期趋势明确
- 你有充足时间监控系统
- 你喜欢快进快出的交易节奏
- 资金规模较小，需要快速积累

### 返佣套利策略使用场景

**适合场景**：
- ✅ 你拥有高额手续费返佣（50-80%）
- ✅ 追求高频交易，通过频次累积收益
- ✅ 能接受短期持仓（10-60分钟）
- ✅ 希望系统自动化止损止盈（代码级控制）
- ✅ 市场有明确趋势（涨或跌都可以）
- ✅ 不贪心，满足微利即走（0.5-1.5%）

**不适合场景**：
- ❌ 没有手续费返佣或返佣比例很低
- ❌ 市场处于横盘震荡，无明确趋势
- ❌ 追求单笔大盈利，不满足小利
- ❌ 无法接受高频交易（日均10-30笔）
- ❌ 市场流动性差，滑点大

**与超短线策略的选择**：
- 有高额返佣 → 选择返佣套利策略（更高频，更小目标）
- 无返佣或低返佣 → 选择超短线策略（频率稍低，盈利目标更高）

### 策略切换步骤

> **配置文件位置**：`.env` 文件（参考 `.env.example`）

1. **平仓所有持仓**（避免策略冲突）
2. **修改环境变量**：
   ```bash
   # 切换到波段趋势策略
   TRADING_STRATEGY=swing-trend
   TRADING_INTERVAL_MINUTES=20
   
   # 或切换到超短线策略
   TRADING_STRATEGY=ultra-short
   TRADING_INTERVAL_MINUTES=5
   
   # 或切换到返佣套利策略
   TRADING_STRATEGY=rebate-farming
   TRADING_INTERVAL_MINUTES=5
   ```
3. **重启系统**：
   ```bash
   docker-compose down
   docker-compose up -d
   ```

---

## 风控对比

### 系统硬性底线（所有策略共同）

> **配置文件位置**：
> - 代码实现：`src/config/riskParams.ts`
> - 环境变量：`.env` 文件

- **极端止损**：单笔亏损≤-30%强制平仓（防止爆仓）
  - 环境变量：`EXTREME_STOP_LOSS_PERCENT=-30`
  - 代码：`RISK_PARAMS.EXTREME_STOP_LOSS_PERCENT`
- **36小时限制**：任何持仓超过36小时强制平仓（释放资金）
  - 环境变量：`MAX_HOLDING_HOURS=36`
  - 代码：`RISK_PARAMS.MAX_HOLDING_HOURS`
- **账户回撤保护**：账户总回撤达到预设阈值时触发保护
  - 警告阈值：`ACCOUNT_DRAWDOWN_WARNING_PERCENT=20`
  - 禁止开仓：`ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT=30`
  - 强制平仓：`ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT=50`

### 策略专属风控

| 策略 | 专属风控规则 | 特点 |
|-----|-------------|-----|
| ultra-short | 2%周期锁利、30分钟盈利平仓 | 系统**强制执行** |
| swing-trend | 自动监控止损（每10秒）、自动监控移动止盈（每10秒，5级规则） | 系统**自动执行**，AI不干预 |
| conservative/balanced/aggressive | 无专属规则 | AI全权决策 |

---

## 最佳实践建议

### 波段趋势策略最佳实践

1. **耐心等待信号**
   - 等待1m/3m/5m/15m这4个时间框架全部共振
   - 确保MACD、RSI、EMA方向一致
   - 不要急于开仓，质量优于数量

2. **信任自动监控**
   - 自动监控系统每10秒检查一次
   - 止损和止盈会自动执行，无需AI干预
   - AI专注于寻找高质量开仓机会

3. **合理使用仓位**
   - 普通信号：20-25%仓位
   - 良好信号：25-30%仓位
   - 强信号：30-35%仓位（谨慎使用）

4. **合理使用杠杆**
   - 普通信号：2倍杠杆（最安全）
   - 良好信号：3倍杠杆（平衡）
   - 强信号：5倍杠杆（最大值，谨慎使用）

5. **控制同时持仓数**
   - 建议：1-3个持仓（`MAX_POSITIONS=3`）
   - 避免过度分散，保持资金集中度

6. **理解自动化保护**
   - 止损：触及止损线立即自动平仓
   - 止盈：峰值回撤达标立即自动平仓
   - AI只需要在报告中说明持仓状态即可

### 超短线策略最佳实践

1. **快进快出**
   - 盈利>2%立即考虑锁利
   - 不要贪婪，小利润也是利润

2. **严格遵守规则**
   - 系统的2%锁利和30分钟规则是经验总结
   - 不要试图手动干预

3. **高频监控**
   - 5分钟周期需要更频繁的监控
   - 确保系统稳定运行

---

## 配置示例

> **配置文件位置**：
> - 主配置：`.env` 文件（参考 `.env.example` 模板）
> - 策略实现：`src/strategies/` 目录
> - 风控参数：`src/config/riskParams.ts`

### 测试环境配置 - 波段趋势策略示例

**⚠️ 强烈建议使用测试网进行策略测试，避免真实资金损失**

```bash
# .env 文件配置

# ============================================
# 服务器配置
# ============================================
PORT=3100

# ============================================
# 交易配置
# ============================================
# 策略配置
TRADING_STRATEGY=swing-trend           # 使用波段趋势策略
TRADING_INTERVAL_MINUTES=20            # 20分钟执行周期

# 风控配置
MAX_LEVERAGE=25                        # 最大杠杆25倍（策略实际使用2-5倍）
MAX_POSITIONS=5                        # 最多5个持仓
MAX_HOLDING_HOURS=36                   # 最大持仓36小时
EXTREME_STOP_LOSS_PERCENT=-30          # 极端止损-30%
INITIAL_BALANCE=1000                   # 初始资金1000 USDT

# 账户风控
ACCOUNT_STOP_LOSS_USDT=50              # 账户止损线
ACCOUNT_TAKE_PROFIT_USDT=20000         # 账户止盈线
SYNC_CONFIG_ON_STARTUP=true            # 启动时同步配置

# ============================================
# 数据库配置
# ============================================
DATABASE_URL=file:./.voltagent/trading.db

# ============================================
# Gate.io API 配置
# ============================================
GATE_API_KEY=your_api_key_here
GATE_API_SECRET=your_api_secret_here
GATE_USE_TESTNET=true                  # 使用测试网（推荐）

# ============================================
# AI 模型配置
# ============================================
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL_NAME=deepseek/deepseek-v3.2-exp

# ============================================
# 账户回撤风控配置
# ============================================
ACCOUNT_DRAWDOWN_WARNING_PERCENT=20          # 警告阈值
ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT=30  # 禁止开仓阈值
ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT=50      # 强制平仓阈值

# ============================================
# 账户记录配置
# ============================================
ACCOUNT_RECORD_INTERVAL_MINUTES=1            # 账户记录间隔
```

### 测试环境配置 - 超短线策略示例

**⚠️ 强烈建议使用测试网进行策略测试，避免真实资金损失**

```bash
# .env 文件配置

# ============================================
# 交易配置
# ============================================
TRADING_STRATEGY=ultra-short           # 使用超短线策略
TRADING_INTERVAL_MINUTES=5             # 5分钟执行周期

# 风控配置
MAX_LEVERAGE=25
MAX_POSITIONS=5                        # 超短线可以持仓更多
MAX_HOLDING_HOURS=36
INITIAL_BALANCE=1000                   # 测试环境小资金

# Gate.io API 配置
GATE_USE_TESTNET=true                  # 使用测试网（推荐）

# 其他配置参照波段策略示例
```

---

## 常见问题

### Q1: 波段策略的AI为什么不主动平仓？
**A**: 为了实现更稳定和一致的风控执行。自动监控系统每10秒检查一次，触发条件立即平仓，比AI的20分钟执行周期更及时。AI专注于寻找高质量开仓机会，平仓交给自动监控系统处理，实现职责分离，效率更高。

### Q2: 自动监控会不会过早平仓？
**A**: 自动监控使用5级移动止盈规则，会根据盈利峰值动态调整。例如峰值10%时回退2.5%才平仓，既保护了利润（保底7.5%），又给趋势足够空间。这个平衡经过精心设计。

### Q3: 为什么波段策略使用1m/3m/5m/15m短周期？
**A**: 虽然叫"波段"，但入场时机需要精准。短周期组合（1-15分钟）能更快捕捉趋势形成的早期信号，避免使用4小时等长周期导致的滞后。持仓时间依然可达数天，让利润充分奔跑。

### Q4: 仓位20-35%会不会太大？
**A**: 这取决于信号强度。强信号（4个时间框架完美共振+技术指标极度一致）才使用30-35%，普通信号只用20-25%。配合2-5倍低杠杆和严格的自动监控止损，风险是可控的。

### Q5: 可以同时运行多个策略吗？
**A**: 不建议。每个策略有不同的风控规则和执行逻辑，同时运行可能导致冲突。建议根据市场状况选择一个策略专注执行。

### Q6: 如何评估策略效果？
**A**: 关注这些指标：
- **胜率**：盈利交易占比（波段策略目标35-45%）
- **盈亏比**：平均盈利/平均亏损（目标≥2:1）
- **月收益率**：月度总收益（波段策略目标20-35%）
- **夏普比率**：风险调整后收益（目标≥1.5）
- **最大回撤**：峰值到低谷的最大跌幅（控制在20%以内）
- **止损及时性**：自动监控的反应速度（10秒检查）

---

## 技术支持

如有问题或建议，请通过以下方式联系：

- **GitHub Issues**: [https://github.com/195440/open-nof1.ai/issues](https://github.com/195440/open-nof1.ai/issues)
- **讨论区**: [https://github.com/195440/open-nof1.ai/discussions](https://github.com/195440/open-nof1.ai/discussions)

---

## 技术实现

> **核心文件位置**：
> - 策略模块：`src/strategies/` 目录
> - 策略统一导出：`src/strategies/index.ts`
> - 策略类型定义：`src/strategies/types.ts`
> - 交易代理：`src/agents/tradingAgent.ts`
> - 风控参数：`src/config/riskParams.ts`
> - 交易循环：`src/scheduler/tradingLoop.ts`

所有策略的实现遵循统一的架构模式：

1. **策略参数定义**：每个策略在对应的 `.ts` 文件中定义了完整的参数配置，包括杠杆范围、仓位大小、止损范围等
   - 超短线：`src/strategies/ultraShort.ts` → `getUltraShortStrategy()`
   - 波段趋势：`src/strategies/swingTrend.ts` → `getSwingTrendStrategy()`
   - 稳健策略：`src/strategies/conservative.ts` → `getConservativeStrategy()`
   - 平衡策略：`src/strategies/balanced.ts` → `getBalancedStrategy()`
   - 激进策略：`src/strategies/aggressive.ts` → `getAggressiveStrategy()`
   - 返佣套利：`src/strategies/rebateFarming.ts` → `getRebateFarmingStrategy()`

2. **提示词生成**：每个策略文件包含 `generateXxxPrompt()` 函数，为 AI 生成特定于该策略的决策提示词
   - 超短线：`generateUltraShortPrompt()`
   - 波段趋势：`generateSwingTrendPrompt()`
   - 稳健策略：`generateConservativePrompt()`
   - 平衡策略：`generateBalancedPrompt()`
   - 激进策略：`generateAggressivePrompt()`
   - 返佣套利：`generateRebateFarmingPrompt()`

3. **统一导出**：通过 `src/strategies/index.ts` 统一导出所有策略，方便系统调用

### 策略选择逻辑

> **实现文件**：`src/strategies/index.ts`

系统根据环境变量 `TRADING_STRATEGY` 动态加载对应策略：

```typescript
// 在 src/strategies/index.ts 中
export function getStrategyParams(strategy: TradingStrategy, maxLeverage: number): StrategyParams {
  switch (strategy) {
    case "ultra-short":
      return getUltraShortStrategy(maxLeverage);
    case "swing-trend":
      return getSwingTrendStrategy(maxLeverage);
    case "conservative":
      return getConservativeStrategy(maxLeverage);
    case "balanced":
      return getBalancedStrategy(maxLeverage);
    case "aggressive":
      return getAggressiveStrategy(maxLeverage);
    case "rebate-farming":
      return getRebateFarmingStrategy(maxLeverage);
    default:
      return getBalancedStrategy(maxLeverage);
  }
}
```

### 配置项与代码对照表

| 配置项 | 环境变量 | 代码位置 | 说明 |
|-------|---------|---------|------|
| 交易策略 | `TRADING_STRATEGY` | `src/strategies/index.ts` | 策略选择逻辑 |
| 执行周期 | `TRADING_INTERVAL_MINUTES` | `src/scheduler/tradingLoop.ts` | 交易循环间隔 |
| 最大杠杆 | `MAX_LEVERAGE` | `.env` → 各策略文件 | 策略基准值 |
| 最大持仓数 | `MAX_POSITIONS` | `src/config/riskParams.ts` | 风控参数 |
| 最大持仓时长 | `MAX_HOLDING_HOURS` | `src/config/riskParams.ts` | 风控参数 |
| 极端止损 | `EXTREME_STOP_LOSS_PERCENT` | `src/config/riskParams.ts` | 风控参数 |
| 初始资金 | `INITIAL_BALANCE` | `src/config/riskParams.ts` | 资金管理 |
| 账户回撤警告 | `ACCOUNT_DRAWDOWN_WARNING_PERCENT` | `src/config/riskParams.ts` | 风控参数 |
| 账户回撤禁止开仓 | `ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT` | `src/config/riskParams.ts` | 风控参数 |
| 账户回撤强制平仓 | `ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT` | `src/config/riskParams.ts` | 风控参数 |

## 版本历史

### v2.2 - 2025年11月9日
- 为所有策略参数标注配置文件位置和代码位置
- 添加配置项与代码对照表，方便快速定位配置
- 完善技术实现章节，详细说明各文件的作用
- 标注环境变量配置位置（`.env` 文件）

### v2.1 - 2025年11月8日
- 优化项目结构：将策略实现统一放置在 `src/strategies/` 目录
- 完善所有 README 文档，添加策略文件链接
- 更新策略配置指南，增加技术实现说明

### v2.0 - 2025年11月4日
- 波段策略仓位调整：12-20% → 20-35%
- 波段策略时间框架优化：15m-4h → 1m/3m/5m/15m精准捕捉
- 波段策略止损微调：-5%~-8% → -5.5%~-9%
- AI职责调整：AI只负责开仓，平仓由自动监控系统执行
- 术语优化："代码级"改为"自动监控"

### v1.0 - 2025年11月3日
- 初始版本发布

---

## 免责声明

**⚠️ 重要风险提示**

1. **投资风险**：加密货币交易具有极高风险，可能导致部分或全部本金损失。
2. **策略风险**：本文档描述的所有交易策略均为技术实现说明，不构成任何投资建议或收益承诺。
3. **测试建议**：强烈建议使用测试网（GATE_USE_TESTNET=true）进行充分测试后，再考虑是否使用真实资金。
4. **自负盈亏**：使用本系统进行交易的所有盈亏由使用者自行承担，开发者不承担任何责任。
5. **无保证声明**：本系统按"原样"提供，不提供任何明示或暗示的保证，包括但不限于适销性、特定用途适用性的保证。
6. **合规责任**：使用者需自行确保遵守所在地区的法律法规，开发者不对任何违法使用承担责任。

**请在充分理解风险并能承受可能的损失的前提下使用本系统。**

---

## 版权声明

Copyright (C) 2025 195440

本文档遵循 GNU Affero General Public License v3.0 协议。
