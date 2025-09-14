# オンチェーン FBA Perp — Spec準拠ミニMVP 仕様とTODO

> 目的: Frequent Batch Auction (FBA) 方式を採用した板（CLOB）実装のためのミニMVP仕様と実装TODO。
>
> 前提: 単一マーケット・線形Perp・USDC担保。板と約定はバッチ処理でオンチェーン。Funding/清算は後続拡張。

---

## 1. TL;DR（ミニMVPの範囲）

- 板コア: ヒープ構造による価格優先管理、SUAVEの秘密ストレージ利用
- 操作: `placeOrder`, `cancelOrder`, `executeFills`（バッチ実行）
- ガード: `minQty`, `minNotional`, `deviationLimit(band)`（Index/Mark参照）
- 約定価格: 統一清算価格（bid最高値とask最低値の中間価格）で成立
- 会計/リスク: 本MVPでは板に限定。約定は `FillEvent` を発行し、外部の `SettlementHook` で処理可能
- バッチ間隔: 設定可能な時間間隔（例：5秒、30秒）でバッチ実行
- 非対象: Funding計算・清算ロジック・保険基金の厳密会計・複数マーケット・手数料詳細

---

## 2. コントラクト（MVP）

- FBAOrderBook（本体）
  - 役割: 注文の収集、バッチ処理での約定、ガード適用、イベント発行
  - 依存: `IOracleAdapter`、`FBAHeap`ライブラリ、SUAVE秘密ストレージ、任意の `ISettlementHook`
- IOracleAdapter（IF）
  - `function indexPrice() external view returns (uint256);`
  - `function markPrice() external view returns (uint256);`
- ISettlementHook（任意IF）
  - `function onFill(address buyer, address seller, uint256 price, uint128 qty) external;`
- FBAHeap（ライブラリ）
  - ヒープベースの優先度付きキュー実装
  - SUAVEの秘密ストレージ統合

---

## 3. データモデル（FBA版）

```solidity
struct MarketCfg {
  uint128 minQty;          // 最小数量
  uint256 minNotional;     // 最小ノーション（qty * price）
  uint256 deviationLimit;  // band (1e18 = 100%)
  uint256 contractSize;    // 1サイズあたりの$換算係数
  uint256 batchInterval;   // バッチ実行間隔（秒）
}

// FBAHeapライブラリ内で定義
struct Order {
  uint256 price;           // 価格
  uint256 amount;          // 数量
  bool side;              // true=Bid, false=Ask
  string orderId;         // ユニークID
}

struct Fill {
  uint256 price;          // 清算価格
  uint256 amount;         // 約定数量
}

struct Cancel {
  string orderId;         // キャンセル対象ID
  bool side;             // 注文サイド
}

// ヒープメタデータ（SUAVE用）
struct ArrayMetadata {
  uint256 length;
  Suave.DataId ref;      // SUAVE秘密ストレージ参照
}

struct MapMetadata {
  Suave.DataId ref;      // SUAVE秘密ストレージ参照
}
```

- ストレージ:
  - `Suave.DataId bidArrayRef/askArrayRef` (ヒープ配列の参照)
  - `Suave.DataId bidMapRef/askMapRef` (orderId→インデックスマップの参照)
  - `Fill[] fills` (現在のバッチの約定リスト)
  - `Cancel[] cancels` (保留中のキャンセルリスト)
  - `MarketCfg cfg`
  - `address settlementHook`（任意）
  - `uint256 lastBatchTime` (最後のバッチ実行時刻)

---

## 4. 外部関数（挙動）

- **placeOrder(Order memory ord)**
  - ガード: `ord.amount >= cfg.minQty`, `ord.amount * ord.price >= cfg.minNotional`
  - ヒープへの挿入（買い注文は最大ヒープ、売り注文は最小ヒープ）
  - `emit OrderPlace(price, amount, side)`
  - 即座の約定は発生しない（次回バッチまで待機）

