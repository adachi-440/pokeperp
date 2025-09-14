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
- `PRICE_SOURCE_URL`: 価格取得API（`{ price: number }` を返す想定）
- `SCALE`: on-chain の `priceScale()` を上書き（例: `100`）
- `HEARTBEAT_SEC`: on-chain の `heartbeat()` を上書き（例: `10`）
- `PUSH_INTERVAL_MS`: 実際の送信間隔（デフォルト 3000ms）

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

## 動作概要
- 起動時に on-chain の `priceScale()`/`heartbeat()` を取得（環境変数で上書き可）。
- 指定間隔で `PRICE_SOURCE_URL` から価格を取得し、`scale` に丸めて `pushPrice` を送信。
- `heartbeat` より送信間隔が長い場合は警告し、必要に応じて自動調整します。
- 送信失敗は簡易リトライ（指数バックオフ）。

## 注意
- Reporter アドレスは Adapter の `reporter` に設定されている必要があります。
- ガス代が高騰した場合に備え、`maxFeePerGas`/`maxPriorityFeePerGas` を RPC から自動取得します。

