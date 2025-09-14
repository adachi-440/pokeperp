# オンチェーン板型 Perp DEX — 最小仕様（MVP）とコントラクト雛形

> **Scope**: L2（Arbitrum/Base/OP等）における単一マーケット・線形Perp・USDC単一担保。板（CLOB）と約定はオンチェーン。オフチェーンは Funding/Oracle トリガ、清算ボットのみ。

---

## 0. 用語と記号

* **Tick**: 価格刻み。`price = tick * TICK_SIZE`。
* **IM/MM**: 初期/維持証拠金率（Initial/Maintenance Margin Rate）。
* **Mark/Index**: Markは取引/清算計算用価格、Indexはオラクル参照価格。
* **Funding**: `k*(Mark-Index)/Index` を上限 `cap` でクリップし、インデックス方式で累積。

---

## 1. アーキテクチャ（最小構成）

### オンチェーン

1. **Vault / MarginAccount**

   * 入出金・内部振替・エクイティ算出。
   * 不変条件: `withdraw`は`equity - IM >= 0`を満たす場合のみ許可。

2. **OrderBook（板）**

   * Tickごとの FIFO キューで price-time 優先。`bestBidTick/bestAskTick` を保持。
   * `place/cancel/matchAtBest(stepsMax)`（DoS回避のため段階的約定）。
   * ガード: `minQty`, `minNotional`, `bandBps`（オラクル乖離）, `stepsMax`。

3. **PerpEngine / Settlement**

   * 約定適用→ポジション、手数料、PnL更新。`applyFill`, `settleBatch`（MVPは `matchAtBest` 内で逐次適用）。
   * 1Tx 内で `Σ filledQty_bid = Σ filledQty_ask` を満たすこと。

4. **RiskEngine**

   * IM/MM 判定を強制。
     - 新規/増し玉時: 約定適用後（PerpEngine.applyFill後）に `equity >= IM` を満たすこと（満たさない場合は `im-breach` でrevert）。
     - 維持: 約定適用後に常に `equity >= MM` を満たすこと（満たさない場合は `mm-breach` でrevert）。
     - 出金: `equity - amount >= IM` を満たす場合のみ許可（VaultのIMガード）。
     - 反対売買/デレバ（絶対サイズ減少）: IM不足でも可（MMは引き続き満たす必要あり）。

5. **OracleAdapter**

   * `indexPrice()`/`markPrice()` と逸脱チェック。`|mark-index|/index <= deviationLimit`。

6. **Funding（簡易）**

   * `rate = clamp(k*(mark-index)/index, ±cap)` を `fundingIndex` に反映。`settleFunding(trader)` で差分適用。

7. **Liquidation**

   * `equity < MM` で部分/全清算。罰金は保険基金へ。

8. **Fee/Insurance Router**

   * 取引/清算手数料の集約、赤字補填。

9. **Admin / Pausable**

   * パラメータ更新・緊急停止。

### オフチェーン（最小）

* **Funding/Oracle デーモン**: 定期 `updateFunding()` 呼び出し、オラクル監視。
* **Liquidator ボット**: 健全性スキャン、`liquidate()` 実行。

---

## 2. データモデル（抜粋）

```solidity
// 価格は tick 固定。1サイズの$換算倍率 contractSize。
struct MarketCfg {
  uint64  tickSize;       // 例: 1e2 (= $0.01)
  uint256 contractSize;   // 1 サイズあたりの$換算係数
  uint256 imr;            // 1e18 スケール
  uint256 mmr;            // 1e18 スケール
  uint256 k;              // funding感度
  uint256 cap;            // funding上限（年率換算を秒割りでも可）
  uint256 deviationLimit; // オラクル逸脱許容 (1e18 = 100%)
}

struct Position {
  int256 size;            // >0 long, <0 short (単位: size)
  int256 entryNotional;   // 加重平均用累積ノーション
  int256 lastFundingIndex;// fundingインデックス記録
}

struct Order {
  uint64  id;
  address trader;
  uint64  priceTick;
  uint128 qty;            // 残量
  bool    isBid;
  uint64  prev;           // 双方向リンク（同一価格レベル内）
  uint64  next;
}

struct Level {
  uint64  head;
  uint64  tail;
  uint128 totalQty;
}
```

