# CLOB → FBA 仕様変更点まとめ

> 作成日: 2025-09-14
>
> 本ドキュメントは、CLOB方式（`spec_mini_mvp.md`）からFBA方式（`spec_mini_mvp_fba.md`）への変更点、およびそれに伴うフロントエンド・Oracle仕様の変更点をまとめたものです。

---

## 1. OrderBook（板）仕様の変更点

### 1.1 約定メカニズムの根本的変更

| 項目 | CLOB（spec_mini_mvp.md） | FBA（spec_mini_mvp_fba.md） |
|------|---------------------------|------------------------------|
| **約定タイミング** | 即座（注文時にクロスがあれば即約定） | バッチ間隔ごと（例：5秒、30秒） |
| **価格決定** | Resting側価格（受け側の指値） | 統一清算価格 `(bidMax + askMin) / 2` |
| **約定処理** | `matchAtBest(stepsMax)` で段階的 | `executeFills()` で一括処理 |
| **MEV耐性** | 低（先着順） | 高（バッチ処理 + SUAVE秘密ストレージ） |

### 1.2 データ構造の変更

**CLOB:**
```solidity
struct Level {
  uint64  head;      // 双方向リンクリスト
  uint64  tail;
  uint128 totalQty;
}
struct Order {
  uint64  id;
  address trader;
  uint64  priceTick;
  uint128 qty;
  bool    isBid;
  uint64  prev;      // リンクリスト用
  uint64  next;
}
```

**FBA:**
```solidity
struct Order {
  uint256 price;     // tickSize統合済み
  uint256 amount;
  bool side;
  string orderId;    // ユニークID（UUIDなど）
}
// ヒープ構造（優先度付きキュー）
// SUAVEの秘密ストレージ参照
Suave.DataId bidArrayRef;
Suave.DataId askArrayRef;
```

### 1.3 キャンセル処理

| 項目 | CLOB | FBA |
|------|------|-----|
| **実行タイミング** | 即座に板から削除 | 次回バッチで処理 |
| **処理優先度** | 通常 | バッチ実行時にキャンセルを優先処理 |
| **データ構造** | 直接削除 | `Cancel[]` 配列に保持 |

### 1.4 関数インターフェースの変更

**CLOB:**
```solidity
function place(bool isBid, uint64 priceTick, uint128 qty) returns (uint64 id);
function cancel(uint64 id);
function matchAtBest(uint256 stepsMax);
```

**FBA:**
```solidity
function placeOrder(Order memory ord) returns (bytes memory);
function cancelOrder(string orderId, bool side) returns (bytes memory);
function executeFills() returns (bytes memory);
function initFBA() returns (bytes memory); // SUAVE初期化
```

### 1.5 新規追加要素（FBA）

- **バッチ間隔管理**: `batchInterval`, `lastBatchTime`
- **SUAVE統合**: 秘密ストレージによるMEV保護
- **コールバックパターン**: SUAVE環境での非同期処理対応

---

## 2. Frontend仕様の変更点

### 2.1 UI/UXの根本的変更

| 要素 | CLOB Frontend | FBA Frontend |
|------|---------------|--------------|
| **注文反映** | 即座に板に表示 | 「保留中」として表示、バッチ後に確定 |
| **価格表示** | Bid/Ask個別価格 | 予想清算価格も表示 |
| **ステータス** | 約定済/未約定 | 保留中/バッチ待機/約定済 |
| **実行ボタン** | なし（自動マッチ） | 「Execute Batch」ボタン（誰でも実行可） |

### 2.2 新規UI要素（FBA専用）

```typescript
// バッチステータスパネル
interface BatchStatus {
  nextBatchTime: number;        // 次回バッチまでの時間
  timeRemaining: number;         // カウントダウン
  pendingOrderCount: number;     // 保留中の注文数
  pendingCancelCount: number;    // 保留中のキャンセル数
  estimatedClearingPrice: bigint; // 予想清算価格
  canExecute: boolean;           // バッチ実行可能か
}
```

### 2.3 注文ステータスの拡張

**CLOB:**
- Active（板に存在）
- Filled（約定済）
- Cancelled（キャンセル済）

**FBA:**
- **Pending**（バッチ待機中）
- **Cancel Pending**（キャンセル待機中）
- Filled at Uniform Price（統一価格で約定）
- Cancelled（処理済）
- Partial（部分約定）

### 2.4 リアルタイム更新戦略

| 項目 | CLOB | FBA |
|------|------|-----|
| **更新頻度** | 即座（イベント駆動） | バッチサイクルごと |
| **同期方法** | 個別イベント処理 | バッチ実行後に一括同期 |
| **予測表示** | なし | 予想清算価格の継続計算 |

### 2.5 エラーハンドリング

**FBA特有のエラー:**
```typescript
// バッチ未到達
"Batch interval not reached"
// 空バッチ
"No orders to match"
// band違反（清算価格）
"Clearing price outside deviation band"
```

---

## 3. Oracle仕様の変更点

### 3.1 価格更新タイミング

| 項目 | CLOB Oracle | FBA Oracle |
|------|-------------|------------|
| **更新戦略** | 定期更新（heartbeat以内） | バッチ実行前に同期更新 |
| **優先度** | 一定間隔 | バッチ実行の5-10秒前に集中 |
| **用途** | band判定（即座） | 清算価格のband判定（バッチ時） |

