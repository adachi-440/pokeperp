# オンチェーン CLOB Perp — フロントエンド連携仕様（ミニMVP）

> 目的: `book/spec_mini_mvp.md` を基に、dApp フロントエンドが最小限で板（CLOB）と相互作用できるようにする実装指針（コントラクトIF、クエリ、アクション、イベント、UX要件）。

---

## 1. スコープと役割

- 対象: 単一マーケットの板（OrderBookMVP）との read/write 連携。会計・清算は後続（SettlementHook/PerpEngine）に委譲。
- 目的: 
  - 板の可視化（Top of Book、価格帯の深さ、FIFOオーダー一覧）
  - 発注（place）、取消（cancel）
  - マッチ進行のトリガ（matchAtBest）と進捗の可視化
  - band/最小数量・ノーション等の前処理バリデーション

---

## 2. コントラクトとインターフェース

- OrderBookMVP（本体）
  - 必須外部関数（候補シグネチャ）

```solidity
function place(bool isBid, uint64 priceTick, uint128 qty) external returns (uint64 id);
function cancel(uint64 id) external;
function matchAtBest(uint256 stepsMax) external;

// view
function bestBidTick() external view returns (uint64);
function bestAskTick() external view returns (uint64);
function levelOf(bool isBid, uint64 priceTick) external view returns (uint64 head, uint64 tail, uint128 totalQty);
function orderOf(uint64 id) external view returns (
  uint64 orderId, address trader, uint64 priceTick, uint128 qty, bool isBid, uint64 prev, uint64 next
);

// config/state
function marketCfg() external view returns (
  uint64 tickSize, uint128 minQty, uint256 minNotional, uint256 deviationLimit, uint256 contractSize
);
function settlementHook() external view returns (address);
```

- IOracleAdapter（参照）

```solidity
function indexPrice() external view returns (uint256);
function markPrice() external view returns (uint256);
```

- ISettlementHook（任意）

```solidity
function onMatch(address buyer, address seller, uint64 priceTick, uint128 qty) external;
```

- イベント（発火想定）

```solidity
event OrderPlaced(address indexed trader, bool isBid, uint64 priceTick, uint128 qty, uint64 id);
event OrderCancelled(address indexed trader, uint64 id, uint128 remainingQty);
event TradeMatched(address indexed buyer, address indexed seller, uint64 priceTick, uint128 qty, uint256 fee);
event ParamsUpdated(bytes32 key, uint256 value);
```

> 備考: 実装側で名称や引数が多少異なる場合は、フロントのアダプタ層で吸収する。

---

## 3. ステートモデルと基本クエリ

- 価格変換
  - 表示価格: `price = priceTick * tickSize`
  - 入力→tick: `priceTick = round(price / tickSize)`（推奨: `floor` で内側に寄せ、UIで表示補正）
- Top of Book
  - `bestBidTick()`, `bestAskTick()` を同時取得
  - 交差状態: `bestBidTick >= bestAskTick` → クロス発生中（マッチ可能）
- レベル情報
  - `levelOf(isBid, tick)` → `{ head, tail, totalQty }`
  - FIFOの詳細は `orderOf(id)` を辿って列挙（`head` → `next` → …）
- マルチ取得
  - 複数 `orderOf`/`levelOf` をまとめて読む場合、Multicall の利用を推奨

---

## 4. アクションとUXフロー

### 4.1 発注（place）

- 入力: `side`（Buy/Sell）, `price`, `qty`
- 前処理（フロント）
  - tick計算: `priceTick = toTick(price)`、0禁止
  - 最小ガード: `qty >= minQty`、`qty * price * contractSize >= minNotional`
  - band参考: `|price - index| / index <= deviationLimit`（実約定は resting 価格、参考でも良い）
- 送信: `place(isBid, priceTick, qty)` → `id` 受領
- 成功時: `OrderPlaced` を購読しローカル板へ反映（自分のオーダーは即時反映してもよい）

### 4.2 取消（cancel）

- 自分の注文一覧の取得
  - 方式A: `openOrders` ビュー/マップがある場合はそれを利用
  - 方式B: 過去の `OrderPlaced/OrderCancelled/TradeMatched` をユーザーアドレスでインデックスして算出
- 実行: `cancel(id)`（所有者のみ）
- 成功時: `OrderCancelled` を反映。残量0なら板から除去

### 4.3 マッチ（matchAtBest）

- 誰でも実行可（Keeper/ユーザー）。`stepsMax` はUIで選択（例: 8/16/32）
- 実行条件: `bestBidTick >= bestAskTick` かつ bandチェック合格
- 進捗: トランザクション中に複数回 `TradeMatched` が発火。UIは逐次集計して表示

---

## 5. イベント購読とリアルタイム更新

- 購読対象
  - `OrderPlaced`, `OrderCancelled` でレベルのFIFOを更新
  - `TradeMatched` で約定履歴（Tape）、最終価格、出来高、レベル残量を更新
