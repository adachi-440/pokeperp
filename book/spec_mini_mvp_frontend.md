# オンチェーン CLOB Perp — フロントエンド連携仕様（ミニMVP）

> 目的: `book/spec_mini_mvp.md` を基に、dApp フロントエンドが最小限で板（CLOB）と相互作用できるようにする実装指針（コントラクトIF、クエリ、アクション、イベント、UX要件）。

---

## 1. スコープと役割

- 対象: 単一マーケットの板（OrderBookMVP）との read/write 連携。会計・清算は後続（SettlementHook/PerpEngine）に委譲。
- 目的: 
  - 板の可視化（Top of Book、価格帯の深さ、FIFOオーダー一覧）
  - 発注（place）
  - 取消はミニMVPでは未実装（UIは表示のみ）
  - マッチ進行のトリガ（matchAtBest）と進捗の可視化
  - band/最小数量・ノーション等の前処理バリデーション

---

## 2. コントラクトとインターフェース（実装準拠）

- OrderBookMVP（`contract/src/orderbook/OrderBookMVP.sol`）/ `IOrderBook`
  - 外部関数（実装）

```solidity
function place(bool isBid, int24 price, uint256 qty) external returns (bytes32 orderId);
function matchAtBest(uint256 stepsMax) external returns (uint256 matched);

// view
function bestBidPrice() external view returns (int24);
function bestAskPrice() external view returns (int24);
function orderOf(bytes32 orderId) external view returns (Order memory);
function levelOf(bool isBid, int24 price) external view returns (Level memory);
function getOpenOrders(address trader) external view returns (bytes32[] memory orderIds);

// config/state（public 変数 getter）
// marketCfg(): (minQty, minNotional, deviationLimit(bps), oracleAdapter, settlementHook, paused)
```

- IOracleAdapter（参照）

```solidity
function indexPrice() external view returns (uint256);
function markPrice() external view returns (uint256);
// 実装の OracleAdapterSimple は追加で priceScale()/isFresh()/state() を提供（任意利用）
```

- ISettlementHook（任意）

```solidity
struct MatchInfo {
  address buyer; address seller; int24 price; uint256 qty; uint256 timestamp; bytes32 buyOrderId; bytes32 sellOrderId;
}
function onMatch(MatchInfo calldata matchInfo) external;
```

- イベント（実装）

```solidity
event OrderPlaced(
  bytes32 indexed orderId,
  address indexed trader,
  bool isBid,
  int24 price,
  uint256 qty,
  uint256 timestamp
);

event TradeMatched(
  bytes32 indexed buyOrderId,
  bytes32 indexed sellOrderId,
  address buyer,
  address seller,
  int24 price,      // 実装では bestBidPrice が入る
  uint256 qty,
  uint256 timestamp
);
```

備考
- ミニMVP実装には `cancel` は存在しない。
- `marketCfg.deviationLimit` は基準点 10000 = 100%（bps）。

---

## 3. ステートモデルと基本クエリ（実装準拠）

- 価格表現（int24）
  - 板価格は `int24 price` を直接使用（tickSize の概念なし）。
  - 表示用に `displayPriceWei = BigInt(price) * 1e18` を想定（実装の `_priceToUint` 換算）。
- Top of Book
  - `bestBidPrice()`, `bestAskPrice()` を同時取得
  - 交差状態: `bestBidPrice >= bestAskPrice` → クロス（マッチ可能）
- レベル情報
  - `levelOf(isBid, price)` → `{ totalQty, headId, tailId }`
  - FIFOの詳細は `orderOf(orderId)` を辿って列挙（`headId` → `nextId` → …）
- マルチ取得
  - 複数 `orderOf`/`levelOf`/`best*` は Multicall でバッチ取得推奨

---

## 4. アクションとUXフロー

### 4.1 発注（place）

- 入力: `side`（Buy/Sell）, `price:int24`, `qty:uint256`
- 前処理（フロント）
  - 最小ガード: `qty >= marketCfg.minQty`
  - ノーション参考: 実装は `notional = priceWei * qty / 1e18` で検証。`priceWei = price * 1e18`
  - band参考: 参考表示のみ可（place では未検証）。実検証は `matchAtBest` 内で実施。