### 3.2 FBA専用の同期機能

```typescript
// バッチタイミング監視
async function syncWithBatch(fbaContract, oracleContract) {
    const batchInterval = await fbaContract.batchInterval();
    const lastBatchTime = await fbaContract.lastBatchTime();

    // 次回バッチ実行時刻を計算
    const nextBatch = lastBatchTime + batchInterval;
    const updateTime = nextBatch - PRICE_UPDATE_OFFSET_SEC;

    // スケジュール設定
    scheduleUpdate(updateTime, async () => {
        await pushPriceUpdate(oracleContract);
    });
}
```

### 3.3 環境変数の追加（FBA）

```bash
# CLOB版にはない設定
FBA_ADDRESS=0x...              # FBAOrderBookアドレス
BATCH_INTERVAL_SEC=30          # バッチ間隔
PRICE_UPDATE_OFFSET_SEC=5      # バッチ何秒前に更新
```

### 3.4 イベント監視

**FBA追加:**
```typescript
// バッチ実行イベントを監視
fba.on('BatchExecuted', async (timestamp, fillCount) => {
    // 次回バッチに向けて価格更新スケジュールを調整
    scheduleNextUpdate();
});
```

---

## 4. 全体アーキテクチャの変更

### 4.1 処理フロー比較

**CLOB:**
```
1. 注文発注 → 即座にマッチング試行
2. クロスがあれば即約定
3. なければ板に追加
4. 誰かがmatchAtBestを呼ぶまで待機
```

**FBA:**
```
1. 注文発注 → 保留リストに追加
2. バッチ間隔まで待機
3. executeFills()実行時に：
   a. キャンセル処理（優先）
   b. 清算価格計算
   c. 統一価格で一括約定
4. 次のバッチサイクル開始
```

### 4.2 ガス効率

| 項目 | CLOB | FBA |
|------|------|-----|
| **注文時** | 高（即マッチング処理） | 低（ヒープ挿入のみ） |
| **約定時** | 段階的（stepsMax制限） | バッチで一括（効率的） |
| **データ構造** | 双方向リンクリスト | ヒープ（O(log n)） |

### 4.3 MEV保護

| 項目 | CLOB | FBA |
|------|------|-----|
| **フロントランニング** | 脆弱 | バッチ処理で緩和 |
| **サンドイッチ攻撃** | 可能 | 統一価格で防止 |
| **秘匿性** | なし | SUAVE秘密ストレージ |

---

## 5. パラメータ管理の変更

### 5.1 新規パラメータ（FBA）

```solidity
struct MarketCfg {
    // CLOBと共通
    uint128 minQty;
    uint256 minNotional;
    uint256 deviationLimit;
    uint256 contractSize;

    // FBA専用
    uint256 batchInterval;    // バッチ実行間隔（秒）
}
```

### 5.2 運用パラメータ

| パラメータ | CLOB | FBA |
|-----------|------|-----|
| **stepsMax** | あり（DoS対策） | 不要（バッチ処理） |
| **batchInterval** | なし | 必須（例：30秒） |
| **緊急停止** | place/match停止 | バッチ実行停止 |

---

## 6. イベントの変更

### 6.1 イベント比較

| イベント | CLOB | FBA |
|----------|------|-----|
| **注文** | `OrderPlaced` | `OrderPlace`（簡略化） |
| **キャンセル** | `OrderCancelled`（即座） | `OrderCancel`（保留） |
| **約定** | `TradeMatched` | `FillEvent` + `BatchExecuted` |

### 6.2 FBA専用イベント

```solidity
event BatchExecuted(uint256 timestamp, uint256 fillCount);
```

---

## 7. テスト・開発への影響

### 7.1 テスト戦略

| 項目 | CLOB | FBA |
|------|------|-----|
| **単体テスト** | 即座の約定確認 | バッチサイクル考慮 |
| **時間依存** | 低 | 高（batchInterval） |
| **複雑度** | 中 | 高（SUAVE統合） |

### 7.2 開発環境

**FBA追加要件:**
- SUAVE対応ネットワーク（または通常実装への変更）
- バッチタイミングのシミュレーション
- 清算価格計算の検証

---

## 8. 移行ガイドライン

### 8.1 CLOB → FBA移行チェックリスト

- [ ] データ構造をヒープベースに変更
- [ ] 即座約定ロジックをバッチ処理に変更
- [ ] キャンセルを遅延処理に変更
- [ ] 統一清算価格計算を実装
- [ ] SUAVE統合（または代替実装）
- [ ] フロントエンドにバッチUIを追加
- [ ] Oracleにバッチ同期機能を追加

### 8.2 互換性の考慮事項

- イベント名の変更に注意
- 注文IDの型変更（uint64 → string）
- 価格単位の統一（priceTick × tickSize → price）

---

## まとめ

CLOB方式からFBA方式への変更は、取引の実行モデルを根本的に変更するものです。主な利点：

1. **MEV耐性の向上**: バッチ処理と統一価格により公平性向上
2. **ガス効率**: バッチ処理による効率化
3. **価格発見**: より安定した価格形成

トレードオフ：

1. **即時性の低下**: バッチ間隔まで待機
2. **複雑性の増加**: SUAVE統合、バッチ管理
3. **UXの変化**: ユーザーは新しい取引フローに適応必要