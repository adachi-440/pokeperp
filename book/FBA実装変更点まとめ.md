# FBA実装 - 仕様からの変更点まとめ

> 作成日: 2025-09-14
>
> 本ドキュメントは、`spec_mini_mvp_fba.md`の仕様から実際の実装（`FBA.sol`、`FBAHeap.sol`）への変更点をまとめたものです。

---

## 1. 主要な技術的変更

### 1.1 SUAVE依存の完全削除

**仕様（spec_mini_mvp_fba.md）:**
- SUAVEの秘密ストレージを使用してMEV耐性を実現
- `Suave.DataId`による参照管理
- `confidentialStore`/`confidentialRetrieve`によるデータ管理

**実装:**
- **通常のSolidity storage変数を使用**
- SUAVEライブラリへの依存を完全に削除
- 標準的なEVM環境でのデプロイが可能

```solidity
// 仕様での想定
Suave.DataId public askArrayRef;
Suave.DataId public bidArrayRef;

// 実装
FBAHeap.Heap private bidHeap;  // 通常のstorage変数
FBAHeap.Heap private askHeap;
```

### 1.2 データ構造の簡略化

**仕様:**
- ArrayMetadataとMapMetadataの分離管理
- SUAVEの秘密ストレージAPIを通じた間接アクセス

**実装:**
- `Heap`構造体に統合
- 直接的なstorage操作

```solidity
// 実装でのHeap構造体
struct Heap {
    Order[] orders;                              // ヒープ配列
    mapping(string => uint256) orderIdToIndex;   // orderId → インデックスのマッピング
}
```

---

## 2. 機能面の変更

### 2.1 初期化処理

**仕様:**
- `initFBA()`関数によるSUAVEストレージの初期化が必要

**実装:**
- **初期化関数は不要**（storage変数は自動初期化）
- コンストラクタも不要（シンプルな実装）

### 2.2 コールバック関数

**仕様:**
- SUAVEのコールバックパターン（`placeOrderCallback`、`executeFillsCallback`等）

**実装:**
- **コールバック関数を削除**
- 直接的な関数実行モデル

### 2.3 エラーハンドリング

**仕様:**
- try-catchによるエラーハンドリング

**実装:**
- 内部関数のため、条件チェックによる事前検証
```solidity
// 注文が存在するかチェックしてから削除
if (bidHeap.orderIdToIndex[orderId] > 0) {
    FBAHeap.deleteOrder(orderId, ISBUY, bidHeap);
}
```

---

## 3. 追加された機能

### 3.1 View関数の充実

実装では以下のview関数を追加：
- `getTopBid()` - 最良買い注文の取得
- `getTopAsk()` - 最良売り注文の取得
- `getBidsAboveThreshold(uint256)` - 閾値以上の買い注文リスト
- `getAsksBelowThreshold(uint256)` - 閾値以下の売り注文リスト
- `getFills()` - 現在の約定リスト
- `getPendingCancels()` - 保留中のキャンセルリスト

### 3.2 ヒープ操作の最適化

- インデックスマッピングに+1オフセットを使用（0を「存在しない」として扱う）
- 削除時の要素移動を最適化

---

## 4. 削除された要素

### 4.1 MEV保護機能

**仕様:**
- SUAVEによる秘匿性とMEV耐性

**実装:**
- SUAVEを使用しないため、この保護機能は実装されていない
- バッチオークション自体のMEV耐性は維持

### 4.2 複雑な初期化フロー

**仕様:**
- addressListの管理
- ANYALLOWED定数の使用

**実装:**
- これらの概念は不要となり削除

---

## 5. 互換性の維持

### 5.1 コアロジックの保持

以下の中核機能は仕様通り実装：
- FBA（Frequent Batch Auction）のバッチ処理
- 統一清算価格の計算（`(bidMax + askMin) / 2`）
- キャンセル優先処理
- 価格優先・時間優先のヒープ構造

### 5.2 イベント

仕様で定義されたイベントは全て維持：
- `OrderPlace(uint256 price, uint256 amount, bool side)`
- `OrderCancel(string orderId, bool side)`
- `FillEvent(Fill)`

---

## 6. 利点と制約

### 利点
1. **シンプルな実装** - 複雑なSUAVE統合が不要
2. **標準環境対応** - 通常のEVM/Solidityツールチェーンで動作
3. **テスト容易性** - Hardhat/Foundryで簡単にテスト可能
4. **ガス効率** - 直接的なstorage操作により効率的

### 制約
1. **MEV保護の低下** - SUAVEの秘匿性機能なし
2. **スケーラビリティ** - 全データがオンチェーンに保存される

---

## 7. デプロイと運用への影響

### 7.1 デプロイ要件の変更

**仕様:**
- SUAVE対応ネットワークが必要

**実装:**
- **任意のEVM互換チェーンにデプロイ可能**
- Ethereum、Arbitrum、Base等で動作

### 7.2 運用の簡素化

- 特別な初期化手順が不要
- 標準的なコントラクト管理ツールを使用可能

---

## 8. 今後の拡張可能性

現在の実装は以下の拡張が容易：

1. **Oracle統合** - bandチェック用のprice feed
2. **Settlement Hook** - 清算・決済処理の追加
3. **アクセス制御** - オーナー権限、一時停止機能
4. **バッチ間隔管理** - 動的なバッチ実行タイミング
5. **手数料メカニズム** - maker/taker手数料の実装

---

## 9. 移行ガイド

### 仕様ベースのコードから実装への移行

1. **import文の変更**
   ```solidity
   // Before
   import "suave-std/suavelib/Suave.sol";

   // After
   import {FBAHeap} from "./FBAHeap.sol";
   ```

2. **初期化処理の削除**
   - `initFBA()`の呼び出しは不要

3. **関数シグネチャの調整**
   - コールバック関数の削除
   - 直接的な関数呼び出しパターンへ

---

## まとめ

本実装は、FBAの中核的な機能を維持しながら、SUAVE依存を削除することで、より汎用的で実用的なソリューションとなりました。MEV保護のトレードオフはありますが、標準的な開発・運用プロセスに適合し、即座にデプロイ可能な状態です。