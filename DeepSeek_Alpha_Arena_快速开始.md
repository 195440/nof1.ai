# DeepSeek Alpha Arena 策略 - 快速开始指南

## 📋 概述

DeepSeek Alpha Arena 策略已成功实现！这是对 Alpha Arena (nof1.ai) 的完整复刻，使用 DeepSeek 模型进行完全自主的交易决策。

### 核心特点

✅ **完全复刻 Alpha Arena 设计理念**
- 零策略指导，只提供原始市场数据
- AI 完全自主决策
- 强制自我复盘机制
- 双重防护机制（代码自动 + AI 主动）

✅ **已实现的文件**
- ✅ `/src/strategies/deepseekAlphaArena.ts` - 策略实现
- ✅ `/src/strategies/types.ts` - 类型定义（已更新）
- ✅ `/src/strategies/index.ts` - 策略导出（已更新）
- ✅ `/src/agents/tradingAgent.ts` - Agent 支持（已更新）

---

## 🚀 快速开始

### 步骤 1: 配置环境变量

在项目根目录编辑 `.env` 文件，添加以下配置：

```bash
# ==================== DeepSeek Alpha Arena 策略配置 ====================

# 策略选择
TRADING_STRATEGY=deepseek-alpha

# 交易周期（建议 5-10 分钟）
TRADING_INTERVAL_MINUTES=5

# 初始资金（对标 Alpha Arena 的 $10,000）
INITIAL_BALANCE=10000

# DeepSeek API 配置（方案 1: 直接使用 DeepSeek API，推荐）
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL_NAME=deepseek-chat
OPENAI_API_KEY=your_deepseek_api_key_here

# 或使用 OpenRouter（方案 2: 备选）
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# AI_MODEL_NAME=deepseek/deepseek-v3.2-exp
# OPENAI_API_KEY=your_openrouter_api_key_here

# 交易所配置（建议先用测试网）
EXCHANGE=gate
GATE_USE_TESTNET=true
GATE_API_KEY=your_gate_testnet_api_key
GATE_API_SECRET=your_gate_testnet_api_secret

# 风控参数（对标 Alpha Arena）
MAX_LEVERAGE=25
MAX_POSITIONS=5
MAX_HOLDING_HOURS=36
EXTREME_STOP_LOSS_PERCENT=-30
```

### 步骤 2: 获取 API 密钥

#### DeepSeek API（推荐）
1. 访问 https://platform.deepseek.com
2. 注册账号并登录
3. 在 "API Keys" 页面创建新密钥
4. 复制密钥到 `.env` 的 `OPENAI_API_KEY`

**优势**：
- 性价比超高（约为 GPT-4 的 1/10）
- 推理能力强（接近 GPT-4 水平）
- 响应速度快

#### Gate.io 测试网
1. 访问 https://testnet.gate.com
2. 注册测试网账号
3. 在 "API 管理" 创建 API 密钥
4. 复制到 `.env` 的 `GATE_API_KEY` 和 `GATE_API_SECRET`

**优势**：
- 虚拟资金，零风险
- 完全模拟真实交易环境

### 步骤 3: 初始化数据库

```bash
npm run db:init
```

### 步骤 4: 启动交易系统

```bash
# 开发模式（热重载）
npm run dev

# 或生产模式
npm run trading:start
```

### 步骤 5: 访问监控界面

打开浏览器访问：
```
http://localhost:3100
```

你将看到：
- 账户状态
- 持仓信息
- 交易历史
- **AI 推理追踪**（DeepSeek 的每次决策过程）

---

## 📊 监控与分析

### 实时监控

在 Web 界面上可以看到：

1. **账户指标**
   - 总资产
   - 可用余额
   - 未实现盈亏
   - 收益率
   - 夏普比率

2. **持仓概览**
   - 当前持仓列表
   - 每个持仓的盈亏
   - 持仓时间
   - 杠杆倍数

3. **AI 决策记录**
   - 自我复盘内容
   - 市场分析过程
   - 交易决策理由
   - 置信度评分

### 查看日志

```bash
# 实时日志
npm run trading:start

# PM2 日志
npm run pm2:logs

# 或直接查看日志文件
tail -f logs/pm2-out.log
```

---

## 🧪 测试建议

### 测试网测试（强烈推荐）

**建议测试时长**：至少 7 天

**测试目标**：
- ✅ 验证策略能正常运行
- ✅ 观察 DeepSeek 的交易行为
- ✅ 记录所有推理追踪
- ✅ 验证双重防护机制
- ✅ 分析行为模式

**观察重点**：

1. **多空倾向**
   - DeepSeek 是否偏好做多还是做空？
   - 多空比例如何？

2. **持仓时长**
   - 平均持仓时间
   - 最长/最短持仓

