# OrderBook MVP - On-chain CLOB Perpetual Trading

## 概要
このプロジェクトは、オンチェーン中央指値注文板（CLOB）による永久先物取引システムのMVP実装です。Solidityで実装され、Foundryフレームワークを使用してテストされています。

## 主要機能

### コア機能
- **注文の発注（Place）**: 買い（bid）または売り（ask）注文を板に追加
- **注文の取消（Cancel）**: 自分の未約定注文を取消
- **自動約定（Match）**: 価格が交差した注文を自動的に約定
- **FIFO原則**: 同一価格レベルでは先着順で約定

### セキュリティ機能
- **最小数量制限**: ダスト攻撃を防止
- **最小想定元本制限**: 経済的に意味のない注文を排除
- **価格乖離制限**: オラクル価格から大きく乖離した約定を防止
- **段階的約定**: DoS攻撃を防ぐためのステップ制限
- **一時停止機能**: 緊急時の取引停止

## アーキテクチャ

### コントラクト構成
```
src/
├── orderbook/
│   └── OrderBookMVP.sol         # メインコントラクト
├── interfaces/
│   ├── IOrderBook.sol           # 注文板インターフェース
│   ├── IOracleAdapter.sol       # 価格オラクルインターフェース
│   └── ISettlementHook.sol      # 約定処理フック
├── libraries/
│   └── OrderBookTypes.sol       # データ構造定義
└── mocks/
    ├── MockOracleAdapter.sol    # テスト用オラクル
    └── BasicSettlementHook.sol  # 基本的な約定記録
```

### データ構造

#### Order（注文）
```solidity
struct Order {
    bytes32 id;          // 注文ID
    address trader;      // トレーダーアドレス
    bool isBid;         // 買い注文フラグ
    int24 price;        // 価格レベル
    uint256 qty;       // 数量
    uint256 filledQty; // 約定済み数量
    uint256 timestamp; // タイムスタンプ
    bytes32 nextId;    // 次の注文ID（双方向リンクリスト）
    bytes32 prevId;    // 前の注文ID
}
```

#### Level（価格レベル）
```solidity
struct Level {
    uint256 totalQty;  // レベルの合計数量
    bytes32 headId;    // 先頭注文ID
    bytes32 tailId;    // 末尾注文ID
}
```

## 使用方法

### デプロイ
```solidity
OrderBookMVP orderBook = new OrderBookMVP(
    1e18,      // minQty: 最小数量
    10e18,     // minNotional: 最小想定元本
    500,       // deviationLimit: 価格乖離制限（5%）
    oracleAddr // オラクルアドレス
);
```

### 注文の発注
```solidity
// 買い注文（価格 100で2単位）
bytes32 orderId = orderBook.place(true, 100, 2e18);

// 売り注文（価格 105で3単位）
bytes32 orderId = orderBook.place(false, 105, 3e18);
```

### 注文の取消
```solidity
orderBook.cancel(orderId);
```

### 約定の実行
```solidity
// 最大10ステップまで約定を実行
uint256 matchedQty = orderBook.matchAtBest(10);
```

### 情報の取得
```solidity
// 最良買い/売り価格
int24 bestBid = orderBook.bestBidPrice();
int24 bestAsk = orderBook.bestAskPrice();

// 特定注文の情報
IOrderBook.Order memory order = orderBook.orderOf(orderId);

// 価格レベルの情報
IOrderBook.Level memory level = orderBook.levelOf(true, 100);

// トレーダーの未約定注文
bytes32[] memory openOrders = orderBook.getOpenOrders(trader);
```

## テスト

### テスト実行
```bash
# 全テスト実行
forge test

# 特定のテスト実行
forge test --match-contract OrderBookPlaceTest

# ガス使用量レポート付き
forge test --gas-report

# 詳細ログ付き
forge test -vvv
```

### テストカバレッジ
- **単体テスト**: place, cancel, match機能の個別テスト
- **エッジケーステスト**: 境界条件、空の板、部分約定など
- **ガスベンチマーク**: 各操作のガス使用量測定
- **セキュリティテスト**: アクセス制御、DoS対策、価格操作防止
- **統合テスト**: 実際の取引シナリオのシミュレーション

### テスト結果
```
Total Tests: 26
Passed: 26 ✅
Failed: 0
Coverage: ~85%
```

## ガス使用量

| 操作 | ガス使用量 |
|------|-----------|
| Place (初回) | ~220,000 |
| Place (既存レベル) | ~180,000 |
| Cancel | ~50,000-100,000 |
| Match (シンプル) | ~330,000 |
| Match (部分約定) | ~280,000 |
| View関数 | <5,000 |

## セキュリティ考慮事項

1. **Reentrancy防止**: 状態変更後に外部呼び出し
2. **アクセス制御**: onlyOwner修飾子による管理機能の保護
3. **整数オーバーフロー**: Solidity 0.8.x の自動チェック
4. **DoS対策**: stepsMaxによる約定ループの制限
5. **価格操作防止**: オラクル価格との乖離チェック

## 制限事項とTODO

### 現在の制限
- 単一マーケットのみサポート
- 線形価格モデル（簡略化された_priceToUint）
- 基本的なFIFO約定のみ

### 将来の改善案
- [ ] 複数マーケットのサポート
- [ ] より精密な価格計算（対数スケール）
- [ ] Pro-rata約定オプション
- [ ] ストップロス/テイクプロフィット注文
- [ ] 証拠金管理システムとの統合
- [ ] イベントベースのインデックス化
- [ ] L2最適化

## ライセンス
MIT

## 開発者
Pokeperp Team

## 監査状況
⚠️ **未監査**: このコードは本番環境での使用前に専門的な監査が必要です。

---

詳細な仕様については、`book/spec_mini_mvp.md`を参照してください。