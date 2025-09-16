# PokePerp 資金調達金利（Funding Rate）設計計画書

本書は、既存I/Fを壊さず、最小差分で Funding を導入するための設計計画です。方針はレビュー確定後に実装します（本書時点では実装しません）。

## 背景
- PokePerp は CLOB で約定し、`PerpEngine` がポジション・実現PnL、`RiskEngine` が証拠金健全性、`Vault` が残高管理を担います。
- 価格は `IOracleAdapter` の `markPrice()`/`indexPrice()`（現行は 1e18 スケール）を使用し、`PerpEngine` の約定価格は `priceTick * tickSize`（tickSize=1e18想定）。
- 既存の `positions(address) -> (size, entryNotional)` ABIに `RiskEngine` が依存しているため、これを変更せずに Funding を追加するのが前提です。

## 問題点
- Funding が無く、`mark` が `index` に係留されにくい。
- Funding PnL をどこで反映するか（Vault 残高へ実現 vs リスク判定で未実現も考慮）。
- オラクル鮮度（stale）やスケール差異への扱い、`index==0` 等の例外ケース。
- 長時間未更新時の catch-up と計算オーバーフロー/精度、丸め誤差（Dust）。
- 既存 I/F 互換（`Position` 構造体を変更しない）。
- セキュリティ（reentrancy/DoS/パラメタ暴発）。

## 提案（B’：RiskEngineで未清算考慮＋重要イベントで実体清算）

### 方針
- 方式Bを採用：`RiskEngine.equity(user)` に `pendingFundingPnL(user)` を加算して常に正確な健全性判定を行う。
- 加えて重要イベント（約定、Withdraw、清算系）では `settleFunding(user)` を呼び、Vault 残高にも反映（方式B’）。
  - Withdrawについては、最小差分の観点から equity 側での反映で十分（Vault 実残高への反映は任意・将来対応）。

### 数式・単位（WAD=1e18）
- 乖離率: `prem = (mark - index) / index`（有符号WAD）を `±maxFundingRatePerInterval` にクリップ。
- 秒あたりFunding率: `ratePerSec = premClamped * fundingMultiplier / fundingIntervalSec`（有符号WAD）。
- 単位サイズ当たりの名目: `notionalPerContract = mark * contractSize / 1e18`（USD/contract, WAD）。
- 蓄積量: `dF = ratePerSec * dt * notionalPerContract / 1e18`（USD/contract, 有符号WAD）。
- ユーザーPnL: `fundingPnL = - position.size * (F_now - F_user)`（size>0 ロングは prem>0 で支払いになる）。
- ゼロサム: ΣPnL = - (Σsize) * ΔF。CLOB 上 Σsize=0 が成り立つため理論上ゼロサム（丸めは微小）。

### PerpEngine の拡張（ストレージとI/F）
- 追加ストレージ（`Position`は変更しない）
  - `int256 cumulativeFundingPerSize`（F, USD/contract, WAD）
  - `uint64 lastFundingTime`
  - `uint256 fundingIntervalSec`（例: 8h=28800）
  - `uint256 maxFundingRatePerInterval`（例: 0.01e18=±1%/interval）
  - `uint256 fundingMultiplier`（例: 1e18）
  - `uint256 maxCatchUpSec`（例: 86400）
  - `uint256 minFundingSettleUsd`（Dust閾値, WAD）
  - `uint256 openInterestAbs`（総OI=Σ|size|。ゼロなら NO_OI でスキップ判断に利用）
  - `mapping(address => int256) userFundingIndex`
- 関数
  - `updateFunding()`：lazy積算。stale/`index==0`/`openInterestAbs==0`（NO_OI）などはスキップして `FundingSkipped(reason)` を emit。
    - スキップ時も `lastFundingTime = now` に進める（stale期間に Funding は発生しない／巨大catch-up防止）。
  - `settleFunding(address user)`：未清算FundingをVaultへ反映（Dust閾値未満なら内部累積に留める）。
  - `previewCumulativeFunding() view`：今秒までの仮積算（状態は書き換えない）。
  - `pendingFundingPnL(address user) view`：`preview` を使って未清算PnLを推定。
  - 既存 `applyFill(...)` の冒頭で `updateFunding()`→`settleFunding(buyer)`→`settleFunding(seller)` を呼んだ後、既存PnL処理→`risk.requireHealthyMM`。