- 送信: `place(isBid, price, qty)` → `bytes32 orderId` を受領
- 成功時: `OrderPlaced` を反映（自分の注文は即時ローカル反映も可）

### 4.2 取消（cancel）

- ミニMVP実装に `cancel` は存在しない。
- 自分の注文一覧は `getOpenOrders(trader)` と `orderOf(orderId)` の合成で確認。
- 約定により残量がゼロになった注文は内部で削除される（`TradeMatched` を反映してローカル板から除去）。

### 4.3 マッチ（matchAtBest）

- 誰でも実行可（Keeper/ユーザー）。`stepsMax` はUIで選択（例: 8/16/32）
- 実行条件: `bestBidPrice >= bestAskPrice` かつ bandチェック合格
- 返り値: `matched`（このトランザクションでの合計約定数量）
- 注意: `TradeMatched.price` は実装上 `bestBidPrice` が入る（受け手価格とは限らない）。

---

## 5. イベント購読とリアルタイム更新

- 購読対象
  - `OrderPlaced` でレベルのFIFOを更新
  - `TradeMatched` で約定履歴（Tape）、最終価格、出来高、レベル残量を更新
- 冪等性
  - 再接続時はブロック番号で再同期。必要に応じてスナップショット（最新レベル合計）→差分適用
- リオーグ対策
  - 一定深度（例: 5~10ブロック）で最終確定扱い。UIで「暫定」表示を考慮

- wagmi/viem での購読例（React）

```ts
import { useWatchContractEvent, usePublicClient } from 'wagmi'

useWatchContractEvent({
  address: ORDERBOOK_ADDR,
  abi: OrderBookAbi,
  eventName: 'OrderPlaced',
  onLogs: (logs) => {
    for (const log of logs) {
      // log.args: { orderId, trader, isBid, price, qty, timestamp }
      // ローカル板へ反映
    }
  },
})

useWatchContractEvent({
  address: ORDERBOOK_ADDR,
  abi: OrderBookAbi,
  eventName: 'TradeMatched',
  onLogs: (logs) => {
    // 約定履歴・最終価格・レベル残量の更新
  },
})
```

---

## 6. 導出指標（UI表示）

- スプレッド: `bestAskPrice - bestBidPrice`（必要なら 1e18 で換算）
- ミッド: `((bestAskPrice + bestBidPrice)/2)`（同上）
- 最終価格: 直近 `TradeMatched.price`（= bestBidPrice）
- 24h出来高: `TradeMatched` 集計（qty×priceWei/1e18）
- デプス: 各 price の `Level.totalQty` を集計、累積曲線を描画

---

## 7. エラーと例外処理（実装の注意）

- `band`: `matchAtBest` 内部で検証。UI は参考表示（オフチェーン）
- `minQty`/`minNotional`: place 時に検証（実装の require）
- 取消未実装: `cancel` は存在しないため、誤案内しない
- `paused`: `marketCfg.paused` は現実装では未参照（将来拡張）。UI は表示のみ
- ガス不足: `stepsMax` を下げる/再試行を案内

---

## 8. ネットワークとデプロイ情報（例）

- チェーン: L2（Arbitrum/Base/OP 等）
- フロント実装の現状
  - wagmi 設定は `mainnet / sepolia / baseSepolia` を同梱（`components/providers/privy-provider.tsx`）。
  - Arbitrum での検証時は chains/transports に `arbitrum`（任意: `arbitrumSepolia`）を追加する。
- アドレス（プレースホルダ）
  - `OrderBookMVP`: `0x...`
  - `OracleAdapter`: `0x...`
  - `SettlementHook`（任意）: `0x...`
- メタデータ: チェーンID、ブロック起点（イベント同期開始ブロック）

---

## 9. パフォーマンス/UXの注意

- まとめ読み: viem `publicClient.multicall` で `orderOf` をバッチ取得
- 大量レベル: 深さ描画は集計ビュー（`Level.totalQty`）を基本に、詳細はオンデマンド
- EIP-1559: `maxFeePerGas/maxPriorityFeePerGas` のUI露出
- フォールバック: オラクル異常時は `matchAtBest` を非活性化、板は閲覧のみ

