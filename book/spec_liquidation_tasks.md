# 背景

- 現行MVPはIM/MMガード（初期/維持証拠金）を実装済みで、約定後にIM不足ならrevert、常時MM維持を要求します。
- 価格変動のみでMM割れする口座が発生し、清算ボットが検知→強制縮小して健全化する機能が必要です。
- book/spec.md, simple_spec.md は「equity < MM で部分/全清算」「罰金は保険基金」「Liquidatorが liquidate()」という最小仕様を定義しています。

# 問題点（現状ギャップ）

- PerpEngineに清算エントリポイントが未実装。
- ネットフラット（Σ size=0）不変条件を崩す恐れのある「相手方なし強制クローズ」案が混入しがち。
- 部分クローズ時のentryNotional更新則が平均建値ドリフトを起こし得る（avgEntry維持が必要）。
- 清算価格をMark単独に依存すると価格操作耐性が低い（band/TWAP/板出来値の導入が必要）。
- CloseFactor/Fee/Reward/Insurance/minLiqQty/cooldown等のパラメータが未定義。
- 清算に関する単体/E2Eテストが未整備。

# 提案（MUST/SHOULD）

MUST（設計破綻リスクの解消）

1) ネットフラットの維持（A案で確定）
- 清算は必ずOrderBook経由の「Reduce-Only IOC」で実行し、通常の約定経路（onMatch/SettlementHook）で会計を適用して常にΣ size=0を保つ。
- liquidate(trader, qty, maxSlippageBps) で Reduce-Only IOC を組み立て、板で即時突合。未充足分は部分約定に留め、必要なら反復。
- 注: 必要に応じてOrderBookに「オペレーター（Perp/清算）による代理発注」権限／エントリポイントを追加。

2) entryNotional更新則の是正（平均建値の保持）
- Reduce時: realized = qty*(exec-avg)*contractSize, entryNotional -= qty*avg, size -= sign*qty。
- Add時   : entryNotional += qty*exec, size += sign*qty。
- Reverse: 既存分を全量Reduceで精算→余剰を新規Add。
- 上記を共通ヘルパ（例: _applyReduce/_applyAdd）に抽出し、通常約定/清算の双方から使用。部分クローズ後にavgEntryが不変となることをテストで担保。

3) 清算価格の決め方
- Mark単独は禁止。Indexとの乖離上限（deviationLimit）でクランプ、かつ isFresh() を必須。
- A案（板経由）により実際の出来値は板決定。さらにbandチェックとmaxSlippageBpsを二重に適用。

# SHOULD（MVPで入れると後悔しない）

- Funding精算の順序: liquidate() 冒頭で対象traderのFundingを先にsettle。
- CloseFactorの動的化: 不足率に応じた段階引き上げ（将来拡張; 今は固定BPS）。
- 最小清算数量/クールダウン: minLiqQty（WAD）とper-account cooldown（数ブロック）で連打/ダスト対策。
- Self-liquidationの扱い: trader==callerの自己デレバは手数料減免（任意）。
- Insolvency方針: 罰金は残高上限。Equity<0の破綻はInsurance/ADL/SocialLossは将来課題としてREADMEに明記。
- スケールの明記: margin/価格/金額=1e18, BPS=1e4。BPS_DENOM定数で誤読防止。
- イベント拡充: execPrice/notionalClosed/reward/toInsurance/preEq/postEq を含め運用可視性を向上。
- Reentrancy/Param検証: nonReentrantと境界チェック（BPS, アドレス, band, freshness）。

# 期待される変更（実装タスク分割）

- タスク1: パラメータ/イベント定義（PerpEngine）
  - 定数/パラメータ
    - `uint256 public constant BPS_DENOM = 10_000;`
    - `uint256 liquidationCloseFactorBps`（例 2500=25%）
    - `uint256 liquidationFeeBps`（例 50=0.5%）
    - `uint256 liquidatorRewardBps`（例 5000=50%）
    - `uint256 minLiqQty`（WAD）
    - `uint64  liqCooldownBlocks`（per-account）
    - `address insuranceFund`
  - イベント
    - `event Liquidated(address indexed trader, address indexed liquidator, uint256 qty, uint256 execPrice, uint256 notionalClosed, uint256 penalty, uint256 rewardToLiq, uint256 toInsurance, int256 remainingSize, int256 preEq, int256 postEq);`
  - 管理関数
    - `setLiquidationParams(closeBps, feeBps, rewardBps, minQty, cooldown)`、`setInsuranceFund(address)`

- タスク2: 判定/補助View（PerpEngine）
  - `isLiquidatable(user)`: `risk.equity(user) < int256(risk.maintenanceMargin(user))`
  - `maxLiquidatableQty(user)`: `abs(size)*closeFactorBps/BPS_DENOM`（minLiqQtyで下限クリップ）
  - `userNotionalAtMark(user)`
  - `clampToBand(mark,index,deviationLimit)`（long清算ならmin側、short清算ならmax側に寄せる方針でも可）