---

## 3. 主要イベント

* `Deposited(trader, token, amount)` / `Withdrawn(trader, token, amount)`
* `OrderPlaced(trader, side, priceTick, qty, id)` / `OrderCancelled(trader, id, remainingQty)`
* `TradeMatched(buyer, seller, priceTick, qty, fee)`
* `PositionChanged(trader, newSize, realizedPnl)`
* `FundingUpdated(rate, fundingIndex, timestamp)`
* `Liquidated(trader, qty, penalty)`
* `ParamsUpdated(key, value)`

---

## 4. 不変条件・検証ポイント（MVP）

* **会計整合**: すべての約定で `Vault` の内部振替は `buyer+seller+fee+insurance` がゼロサム。
* **ネットフラット**: 単一マーケットのネットポジション合計は 0（自己勘定なし）。
* **健全性**:
  - 新規/増し玉後（applyFill後）に `equity >= IM` を満たすこと。
  - 維持で常に `equity >= MM` を満たすこと。
  - 反対売買/デレバ時はIM不要、MMは維持。
  - 出金は `equity - amount >= IM` を満たすこと。
* **オラクル逸脱**: `|execPrice - index| / index <= deviationLimit`。
* **マッチ範囲**: `bestBidTick >= bestAskTick` のときのみ `matchAtBest` 実行可。
* **DoS回避**: ループは `stepsMax` で上限。大口処理は複数Txへ分割。

---

## 5. 数式（最低限）

* `UPnL = position.size * (mark - avgEntry) * contractSize`
* `IM = |notional| * IMR`、`MM = |notional| * MMR`  （`notional = |size| * mark * contractSize`）
* `fundingRate = clamp(k * (mark - index)/index, ±cap)`
* `fundingPayment = position.size * (fundingIndex_now - lastFundingIndex) * contractSize`

---

## 6. トランザクションフロー

```mermaid
sequenceDiagram
  participant U as User
  participant V as Vault
  participant OB as OrderBook
  participant PE as PerpEngine
  participant OR as Oracle

  U->>V: deposit(USDC)
  U->>OB: place(Bid/Ask, priceTick, qty)
  OB->>OR: indexPrice()
  OB->>PE: matchAtBest(stepsMax) 中に applyFill
  PE->>V: internalTransfer(手数料/差金)
  PE->>U: position updated (UPnL変化)
  Note over PE: 必要に応じ updateFunding/settleFunding
  PE->>U: equity check; 不足時は清算対象
```

---

## 7. デプロイ順序 & 設定

1. Vault
2. OracleAdapter（Chainlink等のIndex参照）
3. RiskEngine（IMR/MMR）
4. PerpEngine（Vault/Risk/Oracleを接続）
5. OrderBook（PerpEngineを呼ぶ）
6. Funding/Liquidation（PerpEngine内に含めても良い）
7. Fee/Insurance + Admin（Ownable/Pausable/Timelock）

主要パラメータ（例）:

* `tickSize = 1e2`（\$0.01）
* `contractSize = 1e18`（サイズ1 = 1単位）
* `IMR=0.1e18, MMR=0.05e18`（maxLeverageはプロトコルでは保持せず、UI/運用で `maxLev ≒ 1/IMR` から導出）
* `deviationLimit = 0.02e18`（±2%）
* `stepsMax = 16`（1Txあたり最大16回の対当たり約定）

---

## 8. ガス/セキュリティ設計ノート

* O(1) 近似: レベルは双方向キュー、`bestBidTick/bestAskTick` ポインタ更新。
* スパム対策: `minNotional`, `minQty`, 未約定件数上限, 取消手数料（任意）。
* MEV 軽減: 必要に応じ commit–reveal/ private tx / FBA モード導入。
* サーキットブレーカー: オラクル逸脱・急変時に発注/約定停止。
* Upgrade方針: MVPはノンアップグレード推奨。後日 UUPS/Proxy を検討。

---

## 9. テスト項目（チェックリスト）

* [ ] deposit/withdraw → place/cancel → matchAtBest → 反対売買 → PnL一致
* [ ] `stepsMax` 打切り条件でも板と会計が一貫
* [ ] band逸脱時に発注・約定が拒否される
* [ ] IM/MM ガード（境界値）
* [ ] Funding 正/負の累積一致（index差分）
* [ ] 清算（部分→回復、全清算）
* [ ] ネットフラット不変条件

