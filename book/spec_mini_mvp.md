# オンチェーン CLOB Perp — Spec準拠ミニMVP 仕様とTODO

> 目的: 既存の最小仕様（book/spec.md）に整合しつつ、スコープを絞って素早く動く板（CLOB）を実装するためのミニMVP仕様と実装TODO。
>
> 前提: 単一マーケット・線形Perp・USDC担保。板と約定はオンチェーン。Funding/清算は後続拡張（イベント/フックで連携可能な形に最小化）。

---

## 1. TL;DR（ミニMVPの範囲）

- 板コア: TickごとのFIFOで price-time 優先、`bestBidTick/bestAskTick` を保持
- 操作: `place`, `cancel`, `matchAtBest(stepsMax)`（DoS回避の段階的約定）
- ガード: `minQty`, `minNotional`, `deviationLimit(band)`（Index/Mark参照）, `stepsMax`
- 約定価格: 受け側（レスト）価格で成立（標準CLOB）。Tick単位で記録
- 会計/リスク: 本MVPでは板に限定。約定は `TradeMatched` を発行し、外部の `SettlementHook` で処理可能（将来 `PerpEngine` 接続）
- 非対象: Funding 計算・清算ロジック・保険基金の厳密会計・複数マーケット・手数料詳細

---

## 2. コントラクト（MVP）

- OrderBookMVP（本体）
  - 役割: 板の管理（place/cancel/FIFO/matchAtBest）、最良気配の更新、ガード適用、イベント発行
  - 依存: `IOracleAdapter`（`indexPrice()/markPrice()`）、任意の `ISettlementHook`（onMatch通知）
- IOracleAdapter（IF）
  - `function indexPrice() external view returns (uint256);`
  - `function markPrice() external view returns (uint256);`
- ISettlementHook（任意IF）
  - `function onMatch(address buyer, address seller, uint64 priceTick, uint128 qty) external;`

> 注: SettlementHook を設定しない場合でも、`TradeMatched` イベントで外部が追従できる。

---

## 3. データモデル（ミニ版）

```solidity
struct MarketCfg {
  uint64  tickSize;        // 価格刻み（例: 1e2 = $0.01）
  uint128 minQty;          // 最小数量
  uint256 minNotional;     // 最小ノーション（qty * price * contractSize）
  uint256 deviationLimit;  // band (1e18 = 100%)
  uint256 contractSize;    // 1サイズあたりの$換算係数
}

struct Order {
  uint64  id;              // 連番
  address trader;
  uint64  priceTick;       // 離散化済み価格
  uint128 qty;             // 残量
  bool    isBid;           // true=Bid, false=Ask
  uint64  prev;            // 同一価格レベル内の双方向リンク
  uint64  next;
}

struct Level {
  uint64  head;            // 先頭Order id（0=none）
  uint64  tail;            // 末尾Order id（0=none）
  uint128 totalQty;        // レベル合計数量
}

struct BookState {
  uint64 bestBidTick;      // 0=未設定
  uint64 bestAskTick;      // 0=未設定
  uint64 nextOrderId;      // 自動採番（開始は1）
}
```

- ストレージ:
  - `mapping(uint64 => Level) bids;` / `mapping(uint64 => Level) asks;`
  - `mapping(uint64 => Order) orders;`（id → 注文）
  - `mapping(address => uint64[]) openOrders;`（任意: 利便性）
  - `BookState state;`、`MarketCfg cfg;`
  - `address settlementHook;`（任意）

---

## 4. 外部関数（挙動）

- place(side, priceTick, qty) → id
  - tick検証: `require(priceTick > 0 && priceTick * cfg.tickSize > 0)`
  - ガード: `qty >= cfg.minQty`, `qty * price * contractSize >= cfg.minNotional`
  - キュー挿入: 当該 `Level` 末尾へ（FIFO）
  - `bestBidTick/bestAskTick` の更新
  - `emit OrderPlaced(trader, side, priceTick, qty, id)`

- cancel(id)
  - 所有者チェック、存在チェック
  - キューからの除去（双方向リンク更新、`totalQty` 減算）
  - `bestBidTick/bestAskTick` のメンテナンス（空になったら隣接探索）
  - `emit OrderCancelled(trader, id, remainingQty)`

- matchAtBest(stepsMax)
  - 前提: `state.bestBidTick >= state.bestAskTick` の間のみ実行
  - bandチェック: `|execPrice - index|/index <= cfg.deviationLimit`
  - 1ステップ=「bestBidレベル先頭」と「bestAskレベル先頭」を価格の受け手（resting）tickで突き合わせ
  - 部分/全約定に応じてFIFOを更新、`totalQty` 減算、空レベルは `best*Tick` を次へ
  - `emit TradeMatched(buyer, seller, priceTick, qty, fee)`（feeは0でも可）
  - SettlementHook設定時は `onMatch` を逐次呼び出し
  - `stepsMax` or 交差解消で終了

- view系
  - `bestBidTick()`, `bestAskTick()`, `levelOf(tick)`, `orderOf(id)` 等

---

## 5. イベント

- `OrderPlaced(address trader, bool isBid, uint64 priceTick, uint128 qty, uint64 id)`
- `OrderCancelled(address trader, uint64 id, uint128 remainingQty)`
- `TradeMatched(address buyer, address seller, uint64 priceTick, uint128 qty, uint256 fee)`
- `ParamsUpdated(bytes32 key, uint256 value)`（任意）