---

## 10. TypeScript 型とヘルパ（実装準拠）

```ts
export type MarketCfg = {
  minQty: bigint;
  minNotional: bigint;
  deviationLimit: bigint; // bps, 10000 = 100%
  oracleAdapter: string;
  settlementHook: string;
  paused: boolean;
};

export type Order = {
  id: `0x${string}`; // bytes32
  trader: string;
  isBid: boolean;
  price: bigint; // int24 相当（ethers v6 は bigint）
  qty: bigint;
  timestamp: bigint;
  nextId: `0x${string}`;
  prevId: `0x${string}`;
};

export type Level = {
  totalQty: bigint;
  headId: `0x${string}`;
  tailId: `0x${string}`;
};

export function priceWei(price: bigint): bigint {
  // _priceToUint の正立部分に合わせる（price>=0 を想定）
  return price * 10n ** 18n;
}

export function withinBand(execWei: bigint, indexWei: bigint, deviationLimitBps: bigint): boolean {
  // |exec - index| / index <= deviationLimit(bps)/10000
  const diff = execWei > indexWei ? execWei - indexWei : indexWei - execWei;
  return (diff * 10000n) / indexWei <= deviationLimitBps;
}
```

---

## 11. コール例（実装準拠）

### 11.1 wagmi/viem（推奨）

```ts
import { usePublicClient, useWalletClient } from 'wagmi'

const publicClient = usePublicClient()
const { data: wallet } = useWalletClient()

// 1) クエリ: Top of Book
const [bid, ask] = await Promise.all([
  publicClient.readContract({ address: ORDERBOOK_ADDR, abi: OrderBookAbi, functionName: 'bestBidPrice' }),
  publicClient.readContract({ address: ORDERBOOK_ADDR, abi: OrderBookAbi, functionName: 'bestAskPrice' }),
])

// 2) 発注
const cfg = await publicClient.readContract({ address: ORDERBOOK_ADDR, abi: OrderBookAbi, functionName: 'marketCfg' })
const price: bigint = 3000n
const qty = 1_000n
if (qty < cfg.minQty) throw new Error('minQty')

// 推奨: 事前に simulate でガスと戻り値を確認
const sim = await publicClient.simulateContract({
  address: ORDERBOOK_ADDR,
  abi: OrderBookAbi,
  functionName: 'place',
  args: [true, price, qty],
  account: wallet!.account,
})
const hash = await wallet!.writeContract(sim.request)
const receipt = await publicClient.waitForTransactionReceipt({ hash })

// 3) 取消（未実装）: getOpenOrders + orderOf で保有注文を参照
const my = await publicClient.readContract({
  address: ORDERBOOK_ADDR,
  abi: OrderBookAbi,
  functionName: 'getOpenOrders',
  args: [wallet!.account.address],
})
// my を orderOf() で列挙して残量・位置を確認

// 4) マッチ（Keeper）
const sim2 = await publicClient.simulateContract({
  address: ORDERBOOK_ADDR,
  abi: OrderBookAbi,
  functionName: 'matchAtBest',
  args: [16n],
  account: wallet!.account,
})
const hash2 = await wallet!.writeContract(sim2.request)
await publicClient.waitForTransactionReceipt({ hash: hash2 })
```

### 11.2 ethers v6（参考）

```ts
import { ethers } from 'ethers'
const ob = new ethers.Contract(ORDERBOOK_ADDR, OrderBookAbi, signer)
const [bid, ask] = await Promise.all([ob.bestBidPrice(), ob.bestAskPrice()])
const cfg = await ob.marketCfg()
const price: bigint = 3000n, qty = 1_000n
if (qty < cfg.minQty) throw new Error('minQty')
await (await ob.place(true, price, qty)).wait()
await (await ob.matchAtBest(16)).wait()
```

---

## 12. 同期戦略（イベント→ローカル板）

1. 起点ブロックから `OrderPlaced/TradeMatched` を時系列で取得
2. 各イベントでレベルの FIFO と合計数量を更新
3. 定期的/起動時に `bestBidPrice/bestAskPrice` と `Level.totalQty` を照合（自己修復）
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
