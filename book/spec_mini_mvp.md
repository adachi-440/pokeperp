# オンチェーン FBA Perp — ミニMVP 仕様（非SUAVE版）

> 目的: Frequent Batch Auction (FBA) 方式を採用した板（CLOB）実装のためのミニMVP仕様。SUAVEに依存せず、標準的なEVM環境で動作する実装。
>
> 前提: 単一マーケット・線形Perp・USDC担保。板と約定はバッチ処理でオンチェーン。Funding/清算は後続拡張。

---

## 1. TL;DR（ミニMVPの範囲）

- 板コア: ヒープ構造による価格優先管理、通常のstorage使用
- 操作: `placeOrder`, `cancelOrder`, `executeFills`（バッチ実行）
- ガード: `minQty`, `minNotional`, `deviationLimit(band)`（Index/Mark参照）
- 約定価格: 統一清算価格（bid最高値とask最低値の中間価格）で成立
- 会計/リスク: 本MVPでは板に限定。約定は `FillEvent` を発行し、外部の `SettlementHook` で処理可能
- バッチ間隔: 設定可能な時間間隔（例：5秒、30秒）でバッチ実行
- 非対象: Funding計算・清算ロジック・保険基金の厳密会計・複数マーケット・手数料詳細

---

## 2. コントラクト（MVP）

- FBA（本体）
  - 役割: 注文の収集、バッチ処理での約定、ガード適用、イベント発行
  - 依存: `IOracleAdapter`、`FBAHeap`ライブラリ、任意の `ISettlementHook`
- IOracleAdapter（IF）
  - `function indexPrice() external view returns (uint256);`
  - `function markPrice() external view returns (uint256);`
- ISettlementHook（任意IF）
  - `function onFill(address buyer, address seller, uint256 price, uint256 amount) external;`
- FBAHeap（ライブラリ）
  - ヒープベースの優先度付きキュー実装
  - 効率的なO(log n)の挿入・削除操作

---

## 3. データモデル（非SUAVE版）

```solidity
// マーケット設定
struct MarketCfg {
  uint128 minQty;          // 最小数量
  uint256 minNotional;     // 最小ノーション（amount * price）
  uint256 deviationLimit;  // band (1e18 = 100%)
  uint256 contractSize;    // 1サイズあたりの$換算係数
  uint256 batchInterval;   // バッチ実行間隔（秒）
}

// FBAHeapライブラリ内で定義
struct Order {
  uint256 price;           // 価格（tickSize統合済み）
  uint256 amount;          // 数量
  bool side;              // true=Bid, false=Ask
  string orderId;         // ユニークID
}

// ヒープ構造（FBAHeapライブラリ内）
struct Heap {
  Order[] orders;          // ヒープ配列
  mapping(string => uint256) orderIdToIndex; // orderId → 配列インデックス+1
}

struct Fill {
  uint256 price;          // 清算価格
  uint256 amount;         // 約定数量
}

struct Cancel {
  string orderId;         // キャンセル対象ID
  bool side;             // 注文サイド
}
```

- ストレージ:
  - `FBAHeap.Heap bidHeap` (買い注文のヒープ)
  - `FBAHeap.Heap askHeap` (売り注文のヒープ)
  - `Fill[] fills` (現在のバッチの約定リスト)
  - `Cancel[] cancels` (保留中のキャンセルリスト)
  - `MarketCfg cfg`
  - `address settlementHook`（任意）
  - `uint256 lastBatchTime` (最後のバッチ実行時刻)

---

## 4. 外部関数（挙動）

### 4.1 placeOrder(Order memory ord)
- ガード: `ord.amount >= cfg.minQty`, `ord.amount * ord.price >= cfg.minNotional`
- ヒープへの挿入:
  - 買い注文: 最大ヒープ（bidHeap）に挿入
  - 売り注文: 最小ヒープ（askHeap）に挿入
- `emit OrderPlace(price, amount, side)`
- 即座の約定は発生しない（次回バッチまで待機）

