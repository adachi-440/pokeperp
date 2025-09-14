## 概要
- 新規/増し玉時の初期証拠金（IM）健全性をスマートコントラクトで強制し、約定後の維持証拠金（MM）チェックを維持しました。
- レバレッジ境界（E2E）テストを PerpEngine 直呼び／OrderBook 経路の両方で追加し、IM/MM 境界・出金ガード・反対売買によるデレバ許容などを網羅的に検証しました。
- デプロイスクリプトの引数取り違え（`maxLeverage` を `contractSize` に誤適用）を修正しました。
- プロトコルで `maxLeverage` を保持する案（選択肢1）は不採用とし、選択肢2（UI/運用で IMR から導出）に統一しました。

## 背景 / 課題
- これまで約定後の MM 健全性のみが強制されており、新規/増し玉時の IM 健全性が未強制でした。結果として IM 不足の高レバレッジ建玉が成立し得る状態でした。
- また、`DeployComplete.s.sol` で RiskEngine コンストラクタ第6引数に `maxLeverage` を渡しており、`contractSize` 不一致による IM/MM/UPnL 計算の破綻リスクがありました。

## 変更点（スマートコントラクト）
- RiskEngine.sol
  - `requireHealthyIM(address)` を追加。`equity(user) >= initialMargin(user)` を強制（revert: `im-breach`）。
  - 既存の `requireHealthyMM(address)` は現状維持。
- PerpEngine.sol
  - `applyFill` 内で約定適用前後のサイズを比較し、絶対サイズが増加（新規/増し玉）した場合のみ `risk.requireHealthyIM(user)` を実行。
  - その後、従来どおり `risk.requireHealthyMM(user)` を常に実行。
  - 反対売買によるデレバ（絶対サイズ減少）やクローズは IM 不足でも許容（MM は要維持）。
- Vault.sol
  - 既存の `withdraw` IM ガード（出金後 `equity - amount >= IM`）を継続。
- DeployComplete.s.sol / Deploy.s.sol
  - `RiskEngine` コンストラクタに `contractSize` を正しく渡すよう修正。
  - `Deploy.s.sol` のコメントを "contract size" に修正（以前の “leverage factor” は誤解の元）。
- 選択肢2に統一（maxLeverage は UI/運用で導出）
  - 途中追加した `maxLeverage` 関連コードは撤回し、プロトコルでは IMR/MMR のみを保持します。

## 変更点（テスト）
- 追加: `contract/test/E2E_LeverageGuards.t.sol`（PerpEngine 直呼び）
  - 10x（IMR=10%, MMR=5%）／5x（IMR=20%, MMR=10%）
  - 建玉 → 出金（IM ガードで拒否） → 増し玉（IM 不足で拒否）
- 追加: `contract/test/E2E_LeverageGuards_OrderBook.t.sol`（OrderBook 経路）
  - SettlementHook 経由で同様の境界パターンを検証。
  - オートマッチが 2 本目 `place()` のトランザクション内で発火し revert するため、`vm.expectRevert()` は 2 本目 `place()` に付与。
  - 初回建玉時の境界で丸め誤差を避ける目的で、入金を `1001 * 1e18`、出金は `2 * 1e18` に設定。
- 調整: 既存テストの整合性修正
  - `RiskEngine.t.sol`: MM 境界／IM 増し玉 revert の前提を IM 導入後仕様に合わせて調整。
  - `Vault.t.sol`: 出金 IM ガードの検証を IM 導入後の前提に合わせて調整。

## 追加した境界パターンのポイント
- 価格変動後の MM 境界: マーク価格を変動させ、`equity < MM` に落ち込むパスで `mm-breach` を確認。
- 反対売買によるデレバ: 反対方向の約定で絶対ポジションを縮小する際は IM 不足でも可（MM は要維持）であることを確認。
- 出金ガード: 建玉直後（equity ≒ IM）における出金が `im-guard` で拒否されることを確認。

## 仕様への反映（book/spec.md）
- RiskEngine の項目に IM/MM の強制条件を明文化：
  - 新規/増し玉後（applyFill 後）の `equity >= IM` 強制、維持での `equity >= MM` 強制。
  - 出金時は `equity - amount >= IM`、反対売買/デレバは IM 不要（MM は要維持）。
- デプロイ順序の RiskEngine 項目から「上限」を削除（`IMR/MMR` のみ）。
- 主要パラメータ例から `maxLeverage` を削除し、「UI/運用側で `maxLev ≒ 1/IMR` から導出」と注記。

## 互換性 / 移行
- RiskEngine/PerpEngine/Vault の公開 API は後方互換（`requireHealthyIM` の追加のみ）。
- 既存のデプロイスクリプトは `contractSize` の誤設定を修正し、実運用時の計算破綻リスクを低減。

## テスト結果
- `cd contract && forge test -vv`
- 合計 63 tests passed, 0 failed

## 確認観点（レビュア向け）
- IM チェックの適用タイミング（applyFill 後／増し玉時のみ）が要件に合致しているか。
- OrderBook 経路の増し玉失敗時（2 本目 place()）の revert 期待位置について妥当か。
- 仕様（book/spec.md）更新の表現がチーム内用語に合っているか。

## 変更ファイル（主なもの）
- contract/src/risk/RiskEngine.sol
- contract/src/perp/PerpEngine.sol
- contract/script/DeployComplete.s.sol
- contract/script/Deploy.s.sol
- contract/test/E2E_LeverageGuards.t.sol（新規）
- contract/test/E2E_LeverageGuards_OrderBook.t.sol（新規）
- contract/test/RiskEngine.t.sol
- contract/test/Vault.t.sol
- book/spec.md（仕様反映）