- 冪等性
  - 再接続時はブロック番号で再同期。必要に応じてスナップショット（最新レベル合計）→差分適用
- リオーグ対策
  - 一定深度（例: 5~10ブロック）で最終確定扱い。UIで「暫定」表示を考慮

---

## 6. 導出指標（UI表示）

- スプレッド: `(bestAsk - bestBid) * tickSize`
- ミッド: `((bestAsk + bestBid)/2) * tickSize`
- 最終価格: 直近 `TradeMatched.priceTick * tickSize`
- 24h出来高: `TradeMatched` 集計（qty×price×contractSize）
- デプス: 各tickの `Level.totalQty` を集計、累積曲線を描画

---

## 7. エラーと例外処理（例）

- `band`: 価格帯ガード違反（オラクル異常時も含む）。UIで「価格が許容帯を外れています」
- `minQty`/`minNotional`: 最小値未満。入力欄にバリデーション
- 所有権/存在: `cancel` で本人以外 or 既に約定/取消済み
- `paused`: 緊急停止中（place/matchは拒否、cancelのみ許可）
- ガス不足: `stepsMax` を下げる/価格帯を広げる/再試行を案内

---

## 8. ネットワークとデプロイ情報（例）

- チェーン: L2（Arbitrum/Base/OP 等）
- アドレス（プレースホルダ）
  - `OrderBookMVP`: `0x...`
  - `OracleAdapter`: `0x...`
  - `SettlementHook`（任意）: `0x...`
- メタデータ: チェーンID、ブロック起点（イベント同期開始ブロック）

---

## 9. パフォーマンス/UXの注意

- まとめ読み: Multicallで `orderOf` をバッチ取得
- 大量レベル: 深さ描画は集計ビュー（`Level.totalQty`）を基本に、詳細はオンデマンド
- EIP-1559: `maxFeePerGas/maxPriorityFeePerGas` のUI露出
- フォールバック: オラクル異常時は `matchAtBest` を非活性化、板は閲覧のみ

---

## 10. TypeScript 型とヘルパ（サンプル）

```ts
export type MarketCfg = {
  tickSize: bigint;
  minQty: bigint;
  minNotional: bigint;
  deviationLimit: bigint; // 1e18 = 100%
  contractSize: bigint;
};

export type Order = {
  id: bigint;
  trader: string;
  priceTick: bigint;
  qty: bigint;
  isBid: boolean;
  prev: bigint;
  next: bigint;
};

export type Level = {
  head: bigint;
  tail: bigint;
  totalQty: bigint;
};

export function toTick(price: bigint, tickSize: bigint): bigint {
  // floor(price / tickSize)
  return price / tickSize;
}

export function priceFromTick(priceTick: bigint, tickSize: bigint): bigint {
  return priceTick * tickSize;
}

export function withinBand(exec: bigint, index: bigint, deviationLimit: bigint): boolean {
  // |exec - index| / index <= deviationLimit
  const diff = exec > index ? exec - index : index - exec;
  return (diff * 10n ** 18n) / index <= deviationLimit;
}
```

---

## 11. コール例（ethers v6）

```ts
import { ethers } from "ethers";

const ob = new ethers.Contract(ORDERBOOK_ADDR, OrderBookAbi, signer);

// 1) クエリ: Top of Book
const [bid, ask] = await Promise.all([ob.bestBidTick(), ob.bestAskTick()]);

// 2) 発注
const cfg = await ob.marketCfg();
const price = ethers.parseUnits("3000", 2); // 例: tickSize=1e2
const qty = 1_000n; // 単位は実装依存（size）
const tick = price / cfg.tickSize;
if (qty < cfg.minQty) throw new Error("minQty");
const tx = await ob.place(true /*isBid*/, tick, qty);
await tx.wait();

// 3) 取消
await (await ob.cancel(123n)).wait();

// 4) マッチ（Keeper）
await (await ob.matchAtBest(16)).wait();
```

---

## 12. 同期戦略（イベント→ローカル板）

1. 起点ブロックから `OrderPlaced/OrderCancelled/TradeMatched` を時系列で取得
2. 各イベントでレベルの FIFO と合計数量を更新
3. 定期的/起動時に `bestBidTick/bestAskTick` と `Level.totalQty` を照合（自己修復）
4. スナップショット（手動/定期）を保持し、再同期の初期コストを削減

---

## 13. 今後の拡張（フロント側）

- 手数料/滑り表示、最終約定価格に基づく PnL 簡易表示
- マーケット履歴（OHLCV）を `TradeMatched` から生成
- SettlementHook 連携が入った際の注文可否（IMチェック）・資金移動表示
- 複数市場対応のためのルーティング/設定スイッチャ

---

更新履歴:
- v0.1 初版（ミニMVP向けフロント連携仕様）