---

## 6. ガード・不変条件

- マッチ範囲: `bestBidTick >= bestAskTick` のときのみ `matchAtBest` 実行可
- DoS回避: `stepsMax` で上限。ループはステップ数基準で早期終了
- band: `|execPrice - index| / index <= deviationLimit`（index=Oracle参照）。markを使う設計も可
- 会計整合（将来）: SettlementHook/PerpEngine 側でゼロサムを担保
- 健全性（将来）: IM/MM チェックを SettlementHook/PerpEngine で実施

---

## 7. マッチング仕様（要点）

- 価格優先: `bestBidTick` は最大、`bestAskTick` は最小
- 時間優先: 同一レベルでは `head` から順に消化（FIFO）
- 約定価格: resting側の `priceTick`（一般的CLOB慣行）。バンド判定はこのtickベース
- 端数処理: 片方が尽きたらもう片方は残量更新しキューに戻す
- レベル遷移: レベルが空になったら `best*Tick` を次の非空tickへ（隣接探索）

---

## 8. パラメータ管理

- 初期化: `cfg = {tickSize, contractSize, minQty, minNotional, deviationLimit}`
- 更新: オーナー権限で `setMinQty`, `setMinNotional`, `setDeviationLimit`, `setSettlementHook`
- Pause（任意）: 緊急停止時は `place/match` を停止し `cancel` のみ許可

---

## 9. ガス/セキュリティ設計ノート

- O(1) 近似: レベルは双方向キューで `head/tail` 更新のみ。`best*Tick` は隣接探索のみに限定
- スパム対策: `minNotional`, `minQty`、未約定数の上限（任意）、取消手数料（任意）
- Reentrancy: `matchAtBest` と `cancel` に `nonReentrant` 推奨。外部呼び出し（Hook）は最後に
- Oracle: 停止時はbandチェック失敗で実行不可。安全側に倒す

---

## 10. 非対象（将来拡張）

- Funding/Indexの蓄積と精算、清算（部分/全）、保険基金
- Fee詳細（Maker/Taker、清算手数料）、多市場対応、アップグレード機構
- Private Tx/FBAモードの本格統合（Hook/Attestation経由で将来対応）

---

## 11. 疑似コード（抜粋）

```solidity
function matchAtBest(uint256 stepsMax) external whenNotPaused {
  uint64 bid = state.bestBidTick;
  uint64 ask = state.bestAskTick;
  uint256 steps;

  while (steps < stepsMax && bid >= ask && bid != 0 && ask != 0) {
    // band check
    uint256 index = oracle.indexPrice();
    uint256 exec = uint256(ask) * cfg.tickSize; // resting側の価格（例: ask）
    require(_withinBand(exec, index), "band");

    uint64 buyId = bids[bid].head;
    uint64 sellId = asks[ask].head;
    Order storage buy = orders[buyId];
    Order storage sell = orders[sellId];

    uint128 qty = _min(buy.qty, sell.qty);
    _fillLevelHead(bids[bid], buyId, qty);
    _fillLevelHead(asks[ask], sellId, qty);

    emit TradeMatched(buy.trader, sell.trader, ask, qty, 0);
    if (settlementHook != address(0)) {
      ISettlementHook(settlementHook).onMatch(buy.trader, sell.trader, ask, qty);
    }

    if (bids[bid].totalQty == 0) bid = _nextLowerNonEmptyBid(bid);
    if (asks[ask].totalQty == 0) ask = _nextHigherNonEmptyAsk(ask);

    steps++;
  }

  state.bestBidTick = bid;
  state.bestAskTick = ask;
}
```

---

## 12. 実装TODO（チェックリスト）

- [ ] 型/定数の定義（`MarketCfg`, `Order`, `Level`, `BookState`）
- [ ] ストレージと初期化（`cfg`、`state.nextOrderId=1`、最良tick初期化）
- [ ] `place(side, priceTick, qty)`（ガード、FIFO挿入、最良更新、イベント）
- [ ] `cancel(id)`（オーナー検証、双方向リンク更新、レベル空時の最良更新、イベント）
- [ ] `matchAtBest(stepsMax)`（band/範囲/ステップ上限、FIFO消化、レベル遷移、Hook/イベント）
- [ ] 隣接探索ヘルパ（`_nextLowerNonEmptyBid`, `_nextHigherNonEmptyAsk`）
- [ ] band判定ヘルパ（`_withinBand(exec, index)`）
- [ ] view関数（`bestBidTick/bestAskTick/levelOf/orderOf`）
- [ ] アクセス制御/パラメータ更新（`set*` 系）
- [ ] Reentrancy/Pausable 付与（任意）
- [ ] 単体テスト（place→cross→部分/全約定→cancel、`stepsMax` 打切り、band拒否）
- [ ] ガス観測（大規模レベルのFIFO操作がO(1)に収まること）

---

## 13. 移行と拡張のガイド

- Settlement統合: `ISettlementHook.onMatch` を `PerpEngine.applyFill` へ差し替え
- Risk統合: 発注時/約定時に `requireHealthyAfter(trader)` をHook側で実施
- Funding統合: PE側で `fundingIndex` を累積し、onMatch/周期処理で適用
- FBA統合: バッチで得たfillsをオンチェーン検証→`onMatch` に反映（attestation設計）

---

更新履歴:
- v0.1 初版（ミニMVP仕様 + TODO）