- タスク3: OrderBook拡張（Reduce-Only IOC）
  - 代理発注権限（オペレーター）: PerpEngine/清算ロジックが `trader` の代わりに Reduce-Only IOC を投入できるI/F。
  - 例: `forceReduceIOC(trader, sideOpposite, qty, limitPrice, maxSlippageBps)` を追加、内部で即時突合→部分充足可。
  - 既存のSettlementHook経路を使用し、通常約定としてPerp会計/_applyヘルパが動くようにする。

- タスク4: 清算本体（PerpEngine→OrderBook連携）
  - `liquidate(trader, qty, maxSlippageBps)` を実装（permissionless, nonReentrant）。
  - 前提: `isLiquidatable`、`qty>0`、`<=maxLiquidatableQty`、`>=minLiqQty`、cooldown満了、`oracle.isFresh()`、band内。
  - 手順: (1) settleFunding(trader) → (2) liqPrice=clampToBand(mark,index) → (3) OrderBook.forceReduceIOC 呼出 → (4) fill結果の `filledQty/execPrice` を取得。
  - 罰金: `notionalClosed = filledQty*execPrice/1e18*contractSize/1e18` → `penalty = notionalClosed*feeBps/BPS_DENOM` を `vault.balanceOf(trader)` 上限でクリップ。
  - 分配: `reward=penalty*rewardBps/BPS_DENOM`, `toInsurance=penalty-reward`。Vaultで内部振替。
  - 事後: preEq/postEq を計測、イベント発火。MM未達でも反復可能（fail fastしない）。

- タスク5: 会計リファクタ（PerpEngine）
  - `_applyReduce/_applyAdd` を実装し、平均建値がReduceで変わらないよう修正。Reverseは全量Reduce→新規Add。
  - 既存の `applyFill` からも新ヘルパを利用。

- タスク6: セキュリティ/検証
  - nonReentrant、Param境界チェック、oracle停止時のブロック、band逸脱拒否。
  - Self-liquidationポリシー（許可する場合のFee軽減）を分岐で定義。

- タスク7: デプロイ/配線
  - `insuranceFund` 設定、`setLiquidationParams` を Deploy スクリプトへ追加。

- タスク8: ドキュメント更新
  - 本仕様と `/book/spec.md` 清算節の整合、READMEに運用パラメータの表を追加。

# テストの内容（実装容易性のための分割）

- 単体（contract/test/PerpLiquidation.t.sol）
  - セットアップ: Vault/Risk/Perp/Oracle、PerpをVaultに紐付け、Riskリンク、パラメータ/Insurance設定。
  - ロング正常系: ロング→下落→`liquidate`。`size`縮小、notional/penalty/配分、pre/post equity、avgEntry不変（Reduce後）。
  - ショート正常系: 上昇→`liquidate`。ロング対称性の検証。
  - 部分→反復清算: `maxLiquidatableQty` を複数回、MM復帰またはゼロ化まで。
  - フル清算相当: `abs(size) <= maxLiquidatableQty` で全量クローズ。
  - リワード配分: Liquidator/Insuranceへの分配と総和一致。
  - 境界/ガード: `equity>=MM`/`qty==0`/`qty>max`/`trader==caller`/stale/band逸脱/Param不正でrevert。
  - Funding→清算順序: settle先行の影響を検証。
  - 最小数量/クールダウン: minLiqQty/cooldownが効くこと。

- 連携（contract/test/E2E_Liquidation.t.sol）
  - 既存E2E_LeverageGuardsを踏襲: 約定→価格変動→清算→Withdrawガードの一連。
  - Reduce-Only IOC: 板厚不足で部分充足→反復清算の確認。maxSlippageBpsで出来値が制限されること。
  - ネットフラット検証: 清算前後で常に Σ size == 0。
  - スケール/丸め: 1e18/WAD, BPSの混在に起因する端数誤差がないこと。

- 不変条件/会計検証
  - 売買/清算含む内部振替の総和ゼロサム: `Δ(trader)+Δ(liquidator)+Δ(insurance)` が `-penalty` と整合。

- ガス概算（任意）
  - 清算1回のガス上限、Reduce-Only IOC（部分充足）のガス挙動を記録。

# 補足: デフォルト値の目安

- `liquidationCloseFactorBps = 2500`（25%）
- `liquidationFeeBps = 50`（0.5%）
- `liquidatorRewardBps = 5000`（罰金の50%）
- `deviationLimit ≈ 2%`、`heartbeat ≈ 60s`
- `minLiqQty = 0.1e18` 等（ダスト対策）
