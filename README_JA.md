# open-nof1.ai

> 📖 **完全なドキュメント** | これは完全な日本語ドキュメントです。クイックスタートについては、[メインREADME](./README.md)をご覧ください。

<div align="center">

[![VoltAgent](https://img.shields.io/badge/Framework-VoltAgent-purple.svg)](https://voltagent.dev)
[![OpenAI Compatible](https://img.shields.io/badge/AI-OpenAI_Compatible-orange.svg)](https://openrouter.ai)
[![Gate.io](https://img.shields.io/badge/Exchange-Gate.io-00D4AA.svg)](https://www.gatesite.org/signup/NOFIAIOO?ref_type=103)
[![OKX](https://img.shields.io/badge/Exchange-OKX-000000.svg)](https://www.okx.com/zh-hans/join/nofiaioo)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js%2020+-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)

| [English](./README_EN.md) | [简体中文](./README_ZH.md) | [日本語](./README_JA.md) |
|:---:|:---:|:---:|

</div>

## システム概要

open-nof1.ai は、大規模言語モデルの知能と量的取引実践を深く統合した AI 駆動の暗号通貨自動取引システムです。システムは Agent フレームワーク上に構築され、AI に完全な市場分析と取引意思決定の自律権を与えることで、真の知的取引を実現します。

本システムは**最小限の人的介入**という設計思想を採用し、従来のハードコードされた取引ルールを廃止し、AI モデルが生の市場データに基づいて自律的に学習し意思決定できるようにします。システムは Gate.io 取引所（テストネットと本番ネットの両方をサポート）と統合し、BTC、ETH、SOL などの主要な暗号通貨をカバーする完全なパーペチュアル（永久）契約取引機能を提供し、データ収集、インテリジェント分析、リスク管理から取引実行までの全プロセスの自動化をサポートします。

![open-nof1.ai](./public/image.png)

## 目次

- [システム概要](#システム概要)
- [システムアーキテクチャ](#システムアーキテクチャ)
- [コア機能](#コア機能)
- [クイックスタート](#クイックスタート)
- [プロジェクト構造](#プロジェクト構造)
- [設定説明](#設定説明)
- [コマンドリファレンス](#コマンドリファレンス)
- [本番デプロイ](#本番デプロイ)
- [トラブルシューティング](#トラブルシューティング)
- [開発ガイド](#開発ガイド)
- [API ドキュメント](#api-ドキュメント)
- [貢献](#貢献)
- [オープンソースライセンス](#オープンソースライセンス)

## システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                   Trading Agent (AI)                    │
│              (DeepSeek V3.2 / Gork4 / Claude)           │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ├─── Market Data Analysis
                  ├─── Position Management
                  └─── Trade Execution Decisions
                  
┌─────────────────┴───────────────────────────────────────┐
│                    VoltAgent Core                       │
│              (Agent Orchestration & Tool Routing)       │
└─────────┬───────────────────────────────────┬───────────┘
          │                                   │
┌─────────┴──────────┐            ┌───────────┴───────────┐
│    Trading Tools   │            │   Gate.io API Client  │
│                    │            │                       │
│ - Market Data      │◄───────────┤ - Order Management    │
│ - Account Info     │            │ - Position Query      │
│ - Trade Execution  │            │ - Market Data Stream  │
└─────────┬──────────┘            └───────────────────────┘
          │
┌─────────┴──────────┐
│   LibSQL Database  │
│                    │
│ - Account History  │
│ - Trade Signals    │
│ - Agent Decisions  │
└────────────────────┘
```

### 技術スタック

| コンポーネント | 技術 | 用途 |
|---------------|------|------|
| フレームワーク | [VoltAgent](https://voltagent.dev) | AI Agent オーケストレーションと管理 |
| AI プロバイダー | OpenAI 互換 API | OpenRouter、OpenAI、DeepSeek などの互換プロバイダーをサポート |
| 取引所 | [Gate.io](https://www.gatesite.org/signup/NOFIAIOO?ref_type=103) / [OKX](https://www.okx.com/zh-hans/join/nofiaioo) | 暗号通貨取引(テストネット & 本番ネット) |
| データベース | LibSQL (SQLite) | ローカルデータ永続化 |
| Web サーバー | Hono | 高性能 HTTP フレームワーク |
| 開発言語 | TypeScript | 型安全な開発 |
| ランタイム | Node.js 20+ | JavaScript 実行環境 |

### コア設計思想

- **データ駆動**: AI に生の市場データを提供し、前処理や主観的判断を加えない
- **自律的意思決定**: AI は完全な分析と取引意思決定権限を持ち、ハードコードされた戦略制限なし
- **多次元分析**: 複数の時間枠データ(5分、15分、1時間、4時間)を集約して包括的な市場ビューを提供
- **透明性と追跡可能性**: すべての意思決定プロセスを完全に記録し、バックテスト分析と戦略最適化を容易にする
- **継続学習**: システムは自動的に取引経験を蓄積し、意思決定モデルを継続的に最適化

## コア機能

### AI 駆動意思決定

- **モデルサポート**: DeepSeek V3.2、Grok4、Claude 4.5、Gemini Pro 2.5
- **データ入力**: リアルタイム価格、出来高、ローソク足パターン、テクニカル指標
- **自律分析**: 事前設定された取引シグナルなし
- **マルチタイムフレーム**: 複数の時間窓にわたるデータの集約
- **リスク管理**: AI 制御のポジションサイズとレバレッジ管理

### 完全な取引機能

- **サポート資産**: BTC、ETH、SOL、BNB、XRP、DOGE、GT、TRUMP、ADA、WLFI
- **契約タイプ**: USDT 決済パーペチュアル契約
- **レバレッジ範囲**: 1倍から10倍(設定可能)
- **注文タイプ**: 成行注文、損切り、利確
- **ポジション方向**: ロングとショート
- **リアルタイム実行**: Gate.io API によるサブ秒級注文

### リアルタイム監視インターフェース

- **Web ダッシュボード**: アクセスアドレス `http://localhost:3100`
- **アカウント指標**: 残高、純資産、未実現損益
- **ポジション概要**: 現在のポジション、エントリー価格、レバレッジ倍率
- **取引履歴**: 完全な取引記録とタイムスタンプ
- **AI 意思決定ログ**: モデル推論プロセスの透明な表示
- **テクニカル指標**: 市場データとシグナルの可視化

### リスク管理システム

- **自動損切り**: 設定可能なパーセンテージベースの損切り
- **利確注文**: 自動的な利益実現
- **ポジション制限**: 資産ごとの最大エクスポージャー
- **レバレッジ制御**: 設定可能な最大レバレッジ
- **取引スロットリング**: 取引間の最小間隔
- **監査追跡**: すべてのアクションの完全なデータベースログ記録

### 本番環境準備済みデプロイ

- **テストネットサポート**: リスクフリーな戦略検証
- **プロセス管理**: PM2 統合による信頼性の確保
- **コンテナ化**: Docker サポートによる分離デプロイ
- **自動回復**: 失敗時の自動再起動
- **ログ記録**: 包括的なエラーと情報ログ
- **ヘルスモニタリング**: 組み込みヘルスチェックエンドポイント

## クイックスタート

### 前提条件

- Node.js >= 20.19.0
- npm または pnpm パッケージマネージャー
- Git バージョン管理ツール

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd nof1.ai

# 依存関係をインストール
npm install
```

### 設定

プロジェクトルートに `.env` ファイルを作成します:

```env
# サーバー設定
PORT=3100

# 取引パラメータ
TRADING_STRATEGY=balanced               # 取引戦略
TRADING_INTERVAL_MINUTES=20             # 取引ループ間隔
MAX_LEVERAGE=25                         # 最大レバレッジ倍率
MAX_POSITIONS=5                         # 最大ポジション数
MAX_HOLDING_HOURS=36                    # 最大保有時間(時間)
EXTREME_STOP_LOSS_PERCENT=-30           # 極端なストップロスの割合
INITIAL_BALANCE=1000                    # 初期資金(USDT)
ACCOUNT_STOP_LOSS_USDT=50               # 口座ストップロスライン
ACCOUNT_TAKE_PROFIT_USDT=20000          # 口座テイクプロフィットライン
SYNC_CONFIG_ON_STARTUP=true             # 起動時の設定同期

# データベース
DATABASE_URL=file:./.voltagent/trading.db

# 取引所選択（gate/okx、デフォルト: gate）
EXCHANGE=gate

# Gate.io API 認証情報(テストネットを先に使用することをお勧めします!)
GATE_API_KEY=your_api_key_here
GATE_API_SECRET=your_api_secret_here
GATE_USE_TESTNET=true

# OKX API 認証情報（EXCHANGE=okx の場合に必要）
OKX_API_KEY=
OKX_API_SECRET=
OKX_API_PASSPHRASE=
OKX_USE_TESTNET=true

# 手動ポジションクローズパスワード（Web インターフェース用）
CLOSE_POSITION_PASSWORD=

# AI モデルプロバイダー (OpenAI 互換 API)
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://openrouter.ai/api/v1  # オプション、OpenRouter、OpenAI、DeepSeek などをサポート
AI_MODEL_NAME=deepseek/deepseek-v3.2-exp      # モデル名

# アカウントドローダウンリスク管理
# 口座資産がピーク時から以下の割合で減少した際のリスク管理措置：
ACCOUNT_DRAWDOWN_WARNING_PERCENT=20          # 警告しきい値：リスク警告を発する
ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT=30  # 新規注文停止しきい値：新規ポジションの開設を停止、決済のみ許可
ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT=50      # 強制決済しきい値：すべてのポジションを自動的に決済し、残り資金を保護

# 口座記録設定
ACCOUNT_RECORD_INTERVAL_MINUTES=1            # 口座記録間隔
```

**API キー取得**:
- OpenRouter: https://openrouter.ai/keys
- OpenAI: https://platform.openai.com/api-keys
- DeepSeek: https://platform.deepseek.com/api_keys
- Gate.io テストネット: https://testnet.gate.com
- Gate.io 本番ネット: https://www.gatesite.org/signup/NOFIAIOO?ref_type=103
- OKX 取引所: https://www.okx.com/zh-hans/join/nofiaioo

### データベース初期化

```bash
npm run db:init
```

### 取引システムの起動

```bash
# 開発モード(ホットリロード)
npm run dev

# 本番モード
npm run trading:start
```

> **起動失敗？** 先物アカウントが0では取引できません。現物アカウントから資金を振替してください（テストネットも同様）。

### Web ダッシュボードへのアクセス

ブラウザで `http://localhost:3100` にアクセスします

## プロジェクト構造

```
nof1.ai/
├── src/
│   ├── index.ts                      # アプリケーションエントリーポイント
│   ├── agents/
│   │   └── tradingAgent.ts           # AI 取引 Agent 実装
│   ├── api/
│   │   └── routes.ts                 # 監視インターフェース HTTP API エンドポイント
│   ├── config/
│   │   └── riskParams.ts             # リスクパラメータ設定
│   ├── database/
│   │   ├── init.ts                   # データベース初期化ロジック
│   │   ├── schema.ts                 # データベーススキーマ定義
│   │   └── sync-from-gate.ts         # 取引所データ同期
│   ├── scheduler/
│   │   ├── tradingLoop.ts            # 取引ループオーケストレーション
│   │   ├── stopLossMonitor.ts        # 損切り監視
│   │   ├── trailingStopMonitor.ts    # トレーリングストップ監視
│   │   └── accountRecorder.ts        # アカウントレコーダー
│   ├── services/
│   │   ├── gateClient.ts             # Gate.io API クライアントラッパー
│   │   └── multiTimeframeAnalysis.ts # マルチタイムフレームデータアグリゲーター
│   ├── strategies/                   # 取引戦略実装
│   │   ├── index.ts                  # 戦略モジュールエクスポート
│   │   ├── types.ts                  # 戦略型定義
│   │   ├── ultraShort.ts             # 超短期戦略
│   │   ├── swingTrend.ts             # スイングトレンド戦略
│   │   ├── conservative.ts           # 保守的戦略
│   │   ├── balanced.ts               # バランス戦略
│   │   └── aggressive.ts             # 積極的戦略
│   ├── tools/
│   │   ├── analysis/                 # 分析ツール
│   │   └── trading/                  # VoltAgent 取引ツール実装
│   │       ├── accountManagement.ts  # アカウント照会と管理
│   │       ├── marketData.ts         # 市場データ取得
│   │       └── tradeExecution.ts     # 注文出しと管理
│   ├── types/
│   │   └── gate.d.ts                 # TypeScript 型定義
│   └── utils/
│       ├── timeUtils.ts              # 時間/日付ユーティリティ関数
│       ├── contractUtils.ts          # 契約ユーティリティ関数
│       ├── encodingUtils.ts          # エンコーディングユーティリティ関数
│       └── loggerUtils.ts            # ロガーユーティリティ関数
├── docs/                             # ドキュメントディレクトリ
│   └── TRADING_STRATEGIES_ZH.md      # 取引戦略ガイド（中国語）
├── public/                           # Web ダッシュボード静的ファイル
│   ├── index.html                    # ダッシュボード HTML
│   ├── app.js                        # ダッシュボード JavaScript
│   └── style.css                     # ダッシュボードスタイル
├── scripts/                          # 運用スクリプト
│   ├── init-db.sh                    # データベース設定スクリプト
│   ├── kill-port.sh                  # サービス停止スクリプト
│   └── sync-from-gate.sh             # データ同期スクリプト
├── .env                              # 環境設定
├── .voltagent/                       # データストレージディレクトリ
│   └── trading.db                    # SQLite データベースファイル
├── ecosystem.config.cjs              # PM2 プロセス設定
├── package.json                      # Node.js 依存関係
├── tsconfig.json                     # TypeScript 設定
└── Dockerfile                        # コンテナビルド定義
```

## 設定説明

### 環境変数

| 変数 | 説明 | デフォルト値 | 必須 |
|------|------|-------------|------|
| `PORT` | HTTP サーバーポート | 3100 | いいえ |
| `TRADING_STRATEGY` | 取引戦略 (`ultra-short`/`swing-trend`/`conservative`/`balanced`/`aggressive`) | balanced | いいえ |
| `TRADING_INTERVAL_MINUTES` | 取引ループ間隔(分) | 20 | いいえ |
| `MAX_LEVERAGE` | 最大レバレッジ倍率 | 25 | いいえ |
| `MAX_POSITIONS` | 最大ポジション数 | 5 | いいえ |
| `MAX_HOLDING_HOURS` | 最大保有時間(時間) | 36 | いいえ |
| `EXTREME_STOP_LOSS_PERCENT` | 極端なストップロスの割合（清算防止） | -30 | いいえ |
| `INITIAL_BALANCE` | 初期資金(USDT) | 1000 | いいえ |
| `ACCOUNT_STOP_LOSS_USDT` | 口座ストップロスライン(USDT) | 50 | いいえ |
| `ACCOUNT_TAKE_PROFIT_USDT` | 口座テイクプロフィットライン(USDT) | 20000 | いいえ |
| `SYNC_CONFIG_ON_STARTUP` | 起動時の設定同期 | true | いいえ |
| `DATABASE_URL` | SQLite データベースファイルパス | file:./.voltagent/trading.db | いいえ |
| `EXCHANGE` | 使用する取引所（`gate`/`okx`） | gate | いいえ |
| `GATE_API_KEY` | Gate.io API キー | - | はい（EXCHANGE=gate の場合） |
| `GATE_API_SECRET` | Gate.io API シークレット | - | はい（EXCHANGE=gate の場合） |
| `GATE_USE_TESTNET` | Gate.io テストネット環境を使用 | true | いいえ |
| `OKX_API_KEY` | OKX API キー | - | はい（EXCHANGE=okx の場合） |
| `OKX_API_SECRET` | OKX API シークレット | - | はい（EXCHANGE=okx の場合） |
| `OKX_API_PASSPHRASE` | OKX API パスフレーズ | - | はい（EXCHANGE=okx の場合） |
| `OKX_USE_TESTNET` | OKX テストネット環境を使用 | true | いいえ |
| `CLOSE_POSITION_PASSWORD` | Web インターフェースの手動ポジションクローズパスワード | - | はい |
| `OPENAI_API_KEY` | OpenAI 互換 API キー | - | はい |
| `OPENAI_BASE_URL` | API ベース URL | https://openrouter.ai/api/v1 | いいえ |
| `AI_MODEL_NAME` | モデル名 | deepseek/deepseek-v3.2-exp | いいえ |
| `ACCOUNT_DRAWDOWN_WARNING_PERCENT` | アカウントドローダウン警告しきい値：リスク警告を発する(%) | 20 | いいえ |
| `ACCOUNT_DRAWDOWN_NO_NEW_POSITION_PERCENT` | 新規注文停止しきい値：新規ポジションの開設を停止、決済のみ許可(%) | 30 | いいえ |
| `ACCOUNT_DRAWDOWN_FORCE_CLOSE_PERCENT` | 強制決済しきい値：すべてのポジションを自動的に決済し、残り資金を保護(%) | 50 | いいえ |
| `ACCOUNT_RECORD_INTERVAL_MINUTES` | 口座資産記録間隔(分) | 1 | いいえ |

### 取引戦略

システムは異なる市場状況とリスク選好に対応する5つの取引戦略をサポートします：

| 戦略コード | 戦略名 | 実行サイクル | 保有期間 | リスクレベル | 特徴 |
|-----------|--------|------------|----------|------------|------|
| `ultra-short` | 超短期 | 5分 | 30分-2時間 | 中高 | 素早く出入り、2%サイクルロックイン、30分利益決済 |
| `swing-trend` | スイングトレンド（推奨） | 20分 | 数時間-3日 | 中低 | 中長期スイング、トレンド捕捉、安定成長 |
| `conservative` | 保守的 | 5-15分 | 数時間-24時間 | 低 | 低リスク、低レバレッジ、元本保護優先 |
| `balanced` | バランス | 5-15分 | 数時間-24時間 | 中 | リスク・リターンバランス（デフォルト戦略） |
| `aggressive` | 積極的 | 5-15分 | 数時間-24時間 | 高 | 高リターン、高リスク |

戦略実装ファイルの場所：
- [超短期戦略](./src/strategies/ultraShort.ts)
- [スイングトレンド戦略](./src/strategies/swingTrend.ts)
- [保守的戦略](./src/strategies/conservative.ts)
- [バランス戦略](./src/strategies/balanced.ts)
- [積極的戦略](./src/strategies/aggressive.ts)

**推奨設定 - スイングトレンド戦略**（中長期安定成長に適しています）：
```bash
TRADING_STRATEGY=swing-trend
TRADING_INTERVAL_MINUTES=20
MAX_LEVERAGE=10
MAX_POSITIONS=3
```

詳細な戦略説明については、次を参照してください：[取引戦略ガイド](./docs/TRADING_STRATEGIES_ZH.md)（中国語）

### AI モデル設定

システムは OpenAI API 互換のプロバイダーをサポートします：

**OpenRouter** (推奨、複数のモデルをサポート):
```bash
OPENAI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL_NAME=deepseek/deepseek-v3.2-exp  # または x-ai/grok-4-fast, anthropic/claude-4.5-sonnet
```

**OpenAI**:
```bash
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL_NAME=gpt-4o  # または gpt-4o-mini
```

**DeepSeek**:
```bash
OPENAI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL_NAME=deepseek-chat  # または deepseek-coder
```

サポートされているモデル（異なるプロバイダー経由）:
- `openai/gpt-4o-mini` - コストパフォーマンスが高い
- `openai/gpt-4o` - 高品質な推論
- `anthropic/claude-4.5-sonnet` - 強力な分析能力
- `google/gemini-pro-2.5` - マルチモーダルサポート

モデルを変更するには、`src/agents/tradingAgent.ts` の設定を変更してください。

## コマンドリファレンス

### 開発

```bash
# 開発モード(ホットリロード)
npm run dev

# 型チェック
npm run typecheck

# コードチェック
npm run lint

# コードの問題を自動修正
npm run lint:fix
```

### 取引システム操作

```bash
# 取引システムを起動
npm run trading:start

# 取引システムを停止
npm run trading:stop

# 取引システムを再起動
npm run trading:restart
```

### データベース管理

```bash
# データベース構造を初期化
npm run db:init

# データベースをリセット(すべてのデータをクリア)
npm run db:reset

# データベースステータスを確認
npm run db:status

# Gate.io からデータを同期
npm run db:sync

# ポジションデータを同期
npm run db:sync-positions
```

### Docker コンテナ管理

```bash
# クイックスタートスクリプトを使用（推奨）
npm run docker:start

# コンテナを停止
npm run docker:stop

# ログを表示
npm run docker:logs

# イメージをビルド
npm run docker:build

# Docker Compose を使用
npm run docker:up          # 開発環境を起動
npm run docker:down        # 開発環境を停止
npm run docker:restart     # コンテナを再起動

# 本番環境
npm run docker:prod:up     # 本番環境を起動
npm run docker:prod:down   # 本番環境を停止
```

### PM2 プロセス管理

```bash
# デーモンプロセスを起動
npm run pm2:start

# 開発モードで起動
npm run pm2:start:dev

# プロセスを停止
npm run pm2:stop

# プロセスを再起動
npm run pm2:restart

# ログを表示
npm run pm2:logs

# リアルタイム監視
npm run pm2:monit

# すべてのプロセスをリスト表示
npm run pm2:list

# プロセスを削除
npm run pm2:delete
```

### ビルドと本番

```bash
# 本番ビルドを構築
npm run build

# 本番ビルドを実行
npm start
```

## 本番デプロイ

### PM2 デプロイ(推奨)

PM2 は長時間実行される Node.js アプリケーションの強力なプロセス管理を提供します。

**インストールとセットアップ**:

```bash
# 1. PM2 をグローバルにインストール
npm install -g pm2

# 2. アプリケーションを起動
npm run pm2:start

# 3. 起動時の自動起動を有効化
pm2 startup
pm2 save

# 4. ログを監視
npm run pm2:logs
```

**PM2 設定** (`ecosystem.config.cjs`):

```javascript
module.exports = {
  apps: [
    {
      name: 'open-nof1.ai',
      script: 'tsx',
      args: '--env-file=.env ./src',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai'
      }
    }
  ]
};
```

### Docker デプロイ

**ビルドと実行**:

```bash
# Docker イメージをビルド
docker build -t open-nof1.ai:latest .

# コンテナを実行
docker run -d \
  --name open-nof1.ai \
  -p 3100:3100 \
  --env-file .env \
  --restart unless-stopped \
  -v ./voltagent-data:/app/.voltagent \
  -v ./logs:/app/logs \
  open-nof1.ai:latest

# ログを表示
docker logs -f open-nof1.ai

# コンテナを停止
docker stop open-nof1.ai

# コンテナを削除
docker rm open-nof1.ai
```

**Docker Compose**(推奨):

```bash
# クイックスタートスクリプトを使用
./scripts/docker-start.sh

# または手動で Docker Compose を使用
docker compose up -d

# ログを表示
docker compose logs -f

# サービスを停止
docker compose down
```

## トラブルシューティング

### よくある問題

#### データベースがロックされている

**エラー**: `database is locked`

**解決策**:
```bash
# すべての実行インスタンスを停止
npm run trading:stop
# または強制終了
pkill -f "tsx"

# データベースロックファイルを削除
rm -f .voltagent/trading.db-shm
rm -f .voltagent/trading.db-wal

# 再起動
npm run trading:start
```

#### API 認証情報が設定されていない

**エラー**: `GATE_API_KEY and GATE_API_SECRET must be set in environment variables`

**解決策**:
```bash
# .env ファイルを確認
cat .env | grep GATE_API

# 設定を編集
nano .env
```

#### ポートが使用中

**エラー**: `EADDRINUSE: address already in use :::3100`

**解決策**:
```bash
# 方法 1: 停止スクリプトを使用
npm run trading:stop

# 方法 2: プロセスを手動で終了
lsof -ti:3100 | xargs kill -9

# 方法 3: .env でポートを変更
# PORT=3200 を設定
```

#### テクニカル指標がゼロを返す

**原因**: ローソク足データフォーマットの不一致

**解決策**:
```bash
# 最新の更新を取得
git pull

# 依存関係を再インストール
npm install

# システムを再起動
npm run trading:restart
```

#### AI モデル API エラー

**エラー**: `OpenAI API error` または接続失敗

**解決策**:
- `OPENAI_API_KEY` が正しいことを確認
- `OPENAI_BASE_URL` が正しく設定されていることを確認
  - OpenRouter: `https://openrouter.ai/api/v1`
  - OpenAI: `https://api.openai.com/v1`
  - DeepSeek: `https://api.deepseek.com/v1`
- API キーに十分なクレジットがあることを確認
- ネットワーク接続とファイアウォール設定を確認
- 該当サービスプロバイダーのステータスを確認

### ログ記録

```bash
# リアルタイムターミナルログを表示
npm run trading:start

# PM2 ログを表示
npm run pm2:logs

# 履歴ログファイルを表示
tail -f logs/trading-$(date +%Y-%m-%d).log

# PM2 エラーログを表示
tail -f logs/pm2-error.log
```

### データベースチェック

```bash
# データベースステータスを確認
npm run db:status

# SQLite 対話モードに入る
sqlite3 .voltagent/trading.db

# SQLite コマンド
.tables                      # すべてのテーブルをリスト表示
.schema account_history      # テーブル構造を表示
SELECT * FROM account_history ORDER BY timestamp DESC LIMIT 10;
.exit                        # SQLite を終了
```

## API ドキュメント

### REST API エンドポイント

| エンドポイント | メソッド | 説明 |
|--------------|---------|------|
| `/api/account` | GET | 現在のアカウントステータスと残高 |
| `/api/positions` | GET | アクティブなポジション |
| `/api/trades` | GET | 取引履歴 |
| `/api/decisions` | GET | AI 意思決定ログ |
| `/api/health` | GET | システムヘルスチェック |

### WebSocket サポート

リアルタイムデータストリーミングサポート:
- アカウント更新
- ポジション変更
- 新しい取引実行
- AI 意思決定イベント

## ベストプラクティス

### テストネットでのテスト

**重要**: 本番ネットへのデプロイ前に、必ずテストネットで十分にテストしてください。

```bash
# .env で設定
GATE_USE_TESTNET=true
```

テストネットの利点:
- 仮想資金を使用した金融リスクゼロ
- 実際の取引環境の完全なシミュレーション
- AI 戦略の有効性を検証
- 様々な条件下でシステムの信頼性をテスト

### 資金管理

本番ネットに切り替える際:
- 最小資金で開始(推奨: 100-500 USDT)
- 数日間のパフォーマンスを監視
- 検証結果に基づいて段階的に資金規模を拡大
- 適切な損切りパーセンテージを設定

### 定期的なバックアップ

```bash
# データベースをバックアップ
cp .voltagent/trading.db .voltagent/trading.db.backup-$(date +%Y%m%d)

# 自動バックアップスクリプト
#!/bin/bash
backup_dir="backups"
mkdir -p $backup_dir
cp .voltagent/trading.db "$backup_dir/trading-$(date +%Y%m%d-%H%M%S).db"
```

### 監視と調整

- Web ダッシュボードの指標を定期的に確認
- AI 意思決定ログのパターンを分析
- エラーログとシステムアラートを監視
- 市場状況に応じてパラメータを調整

### リスク管理

- 保守的な最大レバレッジを設定(推奨: 3-5倍)
- 取引ごとの最大ポジションサイズを定義
- 複数の資産に分散投資
- 極端な市場変動時の取引を避ける

### 本番ネットへの切り替え

**警告**: 本番ネットへのデプロイ前に、徹底的なテストネット検証が完了していることを確認してください。

```bash
# 1. システムを停止
# Ctrl+C を押す

# 2. .env ファイルを編集
nano .env

# 3. Gate.io 設定を更新
EXCHANGE=gate
GATE_USE_TESTNET=false
GATE_API_KEY=your_mainnet_api_key
GATE_API_SECRET=your_mainnet_api_secret

# または OKX 設定を更新
EXCHANGE=okx
OKX_USE_TESTNET=false
OKX_API_KEY=your_okx_mainnet_api_key
OKX_API_SECRET=your_okx_mainnet_api_secret
OKX_API_PASSPHRASE=your_okx_passphrase

# 4. システムを再起動
npm run trading:start
```

## リソース

### コミュニティ

- **Telegram グループ**: [AI Agent 学習コミュニティに参加](https://t.me/+E7av1nVEk5E1ZjY9)
  - AI 量的取引戦略を議論
  - プロジェクト使用経験を共有
  - 技術サポートとアドバイスを取得

### 🎁 取引リベート & コミュニティ特典

**Gate.io 取引所（推奨）**

Gate.io アカウントをお持ちでない場合、招待リンクから登録できます：

- **招待リンク**: [https://www.gatesite.org/signup/NOFIAIOO?ref_type=103](https://www.gatesite.org/signup/NOFIAIOO?ref_type=103)
- **招待コード**: `NOFIAIOO`

[Telegram グループ](https://t.me/+E7av1nVEk5E1ZjY9) に参加して **60% 手数料リベート**などのコミュニティ特典を取得。

> **ヒント**：Gate.io のテストネットと本番ネットは同じアカウントが使用可能です。実際の取引前にテストネットで十分にテストすることをお勧めします。

### 外部リンク

- [VoltAgent ドキュメント](https://voltagent.dev/docs/)
- [OpenRouter モデルカタログ](https://openrouter.ai/models)
- [OpenAI API リファレンス](https://platform.openai.com/docs/api-reference)
- [DeepSeek API ドキュメント](https://platform.deepseek.com/api-docs/)
- [Gate.io API リファレンス](https://www.gate.io/docs/developers/apiv4/)
- [Gate.io テストネット](https://testnet.gate.com)
- [OKX API リファレンス](https://www.okx.com/docs-v5/ja/)
- [OKX 取引所](https://www.okx.com/zh-hans/join/nofiaioo)

## リスク免責事項

**本システムは教育および研究目的でのみ提供されます。暗号通貨取引には重大なリスクがあり、資金損失を引き起こす可能性があります。**

- 必ず最初にテストネットで戦略をテストしてください
- 失うことができる資金のみを投資してください
- すべての取引リスクを理解し、受け入れてください
- AI の意思決定は利益を保証するものではありません
- ユーザーはすべての取引活動について完全な責任を負います
- システムのパフォーマンスについて保証や担保はありません
- 過去のパフォーマンスは将来の結果を示すものではありません

## オープンソースライセンス

本プロジェクトは **GNU Affero General Public License v3.0 (AGPL-3.0)** ライセンスの下で公開されています。

### 主要な条項

- **無料使用**: どのような目的でも本ソフトウェアを使用できます
- **オープンソース要件**: 変更または派生作品は AGPL-3.0 の下で公開する必要があります
- **ネットワーク使用**: ネットワーク上で本ソフトウェアをサービスとして提供する場合、ソースコードを公開する必要があります
- **保証なし**: ソフトウェアは「現状のまま」提供され、いかなる形式の保証もありません

完全な条項については [LICENSE](./LICENSE) ファイルを参照してください。

### なぜ AGPL-3.0 を選択したのか?

AGPL-3.0 を選択した理由:
- 取引コミュニティがすべての改善から利益を得られるようにするため
- 金融ソフトウェアの透明性を確保するため
- プロプライエタリフォークを防ぐため
- ユーザーの自由を保護するため

## 貢献

貢献を歓迎します！以下のガイドラインに従ってください:

### 問題の報告

- GitHub Issues を使用してバグと機能リクエストを報告
- 詳細な再現手順を提供
- システム情報とログを含める
- 新しい問題を作成する前に、既存の同様の問題を確認

### Pull Request

1. リポジトリを Fork
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. [Conventional Commits](https://www.conventionalcommits.org/) に従って変更をコミット
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Request を開く

### コード規約

- 既存の TypeScript コードスタイルに従う
- 新機能にテストを追加
- 必要に応じてドキュメントを更新
- すべてのテストが通過することを確認
- コミット前にリンターを実行

### コミットメッセージ規約

Conventional Commits 規約に従います:

```
<タイプ>[オプション スコープ]: <説明>

[オプション 本文]

[オプション フッター]
```

タイプ:
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: コードスタイル変更(フォーマットなど)
- `refactor`: コードリファクタリング
- `perf`: パフォーマンス最適化
- `test`: テストの追加または変更
- `chore`: ビルドプロセスまたは補助ツールの変更
- `ci`: CI/CD 設定の変更

## プロジェクトのサポート

本プロジェクトがお役に立った場合、以下の方法で継続的な開発をサポートできます：

| 通貨 | ネットワーク | アドレス |
|------|-------------|---------|
| **USDT** | TRON (TRC20) | `TAdHVfDtJ3nn6fjT1DWvfuU89GzMBxcXmU` |
| **USDT** | Ethereum (ERC20) | `0x7b5a45499086632d1ccf7177f1f7fdf6a8236569` |
| **USDT** | BNB Chain (BEP20) | `0x7b5a45499086632d1ccf7177f1f7fdf6a8236569` |
| **USDT** | Solana (SPL) | `DVWUAJHampBM8pAUWCFskHXp6Uh4SrVKsjfPmnvMcjtq` |
| **USDT** | Polygon | `0x7b5a45499086632d1ccf7177f1f7fdf6a8236569` |

皆様のサポートがプロジェクトの継続的な改善の原動力です。ありがとうございます！

---
<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=195440/open-nof1.ai&type=Date)](https://star-history.com/#195440/open-nof1.ai&Date)

</div>