---

## 10. コントラクト雛形（Solidity）

> 依存: Solidity ^0.8.24。OpenZeppelin（Ownable/Pausable/SafeERC20）利用を想定。実装は監査前提で最小限の枠組みのみを提示。

### 10.1 インターフェース

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}

interface IVault {
    function deposit(uint256 amt) external;
    function withdraw(uint256 amt) external;
    function credit(address user, uint256 amt) external;    // internal use (auth)
    function debit(address user, uint256 amt) external;     // internal use (auth)
    function equityOf(address user) external view returns (int256);
}

interface IRiskEngine {
    function requireHealthyAfter(address user) external view;
    function imr() external view returns (uint256);
    function mmr() external view returns (uint256);
}
```

### 10.2 Vault（最小）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral; // USDC 等
    mapping(address => uint256) public balance; // 原資産建て

    address public perp; // PerpEngine のみが内部振替可能

    event Deposited(address indexed user, uint256 amt);
    event Withdrawn(address indexed user, uint256 amt);

    modifier onlyPerp() { require(msg.sender == perp, "PERP_ONLY"); _; }

    constructor(IERC20 _collateral) { collateral = _collateral; }

    function setPerp(address p) external onlyOwner { perp = p; }

    function deposit(uint256 amt) external {
        collateral.safeTransferFrom(msg.sender, address(this), amt);
        balance[msg.sender] += amt;
        emit Deposited(msg.sender, amt);
    }

    function withdraw(uint256 amt) external {
        // NOTE: 本来は equity(IM) チェックを PerpEngine 側で行った上で許可フラグを使う
        require(balance[msg.sender] >= amt, "INSUFFICIENT");
        balance[msg.sender] -= amt;
        collateral.safeTransfer(msg.sender, amt);
        emit Withdrawn(msg.sender, amt);
    }

    // --- 内部振替（PerpEngine専用）---
    function credit(address user, uint256 amt) external onlyPerp { balance[user] += amt; }
    function debit(address user, uint256 amt) external onlyPerp { balance[user] -= amt; }

    // MVP: equity = 現金残高 + UPNL（実際はPerpEngineに委譲するのが自然）
    function equityOf(address) external pure returns (int256) { return 0; }
}
```

### 10.3 OrderBook（最小・価格レベルFIFO）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum Side { Bid, Ask }

struct Order { uint64 id; address trader; uint64 priceTick; uint128 qty; bool isBid; uint64 prev; uint64 next; }
struct Level { uint64 head; uint64 tail; uint128 totalQty; }

interface IPerpEngine {
    function onMatch(address buyer, address seller, uint64 priceTick, uint128 qty) external; // 約定適用
    function bandOk(uint64 priceTick) external view returns (bool);                           // 逸脱ガード
}