- イベント
  - `FundingUpdated(prem, mark, index, dt, ratePerSec, dF, cumulativeF)`
  - `FundingSkipped(reason)`
    - enum化: `enum SkipReason { STALE, BAD_INDEX, NO_OI, PAUSED }`
  - `FundingSettled(user, pnlWad, settledAmountVaultUnits, cumulativeFAfter)`（WADのPnLとVault単位の反映額の双方を出力）
- パラメタ初期値（推奨）
  - `fundingIntervalSec=8h`、`maxFundingRatePerInterval=±0.5%`（ローンチ時安全寄り）、`fundingMultiplier=1.0`、`maxCatchUpSec=1d`、`minFundingSettleUsd=1e14`（$0.0001相当）。

### RiskEngine の拡張
- 新I/F: `IPerpFundingView { function pendingFundingPnL(address) external view returns (int256); }`
- `equity(user)` に `perp.pendingFundingPnL(user)` を加算して返却（状態変更はしない）。
- 既存の `setLinks` で `perp` を `IPerpFundingView` も実装した `PerpEngine` へ差し替え可能。

### オラクル鮮度・スケール
- スケール：Funding 計算内部で WAD 正規化ヘルパ（現行は1e18想定のため実質no-op）。
- 鮮度：現行 I/F に鮮度関数が無いため、MVPはスキップ戦略（`FundingSkipped("STALE")` を emit）。将来は `IOracleAdapter` に `isFresh()` または `getLatestPrice()` ベースでの `priceAge` 判定を追加。
- `index==0`：revert ではなく skip（DoS回避）。
- スキップ時は `lastFundingTime` を `now` に進める（stale期間にFundingは発生しない保守的挙動）。

### 可観測性（モニタリング用 view）
- `currentFundingRate() external view returns (int256 premClamped, int256 ratePerSec, uint256 notionalPerContract)`
  - `fundingPaused` / `openInterestAbs == 0` / `index == 0` / `!isFresh()` のいずれかで `(0, 0, notionalPerContract)` を返却
  - 通常時は cap 適用後の `premClamped`、`ratePerSec`、`notionalPerContract = mark * contractSize / 1e18` を返す
  - `isFresh()` はアダプタが実装している場合のみ動的に参照

### セキュリティ/運用
- `settleFunding` は非再入保護（nonReentrant）とし、`vault.credit/debit` は最後に最小回数で実行。
- `updateFunding` は誰でも呼べる前提で冪等・軽量化。`maxCatchUpSec` と cap で上限化。
- `setFundingParams(...)` は一括更新＋ `FundingParamsUpdated(...)` emit。運用は Timelock/二段階推奨。
- 丸め：WAD→Vault単位の変換は `mulDiv` で中立（切り捨て）に統一し、繰り返しの `settle` で利ざやが生じないことをテストで保証。
- Withdraw 判定は `RiskEngine.equity(user)` が `pendingFundingPnL` を加味するため、即時 `settle` が無くても一貫性が保たれる（今回のスコープでは即時 `settle` は任意）。
- Keeper 運用：`updateFunding()` は誰でも呼べる設計のまま、オフチェーンで毎分程度の呼び出しを推奨（stale時はスキップのみ）。

## 期待される変更
- `PerpEngine`
  - 追加ストレージ・パラメタ setter・イベントの実装。
  - `updateFunding`/`settleFunding`/`preview`/`pendingFundingPnL` の実装。
  - `applyFill` の冒頭に Funding 処理を組み込み（約定前に清算→PnL→MM）。
  - 既存 `Position` 構造体は変更しない（ABI互換）。
- `RiskEngine`
  - `IPerpFundingView` を参照し、`equity` に `pendingFundingPnL(user)` を加算。
  - 既存の IM/MM 計算はそのまま。
