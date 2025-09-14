# E2E Trading Flow Test Specification

## 概要
Perpetual取引システムの完全なEnd-to-Endテストを実装する。ローカルのAnvilノードを使用して、実際の取引フローをシミュレートする。

## テスト環境
- **ネットワーク**: Anvil (ローカルEthereumノード)
- **Solidity バージョン**: 0.8.29
- **テストフレームワーク**: Foundry (Forge)

## テストシナリオ

### 1. 証拠金の入金 (Deposit Collateral)
**目的**: ユーザーが取引に必要な証拠金を入金できることを確認

**手順**:
1. 買い手アカウントから`Vault`コントラクトに証拠金を入金
2. 売り手アカウントから`Vault`コントラクトに証拠金を入金
3. 両アカウントの残高を確認

**検証項目**:
- 入金額が正しく記録されること
- `vault.collateral(address)`で正しい残高が取得できること

### 2. オラクル価格の更新 (Update Oracle Price)
**目的**: 価格オラクルが正しく更新され、システムに反映されることを確認

**手順**:
1. `MockOracleAdapter`を使用して新しい価格を設定
2. 設定した価格が正しく反映されているか確認

**検証項目**:
- `oracle.getSyntheticPrice()`が更新後の価格を返すこと
- 価格更新がOrderBookの取引判定に影響すること

### 3. 注文の発注 (Place Orders)
**目的**: 買い注文と売り注文が正しく発注できることを確認

**手順**:
1. 買い手が買い注文を発注（レバレッジなし）
2. 売り手が売り注文を発注（レバレッジなし）

**パラメータ**:
- **注文タイプ**: 指値注文
- **数量**: 10単位
- **価格**: オラクル価格と同じ（スリッページなし）
- **レバレッジ**: 1倍（レバレッジなし）

**検証項目**:
- 注文IDが正しく生成されること
- 注文情報（trader, isBid, price, qty）が正しく記録されること
- OrderBookの`bestBidPrice`と`bestAskPrice`が更新されること

### 4. 注文の約定 (Execute Orders)
**目的**: マッチング可能な注文が正しく約定されることを確認

**手順**:
1. `OrderBook.matchAtBest()`を呼び出して注文をマッチング
2. 約定後のポジションを確認
3. 約定後の証拠金残高を確認

**検証項目**:
- 買い注文と売り注文が正しくマッチングされること
- `PerpEngine`にポジションが正しく記録されること
- 約定した注文が`OrderBook`から削除または数量が減少すること
- 証拠金が適切に調整されること

## コントラクト構成

### 必要なコントラクト
1. **Vault**: 証拠金管理
2. **RiskEngine**: リスク管理とポジション検証
3. **PerpEngine**: Perpetualポジション管理
4. **OrderBookMVP**: 注文管理とマッチング
5. **MockOracleAdapter**: 価格フィード（テスト用）

### 初期設定パラメータ
```solidity
// 証拠金
INITIAL_COLLATERAL = 100,000 tokens (100_000e18)

// 価格設定
INITIAL_PRICE = 2000 (2000e18)

// OrderBook設定
MIN_QTY = 1 unit (1e18)
MIN_NOTIONAL = 100 (100e18)
DEVIATION_LIMIT = 5% (5e16)

// RiskEngine設定
INITIAL_MARGIN_RATIO = 10% (0.1e18)
MAINTENANCE_MARGIN_RATIO = 5% (0.05e18)
LIQUIDATION_FEE = 1 (1e18)
```

## Anvilローカルノード設定

### 起動コマンド
```bash
anvil --fork-url <RPC_URL> --block-time 1
```

### テスト実行コマンド
```bash
# 単体テスト実行
forge test --match-test test_E2E_TradingFlow -vvv

# Anvilに対してテスト実行
forge test --match-test test_E2E_TradingFlow --rpc-url http://localhost:8545 -vvv
```

## 期待される結果

### 成功条件
1. すべての証拠金入金が成功する
2. オラクル価格が正しく更新される
3. 買い注文と売り注文が正しく発注される
4. 注文が正しくマッチングされ、約定する
5. ポジションが正しく記録される
6. 証拠金残高が適切に更新される

### ログ出力例
```
=== E2E Trading Flow Test ===

--- Step 1: Deposit Collateral ---
Buyer deposited: 100000 tokens
Seller deposited: 100000 tokens

--- Step 2: Update Oracle Price ---
Oracle price updated to: 2100

--- Step 3: Place Orders ---
Buy order placed with ID: 1
  Price: 2100, Quantity: 10 units
Sell order placed with ID: 2
  Price: 2100, Quantity: 10 units

--- Step 4: Execute Orders ---
Best Bid Price: 210000
Best Ask Price: 210000
Matched quantity: 10 units
Buyer position after execution: 10
Seller position after execution: -10
Buy order fully filled
Sell order fully filled
Final buyer collateral: 99790
Final seller collateral: 100210

=== E2E Test Completed Successfully ===
```

## エラーハンドリング

### 想定されるエラーケース
1. **証拠金不足**: 注文に必要な証拠金が不足している場合
2. **最小数量エラー**: 注文数量が`MIN_QTY`未満の場合
3. **最小想定元本エラー**: 注文の想定元本が`MIN_NOTIONAL`未満の場合
4. **価格逸脱エラー**: オラクル価格から`DEVIATION_LIMIT`以上離れた価格での約定
5. **マッチング失敗**: 買値と売値が交差しない場合

## 拡張テストケース（将来実装）

1. **レバレッジ取引テスト**: 2倍、5倍、10倍のレバレッジでの取引
2. **部分約定テスト**: 注文が部分的にのみ約定するケース
3. **複数注文テスト**: 同一ユーザーが複数の注文を発注
4. **強制清算テスト**: 証拠金維持率が閾値を下回った場合の清算
5. **ストレステスト**: 大量の注文と約定を処理
6. **価格変動テスト**: オラクル価格が大きく変動した場合の挙動

## 注意事項

- テスト実行前にAnvilノードが起動していることを確認
- `MockOracleAdapter`はテスト専用であり、本番環境では使用しない
- ガス代の計算はAnvilのデフォルト設定に依存
- タイムスタンプはAnvilの`--block-time`設定に依存