3. **交易频率**
   - 每天交易次数
   - 空仓时间占比

4. **风险姿态**
   - 平均杠杆倍数
   - 平均仓位大小

5. **自我复盘**
   - DeepSeek 是否真的在复盘？
   - 是否从错误中学习？

6. **止损止盈习惯**
   - 主动止损 vs 自动止损
   - 止损距离统计

---

## 📈 行为分析

### 数据收集

运行期间，系统会自动记录：
- 每次 AI 推理过程
- 所有交易决策
- 市场数据快照
- 执行结果

### 分析脚本（待实现）

```bash
# 分析 DeepSeek 的交易行为
npm run analyze:deepseek-behavior

# 生成行为报告
npm run report:deepseek
```

### 对比 Alpha Arena

可以将 DeepSeek 的表现与 Alpha Arena 的其他模型对比：

| 指标 | DeepSeek | GPT-5 | Claude 4.5 | Grok 4 |
|------|----------|-------|------------|--------|
| 多空倾向 | ? | 做空频繁 | 几乎不做空 | 做空频繁 |
| 平均持仓时长 | ? | 中等 | 中等 | 最长 |
| 交易频率 | ? | 中等 | 中等 | 最不活跃 |
| 平均仓位大小 | ? | 小 | 中等 | 中等 |

---

## 🔧 故障排查

### 常见问题

#### 1. 策略未识别

**错误**：`未知的交易策略: deepseek-alpha`

**解决方案**：
- 确认 `.env` 中 `TRADING_STRATEGY=deepseek-alpha`
- 重启服务：`npm run trading:restart`

#### 2. DeepSeek API 错误

**错误**：`OpenAI API error` 或连接失败

**解决方案**：
- 验证 `OPENAI_API_KEY` 是否正确
- 确认 `OPENAI_BASE_URL=https://api.deepseek.com/v1`
- 检查 API 密钥是否有足够额度
- 测试 API 连接：
  ```bash
  curl https://api.deepseek.com/v1/models \
    -H "Authorization: Bearer $OPENAI_API_KEY"
  ```

#### 3. 没有看到自我复盘

**问题**：DeepSeek 没有输出复盘内容

**可能原因**：
- 提示词可能需要调整
- DeepSeek 可能跳过了复盘步骤

**解决方案**：
- 查看完整的 AI 输出日志
- 在提示词中更明确地要求复盘

#### 4. 交易执行失败

**错误**：交易下单失败

**解决方案**：
- 检查 Gate.io API 凭证
- 确认合约账户有足够余额
- 检查交易所 API 状态

---

## 🎯 下一步计划

### 短期（1-2周）

- [x] ✅ 策略代码实现
- [x] ✅ 提示词设计
- [ ] 🔄 测试网稳定运行
- [ ] 🔄 收集初步数据
- [ ] 🔄 验证自我复盘机制

### 中期（1个月）

- [ ] 📊 完整行为分析
- [ ] 📈 生成分析报告
- [ ] 🔍 识别优势和缺陷
- [ ] 🛠️ 提示词优化

### 长期（3个月）

- [ ] 📝 发布研究报告
- [ ] 🌐 开源数据分享
- [ ] 🚀 Season 2 规划

---

## 📚 相关文档

- **完整设计方案**：`DeepSeek_Alpha_Arena_完整设计方案.md`
- **Alpha Arena 分析**：`Alpha_Arena_技术分析.md`
- **策略文档**：`docs/TRADING_STRATEGIES_ZH.md`
- **主文档**：`README_ZH.md`

---

## 🤝 参与贡献

### 反馈渠道

- GitHub Issues
- Telegram 群：https://t.me/+E7av1nVEk5E1ZjY9

### 贡献方向

- 提示词优化
- 行为分析工具
- 数据可视化
- 文档完善

---

## ⚠️ 重要提醒

### 风险声明

- ⚠️ 加密货币交易具有高风险
- ⚠️ 务必先在测试网充分测试
- ⚠️ 仅投资您能承受损失的资金
- ⚠️ AI 决策不保证盈利

### 测试优先

1. ✅ **必须先在测试网运行至少 7 天**
2. ✅ 收集完整的行为数据
3. ✅ 验证策略稳定性
4. ✅ 分析风险和收益
5. ❌ 不要直接在正式网运行

---

## 🎉 开始你的 Alpha Arena 之旅！

现在一切准备就绪，开始运行 DeepSeek Alpha Arena 策略吧！

```bash
# 1. 配置 .env 文件
nano .env

# 2. 初始化数据库
npm run db:init

# 3. 启动交易系统
npm run dev

# 4. 访问监控界面
open http://localhost:3100
```

祝你测试顺利！🚀

---

**文档版本**: v1.0  
**创建日期**: 2025-11-15  
**状态**: 已实现，待测试  

