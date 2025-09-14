# Oracle（ミニMVP）タスク分割仕様

> 参照: book/spec_mini_mvp_oracle.md
> 目的: 実装しやすい単位に分解し、合格条件（DoD）とテスト観点を明確化。

---

## 背景

- OrderBook（ミニMVP）における band 判定や健全性チェックのため、オンチェーン参照価格（Index/Mark）が必要。
- 標準 EVM 環境で、TypeScript 製 Reporter から Push 型により価格を供給（非 SUAVE）。
- ミニMVP段階では `indexPrice == markPrice` とし、将来的に TWAP/複数 Reporter/署名検証へ拡張可能な構造を確保する。

---

## 問題点

- 価格鮮度: Reporter 停止/遅延時に古い価格で band 判定が誤るリスク（staleness）。
- 単位整合: OrderBook 側価格（例: tickSize=1e2）とオラクル `priceScale` の不一致で比較が破綻し得る。
- 権限/運用: Reporter 鍵ローテーション、緊急停止（pause）、ハートビート調整などの運用要件が未整備。
- 実行タイミング: 板の更新タイミングと Push 間隔/トリガの設計が未整備。
- MEV 懸念: 価格更新のフロントラン対策は最小限（将来拡張領域）。

---

## 提案（タスク分割）

1) Solidity コントラクト（OracleAdapterSimple）
- 実装
  - `OracleAdapterSimple` を新規追加（`owner/reporter/heartbeat/paused/priceScale/_price/lastUpdated`）。
  - 価格はミニMVPでは index == mark。価格 > 0 のみ許可。
- インターフェース/関数
  - 読み取り: `indexPrice()`, `markPrice()`, `isFresh()`, `lastUpdated()`, `heartbeat()`, `priceScale()`, `reporter()`, `paused()`, `state()`
  - 更新: `pushPrice(uint256 price)`（`onlyReporter`）
  - 管理: `setReporter(address)`, `setHeartbeat(uint64)`, `pause(bool)`（`onlyOwner`）
- イベント
  - `PricePushed(price, timestamp, reporter)`, `ReporterUpdated(old, new)`, `HeartbeatUpdated(old, new)`, `Paused(paused)`
- セーフガード
  - Custom Errors（`NotOwner/NotReporter/PausedErr/BadPrice/BadConfig`）
  - コンストラクタの 0 値拒否（`_reporter!=0`, `_scale>0`, `_heartbeat>0`）
  - `onlyReporter`/`onlyOwner`、`pause` 中は `pushPrice` を拒否。
  - `isFresh()` は `uint256(block.timestamp) - uint256(lastUpdated) <= uint256(heartbeat)` で計算（安全側）。
- ドキュメント
  - NatSpec と最小 README（デプロイ手順/推奨パラメータ）。
- DoD（合格条件）
  - すべての関数・イベントが上記仕様どおりに動作し、Foundry テストで緑になる。

2) TypeScript Reporter（定期 Push）
- ランタイム/依存
  - Node.js 18+、`ethers@^6`、`dotenv`、`axios`、`zod`、必要に応じ `p-retry` 等。
- 入力/丸め
  - 外部価格 API（ダミー/実API）。`price` は string として扱い、decimal ライブラリ（例 `big.js`）で `roundDown`（floor）丸め。
  - 代替: `ethers.parseUnits(priceString, decimals)`（`priceScale=10**decimals` の場合）。
- 送信/健全性
  - EIP-1559 ガス送信、失敗時リトライ/バックオフ。`heartbeat` 未満の間隔で更新し、`isFresh()` をログ監視。
  - `setInterval` ではなく逐次ループ + `sleep` により重複送信を回避。
  - `provider.getFeeData()` が null を返す環境に備え、オーバーライドはフォールバック（空）許容。
- オプション
  - FBA イベント（例: `FillEvent`）にフックし、次バッチ直前で更新トリガ。
- DoD
  - ローカルチェーンに対し一定間隔で `pushPrice` が成功、イベント受信と `isFresh()` 維持が確認できる。

3) 統合ポイント（OrderBook との整合）
- 単位合意
  - OrderBook 内部価格と `priceScale` の一致を明示（例: tickSize=1e2）。不一致時の検出ヘルパを用意（単体比較テスト）。
- 参照
  - OrderBook 側 band 判定で `indexPrice()` を参照し、staleness を考慮（`isFresh()` を条件に含めるかはポリシー定義）。
- 配布
  - `.env`/デプロイスクリプトで `ORACLE_ADDRESS` を OrderBook 側に共有。
