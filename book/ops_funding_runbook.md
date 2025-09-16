# Funding 運用ランブック（PokePerp）

このドキュメントは、資金調達金利（Funding）の本番運用における手順・監視・異常対応のガイドです。

## 目的
- Funding の連続性と安全性を担保しつつ、マーク価格をインデックスへ係留する圧力を適切に維持する。
- オラクル異常・高ボラ・設定変更時のオペリスクを最小化する。

## 主要コントラクトとI/F
- `PerpEngine`
  - 更新: `updateFunding()`（誰でも呼べる）
  - 停止/再開: `setFundingPaused(bool)`（onlyOwner）
  - パラメタ更新（即時）: `setFundingParams(...)`（onlyOwner）
  - パラメタ更新（スケジュール）: `scheduleFundingParams(..., eta)` → `executeScheduledFundingParams()`（onlyOwner）
  - 監視向けview: `currentFundingRate() -> (premClamped, ratePerSec, notionalPerContract)`
  - 参考view: `openInterestAbs`, `cumulativeFundingPerSize`, `lastFundingTime`
- `RiskEngine`
  - `equity()` は `pendingFundingPnL` を加算（方式B’）。

## 運用スケジュール（Keeper）
- 頻度: 60秒毎に `PerpEngine.updateFunding()` を呼び出す。
  - 目安: 30〜90秒の範囲で分散させても可。
- 期待挙動:
  - OI=0 / stale / index==0 / paused の場合は `FundingSkipped(reason)` をemitしつつ `lastFundingTime` が進む。
  - 有効時は `FundingUpdated(...)` がemitされ、`cumulativeFundingPerSize` が更新される。

## 監視メトリクス
- `FundingSkipped` の内訳（enum SkipReason）
  - `STALE`: オラクルが鮮度要件を満たしていない
  - `BAD_INDEX`: index=0（DoS回避のためスキップ）
  - `NO_OI`: 総OI=0（Fundingは停止状態）
  - `PAUSED`: 手動停止中
- `cap到達率`
  - `currentFundingRate()` の `premClamped` がしばしば上限/下限に張り付く場合、パラメタ見直しを検討。
- `ΣPnL≈0` 不変監視
  - 任意でオフチェーン集計し、一定窓でゼロサムからの乖離が大きい場合は調査。
- `lastFundingTime` と壁時計の乖離
  - Keeper停止やチェーン停止兆候の早期検知。

## パラメタ運用ガイド
- 初期設定（推奨）
  - `fundingIntervalSec = 8h`
  - `maxFundingRatePerInterval = ±0.5%`（安定化後に±1%へ引上げ検討）
  - `fundingMultiplier = 1.0`
  - `maxCatchUpSec = 1d`
  - `minFundingSettleUsd = $0.0001`
- 変更手順（推奨: スケジュール運用）
  1) `setFundingParamsMinDelay(delay)` を設定（例: 24h）
  2) `scheduleFundingParams(..., eta)` を実行（eta >= now + delay）
  3) アナウンス（コミュニティ/運用ノート）
  4) `executeScheduledFundingParams()` 実行
  5) 監視強化（72h程度）
- ロールバック
  - 同様に `scheduleFundingParams` で旧値へ戻す。
  - 緊急時は `setFundingPaused(true)` で一時停止（`lastFundingTime` は進行）。

## 異常対応（SOP）
- オラクルstale多発
  - `FundingSkipped(STALE)` が連発 → オラクルレイヤの状態確認。
  - 一時的に `setFundingPaused(true)` も可（相場混乱時の過剰Funding抑止）。
- index==0発生
  - オラクル異常（BAD_INDEX）。即時調査。
  - 収束まで `FundingSkipped(BAD_INDEX)` でcatch-upは抑制される。
- ボラ拡大でcap張り付き
  - `premClamped` の張り付きが継続 → `maxFundingRatePerInterval` の見直しを検討（段階的に）。
- Keeper停止
  - `lastFundingTime` が閾値（例: 5分）を越えて更新されない → アラート。
  - 代替Keeperを起動／手動実行。

## 運用Tips
- Withdraw直前の即時settleは現状任意。UX要件次第でトグル化も可能。
- Dustはクローズ時に強制フラッシュされるため、長期塵溜まりは起きにくい。
- `currentFundingRate()` はダッシュボードやBotの意思決定に利用可能。
- デプロイ後しばらくは `±0.5%/8h` を固定し、挙動の安定性と監視のベースラインを確立する。

## 付録：ダッシュボード項目例
- 現在のFunding（rate/sec, annualized換算）
- prem/raw & premClamped
- notional/contract
- Σsize / Σ|size|（OI）
- cumulativeFundingPerSize（時系列）
- Skipped理由内訳（円グラフ/時系列）
- lastFundingTime / 更新頻度