### 4.2 cancelOrder(string orderId, bool side)
- キャンセルリストに追加（即座の削除ではない）
- `emit OrderCancel(orderId, side)`
- 実際の削除は次回バッチ実行時

### 4.3 executeFills()
- 実行条件: `block.timestamp >= lastBatchTime + batchInterval`
- 処理順序:
  1. **キャンセル処理（優先実行）**
     - キャンセルリストの全注文を削除
     - 存在しない注文はスキップ
  2. **清算価格計算**
     - `clearingPrice = (bidMax.price + askMin.price) / 2`
  3. **bandチェック**
     - `|clearingPrice - index|/index <= cfg.deviationLimit`
  4. **約定処理**
     - 約定条件: `bidMax.price >= clearingPrice && askMin.price <= clearingPrice`
     - 統一価格での約定処理
     - 部分約定の場合は残量を更新してヒープに戻す
- `emit FillEvent(Fill)` 各約定ごと
- SettlementHook設定時は `onFill` を呼び出し
- `lastBatchTime` 更新

### 4.4 View関数
- `getTopBid()`: 最良買い気配取得
- `getTopAsk()`: 最良売り気配取得
- `getBidsAboveThreshold(threshold)`: 閾値以上の買い注文リスト
- `getAsksBelowThreshold(threshold)`: 閾値以下の売り注文リスト
- `getFills()`: 現在のバッチの約定リスト
- `getPendingCancels()`: 保留中のキャンセルリスト

---

## 5. イベント

- `OrderPlace(uint256 price, uint256 amount, bool side)`
- `OrderCancel(string orderId, bool side)`
- `FillEvent(Fill fill)`
- `BatchExecuted(uint256 timestamp, uint256 fillCount)`（オプション）

---

## 6. ガード・不変条件

- バッチ間隔: `executeFills`は設定された間隔でのみ実行可能
- キャンセル優先: バッチ実行時、キャンセルを約定より先に処理
- band: `|clearingPrice - index| / index <= deviationLimit`
- 価格交差: 清算価格は必ずbid/askの中間
- MEV耐性: バッチ処理により、フロントランニングを軽減
- 会計整合（将来）: SettlementHook/PerpEngine側でゼロサムを担保

---

## 7. マッチング仕様（FBA特有）

- **バッチ収集**: 一定期間注文を収集
- **統一清算価格**: すべての約定が同一価格で成立
- **価格決定**: `(最高買値 + 最低売値) / 2`
- **優先順位**: ヒープ構造により価格優先を維持
- **部分約定**: 数量差分は次回バッチへ持ち越し

実装例:
```solidity
function executeFills() external {
    // フィルリセット
    delete fills;

    // 1. キャンセル処理（優先）
    for (uint i = 0; i < cancels.length; i++) {
        if (cancels[i].side) {
            if (bidHeap.orderIdToIndex[cancels[i].orderId] > 0) {
                FBAHeap.deleteOrder(cancels[i].orderId, true, bidHeap);
            }
        } else {
            if (askHeap.orderIdToIndex[cancels[i].orderId] > 0) {
                FBAHeap.deleteOrder(cancels[i].orderId, false, askHeap);
            }
        }
    }
    delete cancels;

    // 2. 約定処理
    Order memory bidMax = FBAHeap.getTopOrder(bidHeap, true);
    Order memory askMin = FBAHeap.getTopOrder(askHeap, false);

    if (bidMax.price == 0 || askMin.price == type(uint256).max) {
        return; // 有効な注文なし
    }

    uint256 clearingPrice = (bidMax.price + askMin.price) / 2;

    // 約定ループ
    while (bidMax.price >= askMin.price &&
           bidMax.price >= clearingPrice &&
           askMin.price <= clearingPrice &&
           bidMax.amount > 0 && askMin.amount > 0) {

        // 約定処理ロジック...

        // 次の注文を取得
        bidMax = FBAHeap.getTopOrder(bidHeap, true);
        askMin = FBAHeap.getTopOrder(askHeap, false);
    }
}
```