- **cancelOrder(string orderId, bool side)**
  - キャンセルリストに追加（即座の削除ではない）
  - `emit OrderCancel(orderId, side)`
  - 実際の削除は次回バッチ実行時

- **executeFills()**
  - 実行条件: `block.timestamp >= lastBatchTime + batchInterval`
  - 処理順序:
    1. キャンセル処理（優先実行）
    2. 清算価格計算: `clearingPrice = (bidMax.price + askMin.price) / 2`
    3. bandチェック: `|clearingPrice - index|/index <= cfg.deviationLimit`
    4. 約定条件: `bidMax.price >= clearingPrice && askMin.price <= clearingPrice`
    5. 統一価格での約定処理
  - `emit FillEvent(Fill)` 各約定ごと
  - SettlementHook設定時は `onFill` を呼び出し
  - `lastBatchTime` 更新

- **initFBA()**
  - SUAVEストレージの初期化
  - ヒープ構造のセットアップ

- view系
  - `getTopOrder(side)`: 最良気配取得
  - `getTopOrderList(threshold, side)`: 閾値以上/以下の注文リスト

---

## 5. イベント

- `OrderPlace(uint256 price, uint256 amount, bool side)`
- `OrderCancel(string orderId, bool side)`
- `FillEvent(Fill fill)`
- `BatchExecuted(uint256 timestamp, uint256 fillCount)`

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

---

## 8. パラメータ管理

- 初期化: `cfg = {minQty, minNotional, deviationLimit, contractSize, batchInterval}`
- 更新: オーナー権限で `setBatchInterval`, `setMinQty`, `setMinNotional`, `setDeviationLimit`
- 緊急停止: `pauseBatch()`でバッチ実行を停止（注文受付は継続可）

---

## 9. ガス/セキュリティ設計ノート

- O(log n): ヒープ操作による効率的な最良気配管理
- SUAVE統合: 秘密ストレージによるMEV耐性強化
- バッチ処理: ガス効率の向上（複数約定を1トランザクション）
- DoS対策: `minNotional`, `minQty`、バッチサイズ上限
- Reentrancy: `executeFills`に`nonReentrant`必須

---

## 10. CLOB→FBA移行の主要変更点

| 項目 | CLOB | FBA |
|------|------|-----|
| 約定タイミング | 即座 | バッチ間隔ごと |
| 価格決定 | Resting側価格 | 統一清算価格 |
| データ構造 | 双方向リンクリスト | ヒープ |
| キャンセル | 即座実行 | 次回バッチで処理 |
| MEV耐性 | 低 | 高（バッチ処理） |
| ストレージ | 通常 | SUAVE秘密ストレージ |

---

## 11. 実装TODO（チェックリスト）

- [ ] SUAVE環境のセットアップと秘密ストレージ初期化
- [ ] FBAHeapライブラリの統合とテスト
- [ ] `placeOrder`実装（ヒープ挿入、ガード適用）
- [ ] `cancelOrder`実装（キャンセルキュー管理）
- [ ] `executeFills`実装:
  - [ ] バッチ間隔チェック
  - [ ] キャンセル処理
  - [ ] 清算価格計算
  - [ ] band判定
  - [ ] 統一価格での約定処理
- [ ] Oracle統合（band計算用）
- [ ] SettlementHook インターフェース実装
- [ ] view関数群の実装
- [ ] アクセス制御とパラメータ更新機能
- [ ] 単体テスト:
  - [ ] バッチ間隔の動作確認
  - [ ] 清算価格計算の正確性
  - [ ] キャンセル優先処理
  - [ ] band拒否ケース
- [ ] ガス最適化とベンチマーク

---

## 12. 将来の拡張

- プライバシー強化: SUAVEの完全活用による注文秘匿
- 複数清算価格: より洗練された価格発見メカニズム
- クロスマーケットバッチ: 複数市場の同時清算
- オークション方式の拡張: Vickrey-Clarke-Groves等の導入

---

更新履歴:
- v0.1 FBA版初版（CLOBからの移行仕様）