- `Vault`
  - 最小差分では変更不要（equity 側で未清算が反映）。将来的に UX 向上のため Withdraw 直前に `perp.settleFunding(msg.sender)` を呼ぶ選択肢あり。
- `Oracle`
  - 現状維持。将来は鮮度I/F追加を検討。

## テストの内容（拡張）
- 単体（PerpEngine Funding）
  - `updateFunding`：prem 正/負、cap 作用、`dt=maxCatchUpSec`、`index==0`/stale スキップ、イベント値検証。
  - `settleFunding`：ロング/ショートで符号が期待通り、Dust 閾値未満で Vault 非更新、閾値超で更新。
  - `pendingFundingPnL`/`preview`：view で正しい推定が返る（状態非変更）。
- 統合
  - `applyFill` 前清算→実現PnL→MM の順序検証（境界での revert 期待値）。
  - 複数ユーザー・複数サイズで期間経過→Σ fundingPnL ≈ 0（±1 wei 内）。
  - スケール正規化差異（将来Adapter差異がある場合の回帰）。
- 回帰系
  - 長期stale→復帰：stale中は `FundingSkipped` が出て `lastFundingTime` が進み、復帰後に巨大catch-upが起きない。
  - Dust跨ぎ：Dust未満の積み上げが閾値到達で1回のVault反映になり、累積誤差が残らない。
- RiskEngine
  - `equity` が未清算Fundingを加算して一貫（IM/MM 境界での通過/失敗）。
- E2E
  - 価格シナリオに沿った Funding 蓄積と清算、Withdraw/Deposit と併用時の一貫性。
- ガス
  - `updateFunding`/`settleFunding` 多発時でも許容内。Dust 抑制で Vault 呼び出し最小化。

## 実装タスク分割（実装・テスト指向）
1) 設定・定数・イベント
- `PerpEngine` に funding 用ストレージ・初期化・`setFundingParams(...)`・`FundingParamsUpdated(...)` を追加。

2) 数学ヘルパと正規化
- WAD 正規化ヘルパ（現行はno-opだが将来互換）と `clamp` 実装。mulDiv（OZ Math）を導入して丸めを統一。

3) Funding 主要ロジック
- `updateFunding()`：価格取得→prem→clamp→rate→dF→累積→イベント。stale/`index==0` は skip。
- `settleFunding(user)`：`updateFunding`→`delta`→`pnl`→Dust 閾値判定→Vault 反映→インデックス更新→イベント。
- `previewCumulativeFunding()`/`pendingFundingPnL(user)` を view 実装。

4) 既存フローへの組込み
- `PerpEngine.applyFill(...)` の冒頭に `updateFunding`/`settleFunding(buyer/seller)` を追加。

5) RiskEngine 連携
- `IPerpFundingView` 追加。`RiskEngine.equity(user)` に `perp.pendingFundingPnL(user)` を加算。

6) テスト追加
- 単体：Funding数式・cap・catch-up・Dust・skip。
- 統合：applyFill連動・ゼロサム・境界MM・スケール差。
- E2E：価格シナリオ・Withdraw/Depositと併用。

7) 運用・パラメータ
- 初期は `±0.5%/8h`、安定後 `±1%/8h` へ。監視は `FundingUpdated/FundingSkipped` をトリガに設置。Keeper 運用をRunbook化。

8) ドキュメント
- 本書をルートに、パラメタ変更手順、監視Runbook、異常時のオペ（index==0/stale多発）を追記。

9) OI 補助（任意）
- 総OI（`openInterestAbs`）の更新ロジックを `_apply` に組み込み（`abs(newSize) - abs(prevSize)` を加算）。
- 監視用に `getGlobalNetSize()` を view で公開（任意）。

---

本計画は「既存I/Fを壊さずに Funding を最小差分で追加」を核とし、B’（RiskEngineでの未清算反映＋イベント時実清算）で安全性・整合性・UX のバランスを取ります。レビューで方針・パラメータ・鮮度扱いが確定次第、上記タスク順に実装へ移行します。