---

## 8. パラメータ管理

- 初期化: `cfg = {minQty, minNotional, deviationLimit, contractSize, batchInterval}`
- 更新: オーナー権限で `setBatchInterval`, `setMinQty`, `setMinNotional`, `setDeviationLimit`
- 緊急停止: `pauseBatch()`でバッチ実行を停止（注文受付は継続可）

---

## 9. ガス/セキュリティ設計ノート

- **O(log n)**: ヒープ操作による効率的な最良気配管理
- **バッチ処理**: ガス効率の向上（複数約定を1トランザクション）
- **DoS対策**: `minNotional`, `minQty`、バッチサイズ上限
- **Reentrancy**: `executeFills`に`nonReentrant`必須
- **ストレージ最適化**:
  - インデックスマッピングで効率的な検索
  - 配列の動的管理でガス削減

---

## 10. ヒープ実装の詳細

### 10.1 データ構造
```solidity
library FBAHeap {
    struct Heap {
        Order[] orders;
        mapping(string => uint256) orderIdToIndex; // +1オフセット（0=存在しない）
    }
}
```

### 10.2 主要操作
- **挿入**: O(log n) - ヒープ末尾に追加後、heapifyUp
- **削除**: O(log n) - 最後の要素と交換後、heapifyDown/Up
- **最良取得**: O(1) - ヒープのルート要素
- **更新**: O(1) - インデックス既知の場合

### 10.3 ヒープ不変条件
- 買いヒープ: 親 ≥ 子（最大ヒープ）
- 売りヒープ: 親 ≤ 子（最小ヒープ）

---

## 11. CLOB→FBA移行の主要変更点

| 項目 | CLOB | FBA（非SUAVE版） |
|------|------|------------------|
| 約定タイミング | 即座 | バッチ間隔ごと |
| 価格決定 | Resting側価格 | 統一清算価格 |
| データ構造 | 双方向リンクリスト | ヒープ |
| キャンセル | 即座実行 | 次回バッチで処理 |
| MEV耐性 | 低 | 中（バッチ処理のみ） |
| ストレージ | 通常 | 通常（非SUAVE） |

---

## 12. 実装TODO（チェックリスト）

- [x] ヒープライブラリの実装（FBAHeap.sol）
- [x] `placeOrder`実装（ヒープ挿入、ガード適用）
- [x] `cancelOrder`実装（キャンセルキュー管理）
- [x] `executeFills`実装:
  - [x] キャンセル処理
  - [x] 清算価格計算
  - [x] 統一価格での約定処理
- [x] view関数群の実装
- [ ] Oracle統合（band計算用）
- [ ] SettlementHook インターフェース実装
- [ ] バッチ間隔チェック
- [ ] band判定
- [ ] アクセス制御とパラメータ更新機能
- [ ] 単体テスト:
  - [ ] バッチ間隔の動作確認
  - [ ] 清算価格計算の正確性
  - [ ] キャンセル優先処理
  - [ ] band拒否ケース
- [ ] ガス最適化とベンチマーク

---

## 13. 将来の拡張

- **Oracle統合**: band判定用の価格フィード
- **Settlement統合**: 約定後の決済処理
- **アクセス制御**: オーナー権限、Keeper権限
- **手数料**: maker/taker手数料の実装
- **複数清算価格**: より洗練された価格発見メカニズム
- **クロスマーケットバッチ**: 複数市場の同時清算

---

## 14. デプロイ要件

- **ネットワーク**: 任意のEVM互換チェーン（Ethereum、Arbitrum、Base等）
- **コンパイラ**: Solidity 0.8.13以上
- **依存**: OpenZeppelin（オプション、アクセス制御用）
- **ガス推定**:
  - placeOrder: ~150k gas
  - cancelOrder: ~50k gas
  - executeFills: 200k-500k gas（約定数による）

---

更新履歴:
- v0.2 非SUAVE版（通常のEVM実装）
- v0.1 FBA版初版（SUAVE依存）