contract OrderBook {
    uint64 public bestBidTick; // 最良買い
    uint64 public bestAskTick; // 最良売り

    uint64 public nextOrderId = 1;
    mapping(uint64 => Order) public orders; // id => Order
    mapping(uint64 => Level) public bids;   // tick => queue
    mapping(uint64 => Level) public asks;   // tick => queue

    IPerpEngine public immutable perp;

    uint128 public minQty = 1;      // スパム防止
    uint256 public stepsMaxDefault = 16; // DoS回避

    event OrderPlaced(address indexed user, Side side, uint64 priceTick, uint128 qty, uint64 id);
    event OrderCancelled(address indexed user, uint64 id, uint128 remaining);

    constructor(IPerpEngine _perp) { perp = _perp; bestAskTick = type(uint64).max; }

    function place(Side side, uint64 priceTick, uint128 qty) external returns (uint64 id) {
        require(qty >= minQty, "SMALL_QTY");
        require(perp.bandOk(priceTick), "OUT_OF_BAND");
        id = nextOrderId++;
        orders[id] = Order(id, msg.sender, priceTick, qty, side == Side.Bid, 0, 0);
        _enqueue(side, priceTick, id);
        emit OrderPlaced(msg.sender, side, priceTick, qty, id);
    }

    function cancel(uint64 id) external {
        Order storage o = orders[id];
        require(o.trader == msg.sender, "NOT_OWNER");
        _removeFromLevel(o);
        emit OrderCancelled(msg.sender, id, o.qty);
        delete orders[id];
    }

    function matchAtBest(uint256 stepsMax) external {
        if (stepsMax == 0) stepsMax = stepsMaxDefault;
        uint256 steps;
        while (steps < stepsMax && bestBidTick >= bestAskTick) {
            Level storage lb = bids[bestBidTick];
            Level storage la = asks[bestAskTick];
            if (lb.head == 0 || la.head == 0) break;

            Order storage b = orders[lb.head];
            Order storage a = orders[la.head];

            uint128 qty = b.qty < a.qty ? b.qty : a.qty;
            // PerpEngine にて会計/PnL/証拠金チェックを実施
            perp.onMatch(b.trader, a.trader, b.priceTick /*=a.priceTick*/, qty);

            _consumeHead(lb, b, qty, /*isBid*/true);
            _consumeHead(la, a, qty, /*isBid*/false);

            if (lb.head == 0) _moveBestBidLeft();
            if (la.head == 0) _moveBestAskRight();
            unchecked { ++steps; }
        }
    }

    // --- 内部ユーティリティ（簡略化）---
    function _enqueue(Side side, uint64 tick, uint64 id) internal {
        Level storage L = side == Side.Bid ? bids[tick] : asks[tick];
        if (L.head == 0) { L.head = id; L.tail = id; }
        else { orders[L.tail].next = id; orders[id].prev = L.tail; L.tail = id; }
        L.totalQty += orders[id].qty;
        if (side == Side.Bid) { if (tick > bestBidTick) bestBidTick = tick; }
        else { if (tick < bestAskTick) bestAskTick = tick; }
    }

    function _removeFromLevel(Order storage o) internal {
        Level storage L = o.isBid ? bids[o.priceTick] : asks[o.priceTick];
        uint64 p = o.prev; uint64 n = o.next;
        if (p != 0) orders[p].next = n; else L.head = n;
        if (n != 0) orders[n].prev = p; else L.tail = p;
        L.totalQty -= o.qty;
        o.prev = 0; o.next = 0;
    }

    function _consumeHead(Level storage L, Order storage o, uint128 qty, bool /*isBid*/) internal {
        o.qty -= qty; L.totalQty -= qty;
        if (o.qty == 0) {
            uint64 oldHead = L.head; L.head = o.next; if (L.head != 0) orders[L.head].prev = 0; else L.tail = 0;
            delete orders[oldHead];
        }
    }

    function _moveBestBidLeft() internal {
        // 実装簡略化: 実運用では連続する tick の存在チェックが必要
        if (bids[bestBidTick].head == 0) {
            while (bestBidTick > 0 && bids[bestBidTick].head == 0) { bestBidTick--; }
        }
    }

    function _moveBestAskRight() internal {
        if (asks[bestAskTick].head == 0) {
            while (bestAskTick < type(uint64).max && asks[bestAskTick].head == 0) { bestAskTick++; }
        }
    }
}
```

### 10.4 PerpEngine（最小・会計/リスク/ファンディング入口）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVault, IOracleAdapter, IRiskEngine} from "./Interfaces.sol"; // 体裁用: 実際は同一ファイル可

contract PerpEngine {
    IVault public immutable vault;
    IOracleAdapter public immutable oracle;
    IRiskEngine public immutable risk;

    uint256 public constant CONTRACT_SIZE = 1e18; // 例: 1サイズ=1単位
    uint256 public deviationLimit = 2e16; // 2% (1e18=100%)

    struct Position { int256 size; int256 entryNotional; int256 lastFundingIndex; }
    mapping(address => Position) public positions;

    int256 public fundingIndex; // 累積インデックス

    event TradeMatched(address buyer, address seller, uint64 priceTick, uint128 qty, uint256 execPrice);
    event PositionChanged(address user, int256 newSize, int256 realizedPnl);
    event FundingUpdated(int256 rate, int256 newIndex);

    constructor(IVault v, IOracleAdapter o, IRiskEngine r) { vault = v; oracle = o; risk = r; }

    function bandOk(uint64 /*priceTick*/) external view returns (bool) {
        uint256 idx = oracle.indexPrice();
        uint256 mrk = oracle.markPrice();
        uint256 diff = idx > mrk ? idx - mrk : mrk - idx;
        return diff * 1e18 / idx <= deviationLimit;
    }

    // OrderBook から呼ばれる約定適用。
    function onMatch(address buyer, address seller, uint64 /*tick*/, uint128 qty) external {
        // NOTE: 実装簡略化: execPrice=markPrice とし、手数料や滑りは省略（MVP）
        uint256 price = oracle.markPrice();
        _applyFill(buyer, int256(qty), price);
        _applyFill(seller, -int256(qty), price);
        emit TradeMatched(buyer, seller, 0, qty, price);

        // 健全性確認（実際は前後のIM/MMチェックを厳密化）
        risk.requireHealthyAfter(buyer);
        risk.requireHealthyAfter(seller);
    }

    function _applyFill(address user, int256 dSize, uint256 price) internal {
        Position storage p = positions[user];
        int256 newSize = p.size + dSize;
        int256 realized = 0;
        if (p.size != 0 && (p.size > 0) != (dSize > 0)) {
            // 反対売買の一部: PnL realize（線形）
            int256 qtyClose = p.size > 0 ? (dSize < 0 ? min(-dSize, p.size) : int256(0)) : (dSize > 0 ? min(dSize, -p.size) : int256(0));
            if (qtyClose != 0) {
                int256 avgEntry = p.entryNotional / (p.size == 0 ? int256(1) : p.size);
                realized = qtyClose * (int256(price) - avgEntry) * int256(CONTRACT_SIZE) / 1e18;
                // Vault への反映（実際は手数料等含む）
                if (realized > 0) vault.credit(user, uint256(realized));
                else vault.debit(user, uint256(-realized));
            }
        }
        // 加重平均更新（簡略）
        int256 newNotional = p.entryNotional + dSize * int256(price);
        p.size = newSize;
        p.entryNotional = newNotional;
        emit PositionChanged(user, newSize, realized);
    }

    function min(int256 a, int256 b) internal pure returns (int256) { return a < b ? a : b; }

    // --- Funding（簡略）---
    function updateFunding() external {
        uint256 idx = oracle.indexPrice();
        uint256 mrk = oracle.markPrice();
        int256 rate = int256((mrk > idx ? mrk - idx : idx - mrk) * 1e18 / idx); // 感度/上限は省略
        fundingIndex += rate; // MVP: 秒補正やcap省略
        emit FundingUpdated(rate, fundingIndex);
    }
}
```