- DoD
  - モック/実装中の OrderBook から `indexPrice()` を参照し、単位一致で band 方向の判定が破綻しないことを確認。

4) 運用・監視
- スクリプト
  - デプロイ、権限付与（`setReporter`, `setHeartbeat`, `pause`）。必要に応じて Guardian（pause 専権）を設定。
- 監視
  - `PricePushed`、`lastUpdated/heartbeat/priceScale`、`isFresh()`、一括 `state()` をログ/ダッシュボードに可視化（将来）。
- 鍵ローテーション
  - `setReporter` の手順とロールバック（旧鍵の無効化確認）。
- DoD
  - Reporter 鍵を変更後、旧鍵からの `pushPrice` が確実に拒否される。

5) 将来拡張のフック
- 複数 Reporter/集計（median/TWAP）設計の余地をコントラクト/Reporterの責務分離で確保。
- 署名付きオフチェーンレポートのオンチェーン検証（commit-reveal/threshold 署名）への差し替え可能な構成。
- DoD
  - 単一 Reporter 実装に閉じない I/F（拡張関数専用インターフェースを別定義）であること。

---

## 期待される変更

- 追加ファイル/実装（例）
  - `contract/src/OracleAdapterSimple.sol`（本体）
  - `script/deploy_oracle.ts`（Foundry/Hardhat デプロイスクリプトのどちらか）
  - `reporter/ts/push-price.ts`（Reporter 最小実装）
  - `.env.example`（`RPC_URL, PRIVATE_KEY, ORACLE_ADDRESS, PRICE_SOURCE_URL, UPDATE_INTERVAL_MS` 等）
  - `docs/oracle/README.md`（運用/パラメータ/単位整合/トラブルシュート）
- 既存仕様の反映
  - `priceScale` を OrderBook の tickSize に合わせる（例: 1e2）。不一致時はテストで検出できるようヘルパとチェックを用意（README に「priceScale==tickSize」を強調）。
  - 監視便宜の一括 getter `state()` は `(price, lastUpdated, heartbeat, scale, paused, reporter, owner)` を返す。
  - CI に Solidity 単体テストと Reporter の lint/型チェックを追加（任意）。

---

## テストの内容（合格条件）

A. Solidity 単体テスト（Foundry 推奨）
- 初期化
  - デプロイ時の `owner`, `reporter`, `priceScale`, `heartbeat` が期待通り。
- 権限
  - `pushPrice` は `onlyReporter` 以外で revert。
  - `setReporter`, `setHeartbeat`, `pause` は `onlyOwner` 以外で revert。
- 機能
  - `pushPrice(x)` 後に `indexPrice()==markPrice()==x`、`PricePushed` が発火。
  - `pause(true)` 中の `pushPrice` は revert、`pause(false)` 後は成功。
  - `isFresh()` が `uint256(block.timestamp) - uint256(lastUpdated) <= uint256(heartbeat)` のとき true、それ以外 false。
  - 0 価格は revert（Custom Error: `BadPrice`）。
- 端数/単位
  - `priceScale` が期待どおりの値で固定（immutable）であること。

B. TypeScript（Reporter）テスト
- ユニット
  - `roundToScale` の丸め精度（代表値: 0.01 / 1 / 1234.567、scale=1e18・floor・Number不使用）。
  - 環境変数のバリデーション（必須/任意）。
- イントグレーション（ローカルチェーン）
  - ローカル RPC にデプロイした `OracleAdapterSimple` へ定期 push し、`PricePushed` イベントを受信。
  - `heartbeat` 未満の間隔で `isFresh()` が true を維持、送信停止で false に遷移。
  - ネットワーク遅延を模擬しても重複送信が起きない（逐次ループ動作）。
  - 一時的な RPC 失敗に対するリトライで復帰できる。

C. OrderBook 連携（モック/実）
- モック OrderBook で `indexPrice()` を参照して band 判定（単位一致テスト）。
- 板イベント（任意）に合わせた Reporter の更新で直前価格更新が入ることを確認。

D. セキュリティ/回帰
- Reporter 鍵を変更後、旧鍵からの `pushPrice` が拒否される。
- `pause(true)` で全 push が停止し、`view` 系は動作する。

E. ガス/イベント（任意）
- `pushPrice` ガス計測（基準作成）。
- イベントのインデックス/フィルタで最新価格を容易に取得できること。

---

この分割に沿って順に進めれば、最小の実装から統合テストまで段階的に完了できます。必要に応じて、各タスクに対するテンプレート（Solidity 雛形、TS スクリプト、Foundry テスト雛形）も追加してください。
