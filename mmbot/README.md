# Market Maker Bot

TypeScriptで実装された簡易的なマーケットメイカーボットです。Oracle価格の周辺でランダムに買い注文と売り注文を出します。

## 機能

- Oracle価格の取得（デフォルト: CoinGecko API）
- Oracle価格周辺でのランダムな注文配置
- 買い注文と売り注文の自動生成
- 設定可能なスプレッドとオーダーサイズ
- 古い注文の自動管理
- TypeScriptによる型安全性

## セットアップ

1. 依存関係のインストール:
```bash
npm install
```

2. TypeScriptのビルド:
```bash
npm run build
```

3. 環境変数の設定:
```bash
cp .env.example .env
```

4. `.env`ファイルを編集して適切な値を設定

## 設定項目

- `RPC_URL`: Ethereumノードへの接続URL
- `PRIVATE_KEY`: ボット用ウォレットの秘密鍵
- `CONTRACT_ADDRESS`: 取引コントラクトのアドレス
- `ORACLE_URL`: Oracle価格を取得するAPI URL
- `SPREAD_PERCENTAGE`: Oracle価格からのスプレッド（%）
- `ORDER_SIZE_MIN`: 最小注文サイズ（ETH）
- `ORDER_SIZE_MAX`: 最大注文サイズ（ETH）
- `UPDATE_INTERVAL`: 注文更新間隔（ミリ秒）
- `MAX_ORDERS_PER_SIDE`: 片側あたりの最大注文数

## 使用方法

### ビルドして実行
```bash
npm run build  # TypeScriptをコンパイル
npm start      # コンパイル済みのコードを実行
```

### 開発モード
```bash
npm run dev    # ビルドしてから実行
npm run watch  # ファイル変更を監視して自動ビルド（別ターミナルで実行）
```

ボットを停止するには `Ctrl+C` を押してください。

## プロジェクト構造

```
mmbot/
├── src/
│   └── index.ts       # メインのボットロジック
├── dist/              # コンパイル済みJavaScript（自動生成）
├── tsconfig.json      # TypeScript設定
├── package.json       # プロジェクト設定
├── .env              # 環境変数（要作成）
└── .gitignore        # Git除外設定
```

## 注意事項

- このボットは教育目的のサンプルです
- 実際の取引に使用する前に十分なテストを行ってください
- 秘密鍵の管理には十分注意してください