### 10.5 RiskEngine（最小）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPerpView { function positionOf(address u) external view returns (int256 size, int256 avgEntry); function markPrice() external view returns (uint256); }

contract RiskEngine {
    IPerpView public view_; // PerpEngine の View インターフェース（実装時に接続）
    uint256 public imr = 1e17; // 10%
    uint256 public mmr = 5e16; // 5%

    function requireHealthyAfter(address /*user*/) external view {
        // MVP: 実際は equity >= MM の検証を Perp/Vault 合算で行う
    }
}
```

### 10.6 OracleAdapter（最小）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OracleAdapter {
    uint256 public index;
    uint256 public mark;
    function set(uint256 _index, uint256 _mark) external { index = _index; mark = _mark; }
    function indexPrice() external view returns (uint256) { return index; }
    function markPrice() external view returns (uint256) { return mark; }
}
```

> **注**: 上記はあくまで雛形です。実稼働には、権限制御、ReentrancyGuard、手数料・インシュアランス、IM/MM/UPnLの厳密計算、清算処理、価格帯ガード、資金調達の年率→秒換算、整数スケーリング、精密なイベントログ、監査対応などが必須です。

---

## 11. 今後の拡張ポイント

* Makerリベート、手数料ティア、複数担保/クロスマーケット証拠金
* FBA（Frequent Batch Auction）モードの追加
* 取消手数料・最小ノーションの動的調整（混雑度に応じて）
* Private mempool/Sequencer統合でのフェアネス向上
* UUPS/Proxy アップグレードとガバナンスタイムロック
