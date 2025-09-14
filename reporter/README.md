# Oracle Reporter (TypeScript / Push 型)

本パッケージは、外部価格を取得してオンチェーンの Oracle Adapter に `pushPrice(price)` を定期送信（push）するミニMVP実装です。

## 前提
- Node.js 18+（推奨 20+）
- コントラクト側は `pushPrice(uint256)`, `priceScale()`, `heartbeat()` を実装していること（例: `OracleAdapterSimple`）。

## セットアップ
```
cd reporter
cp .env.example .env  # 必要項目を設定
npm i
```

必須環境変数:
- `RPC_URL`: L2 RPC エンドポイント
- `PRIVATE_KEY`: Reporter EOA の秘密鍵（資金が必要）
- `ORACLE_ADDRESS`: Oracle Adapter のコントラクトアドレス

任意:
- `PRICE_SOURCE_URL`: 価格取得API（JSON）
- `PRICE_SOURCE_URLS`: 複数ソース（カンマ区切り）を同時取得し集計
- `PRICE_JSON_PATH`: 価格の JSON パス（ドット記法、既定: `price`）
- `SCALE`: on-chain の `priceScale()` を上書き（例: `100`）
- `HEARTBEAT_SEC`: on-chain の `heartbeat()` を上書き（例: `10`）
- `PUSH_INTERVAL_MS`: 実際の送信間隔（デフォルト 3000ms）
 - `SKIP_SAME_PRICE`: 同値なら送信スキップ（`true/false`）
 - `DRY_RUN`: 送信せずログのみ（`true/false`）
 - `AGGREGATION`: 価格集計方式 `median|mean|trimmed-mean`（既定: `median`）
 - `REQUEST_TIMEOUT_MS`: 価格取得のタイムアウト（既定: 1500ms）
 - `RETRIES`: 価格取得のリトライ回数（既定: 3）
 - `JITTER_PCT`: 送信間隔に加えるジッター率 0.0〜0.5（既定: 0.1）
 - `PRICE_CHANGE_BPS`: 最小変化閾値（bps）。小変化はスキップ（既定: 無効）

## 実行
開発（トランスパイル無し）:
```
npm run dev
```

ビルド + 実行:
```
npm run build
npm start
```

ローカルモックでの動作確認:
```
# 1) 別ターミナルでモックサーバー起動
npm run mock

# 2) .env の PRICE_SOURCE_URL を以下に設定
# PRICE_SOURCE_URL=http://localhost:8787/price

# 3) Reporter 実行
npm run dev
```

オンチェーン状態の確認（スケール/ハートビート/価格/鮮度）:
```
npm run check
```

管理操作（オーナーアドレスの秘密鍵を `.env` の `PRIVATE_KEY` に設定して実行）:
```
# 現在値の取得
npm run admin -- get

# Reporter の設定（EOA アドレス）
npm run admin -- set-reporter 0xYourReporter

# Heartbeat（秒）の更新
npm run admin -- set-heartbeat 10

# pause / unpause
npm run admin -- pause true
npm run admin -- pause false
```

## 動作概要
- 起動時に on-chain の `priceScale()`/`heartbeat()` を取得（環境変数で上書き可）。
- 指定間隔（ジッター付き）で価格を取得し、`scale` に丸めて `pushPrice` を送信。
- 価格取得は複数ソースから並列取得し、`AGGREGATION` に従って集計（既定: median）。
- `heartbeat` より送信間隔が長い場合は警告し、必要に応じて自動調整します。
- 変化が小さい場合、`PRICE_CHANGE_BPS` や `SKIP_SAME_PRICE` でスキップ可能（ただし鮮度維持のため古い場合は送信）。

## 注意
- Reporter アドレスは Adapter の `reporter` に設定されている必要があります。
- ガス代が高騰した場合に備え、`maxFeePerGas`/`maxPriorityFeePerGas` を RPC から自動取得します。
