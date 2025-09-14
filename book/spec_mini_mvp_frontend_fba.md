# オンチェーン FBA Perp — フロントエンド連携仕様（ミニMVP）

> 目的: `book/spec_mini_mvp_fba.md`を基に、dAppフロントエンドがFBA（Frequent Batch Auction）方式の板と相互作用できるようにする実装指針（コントラクトIF、クエリ、アクション、イベント、UX要件）。

---

## 1. スコープと役割

- 対象: 単一マーケットのFBA板（FBAOrderBook）との read/write 連携。会計・清算は後続（SettlementHook/PerpEngine）に委譲
- 目的:
  - バッチオークション状態の可視化（次回実行時刻、保留中の注文、予想清算価格）
  - 発注（placeOrder）、取消（cancelOrder）
  - バッチ実行（executeFills）のトリガと進捗の可視化
  - band/最小数量・ノーション等の前処理バリデーション
  - FBA特有のUX（バッチ待機、統一価格表示）

---

## 2. コントラクトとインターフェース

### 2.1 FBAOrderBook（本体）

必須外部関数（候補シグネチャ）:

```solidity
// 注文管理
function placeOrder(Order memory ord) external;
function cancelOrder(string orderId, bool side) external;

// バッチ実行
function executeFills() external;

// View関数
function getTopOrder(bool side) external view returns (Order memory);
function getTopOrderList(uint256 threshold, bool side) external view returns (Order[] memory);
function getEstimatedClearingPrice() external view returns (uint256);
function getNextBatchTime() external view returns (uint256);

// 設定/状態
function marketCfg() external view returns (
  uint128 minQty,
  uint256 minNotional,
  uint256 deviationLimit,
  uint256 contractSize,
  uint256 batchInterval
);
function lastBatchTime() external view returns (uint256);
function fills() external view returns (Fill[] memory);
function cancels() external view returns (Cancel[] memory);
function settlementHook() external view returns (address);
```

### 2.2 構造体定義

```solidity
struct Order {
  uint256 price;
  uint256 amount;
  bool side;        // true=Bid, false=Ask
  string orderId;
}

struct Fill {
  uint256 price;    // 清算価格
  uint256 amount;
}

struct Cancel {
  string orderId;
  bool side;
}
```

### 2.3 IOracleAdapter（参照）

```solidity
function indexPrice() external view returns (uint256);
function markPrice() external view returns (uint256);
function isFresh() external view returns (bool);
```

### 2.4 イベント（発火想定）

```solidity
event OrderPlace(uint256 price, uint256 amount, bool side);
event OrderCancel(string orderId, bool side);
event FillEvent(Fill fill);
event BatchExecuted(uint256 timestamp, uint256 fillCount);
```

---

## 3. ステートモデルと基本クエリ

### 3.1 バッチタイミング管理

```typescript
// 次回バッチ実行時刻の計算
const nextBatchTime = lastBatchTime + batchInterval;
const timeUntilBatch = nextBatchTime - currentTimestamp;

// UIでカウントダウン表示
"Next batch in: 23 seconds"
```

### 3.2 予想清算価格

```typescript
// 現在の最良気配から予想清算価格を計算
const topBid = await fba.getTopOrder(true);
const topAsk = await fba.getTopOrder(false);
const estimatedPrice = (topBid.price + topAsk.price) / 2n;
```

### 3.3 保留中の注文状態

- **Pending Orders**: バッチ実行待ちの注文
- **Pending Cancels**: バッチ実行時に処理されるキャンセル
- **Estimated Fills**: 現在の板状態から予想される約定

---

## 4. アクションとUXフロー

### 4.1 発注（placeOrder）

入力と前処理（フロント）:
```typescript
// ユーザー入力
const side: 'Buy' | 'Sell';
const price: number;
const amount: number;

// バリデーション
const order: Order = {
  price: BigInt(Math.round(price * 100)), // scale=100の場合
  amount: BigInt(amount),
  side: side === 'Buy',
  orderId: generateOrderId() // UUID等
};

// ガード確認
if (order.amount < cfg.minQty) throw new Error('Below minimum quantity');
if (order.amount * order.price < cfg.minNotional) throw new Error('Below minimum notional');

// band確認（参考）
const indexPrice = await oracle.indexPrice();
if (!withinBand(order.price, indexPrice, cfg.deviationLimit)) {
  showWarning('Price outside deviation band');
}

// 送信
await fba.placeOrder(order);
```

UX考慮:
- 注文後「次回バッチで処理されます」メッセージ表示
- バッチまでの残り時間を表示
- 予想清算価格と自分の注文価格の差を表示

### 4.2 取消（cancelOrder）

```typescript
// キャンセルリクエスト
await fba.cancelOrder(orderId, side);

// UI更新
// "Cancel pending - will be processed in next batch"
updateOrderStatus(orderId, 'CANCEL_PENDING');
```

注意点:
- キャンセルは即座には実行されない
- 次回バッチで処理される
- バッチ実行前なら複数回キャンセル可能（最新が有効）

### 4.3 バッチ実行（executeFills）

実行条件の確認:
```typescript
const now = Date.now() / 1000;
const nextBatch = await fba.getNextBatchTime();

if (now >= nextBatch) {
  // バッチ実行可能
  const tx = await fba.executeFills();

  // トランザクション監視
  const receipt = await tx.wait();

  // イベント解析
  const fillEvents = receipt.logs.filter(log => log.event === 'FillEvent');
  const batchEvent = receipt.logs.find(log => log.event === 'BatchExecuted');

  // UI更新
  showBatchResults(fillEvents, batchEvent);
}
```

### 4.4 自動実行（Keeper機能）

```typescript
// バッチ実行を自動化
async function runKeeper() {
  while (true) {
    const nextBatch = await fba.getNextBatchTime();
    const now = Math.floor(Date.now() / 1000);

    if (now >= nextBatch) {
      try {
        await fba.executeFills();
        console.log('Batch executed successfully');
      } catch (e) {
        console.error('Batch execution failed:', e);
      }
    }

    // 次回チェックまで待機
    await sleep(5000);
  }
}
```

---

## 5. イベント購読とリアルタイム更新

### 5.1 購読対象

```typescript
// 注文イベント
fba.on('OrderPlace', (price, amount, side) => {
  updatePendingOrders({ price, amount, side });
  recalculateEstimatedPrice();
});

// キャンセルイベント
fba.on('OrderCancel', (orderId, side) => {
  updateCancelQueue(orderId, side);
});

// バッチ実行イベント
fba.on('BatchExecuted', (timestamp, fillCount) => {
  clearPendingOrders();
  clearCancelQueue();
  updateLastBatchTime(timestamp);
  startBatchCountdown();
});

// 約定イベント
fba.on('FillEvent', (fill) => {
  updateTradeHistory(fill);
  updateVolumeStats(fill);
});
```

### 5.2 状態同期戦略

```typescript
// バッチサイクルごとの同期
async function syncWithBatch() {
  // 現在のバッチ状態を取得
  const pendingOrders = await fba.getPendingOrders();
  const pendingCancels = await fba.cancels();
  const lastBatch = await fba.lastBatchTime();

  // ローカル状態を更新
  setState({
    orders: pendingOrders,
    cancels: pendingCancels,
    lastBatchTime: lastBatch,
    nextBatchTime: lastBatch + batchInterval
  });
}
```

---

## 6. FBA特有のUI要素

### 6.1 バッチステータスパネル

```typescript
interface BatchStatus {
  nextBatchTime: number;
  timeRemaining: number;
  pendingOrderCount: number;
  pendingCancelCount: number;
  estimatedClearingPrice: bigint;
  canExecute: boolean;
}

// 表示例
<BatchStatusPanel>
  Next Batch: 23s
  Pending Orders: 15
  Pending Cancels: 3
  Est. Clearing Price: $3,025.50
  [Execute Batch] // ボタン（実行可能時のみ活性）
</BatchStatusPanel>
```

### 6.2 注文ステータス表示

```typescript
enum OrderStatus {
  PENDING = 'Waiting for batch',
  CANCEL_PENDING = 'Cancel pending',
  FILLED = 'Filled at uniform price',
  CANCELLED = 'Cancelled',
  PARTIAL = 'Partially filled'
}

// 注文リストの表示
<OrderList>
  {orders.map(order => (
    <OrderRow>
      Price: {order.price}
      Amount: {order.amount}
      Status: {order.status}
      Est. Fill Price: {estimatedClearingPrice}
    </OrderRow>
  ))}
</OrderList>
```

### 6.3 清算価格インジケーター

```typescript
// リアルタイム予想清算価格
<PriceIndicator>
  <CurrentBid>{topBid.price}</CurrentBid>
  <EstimatedClearing>{(topBid + topAsk) / 2}</EstimatedClearing>
  <CurrentAsk>{topAsk.price}</CurrentAsk>
</PriceIndicator>
```

---

## 7. エラーと例外処理

### 7.1 FBA特有のエラー

- **バッチ未到達**: `"Batch interval not reached"`
- **空バッチ**: `"No orders to match"`
- **band違反**: `"Clearing price outside deviation band"`
- **キャンセル失敗**: `"Order not found or already processed"`

### 7.2 エラーハンドリング例

```typescript
try {
  await fba.executeFills();
} catch (error) {
  if (error.message.includes('Batch interval')) {
    showMessage(`Wait ${timeRemaining}s for next batch`);
  } else if (error.message.includes('deviation band')) {
    showWarning('Price deviation too large - batch skipped');
  } else {
    showError('Batch execution failed');
  }
}
```

---

## 8. パフォーマンス最適化

### 8.1 効率的なデータ取得

```typescript
// Multicallを使用した一括取得
const multicall = new Multicall({ provider });
const calls = [
  { target: FBA_ADDRESS, callData: fba.interface.encodeFunctionData('getTopOrder', [true]) },
  { target: FBA_ADDRESS, callData: fba.interface.encodeFunctionData('getTopOrder', [false]) },
  { target: FBA_ADDRESS, callData: fba.interface.encodeFunctionData('lastBatchTime') },
  { target: ORACLE_ADDRESS, callData: oracle.interface.encodeFunctionData('indexPrice') }
];
const results = await multicall.aggregate(calls);
```

### 8.2 キャッシング戦略

```typescript
// バッチサイクルに合わせたキャッシュ
const cache = new Map();
const CACHE_DURATION = batchInterval * 0.8; // バッチ間隔の80%

function getCachedOrFetch(key: string, fetcher: () => Promise<any>) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.value;
  }
  const value = await fetcher();
  cache.set(key, { value, timestamp: Date.now() });
  return value;
}
```

---

## 9. TypeScript型定義とヘルパー

```typescript
// FBA専用型定義
export interface FBAMarketCfg {
  minQty: bigint;
  minNotional: bigint;
  deviationLimit: bigint;
  contractSize: bigint;
  batchInterval: bigint;
}

export interface FBAOrder {
  price: bigint;
  amount: bigint;
  side: boolean;
  orderId: string;
  timestamp?: number;
  status?: OrderStatus;
}

export interface BatchState {
  lastBatchTime: number;
  nextBatchTime: number;
  pendingOrders: FBAOrder[];
  pendingCancels: string[];
  estimatedClearingPrice: bigint | null;
}

// ヘルパー関数
export function calculateClearingPrice(topBid: bigint, topAsk: bigint): bigint {
  return (topBid + topAsk) / 2n;
}

export function timeUntilNextBatch(lastBatch: number, interval: number): number {
  const now = Math.floor(Date.now() / 1000);
  const next = lastBatch + interval;
  return Math.max(0, next - now);
}

export function canExecuteBatch(lastBatch: number, interval: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= lastBatch + interval;
}

export function formatBatchCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
```

---

## 10. コール例（ethers v6）

```typescript
import { ethers } from "ethers";

const fba = new ethers.Contract(FBA_ADDRESS, FBAAbi, signer);

// 1) バッチ状態の確認
const lastBatch = await fba.lastBatchTime();
const cfg = await fba.marketCfg();
const nextBatch = Number(lastBatch) + Number(cfg.batchInterval);

// 2) 注文発注
const order = {
  price: ethers.parseUnits("3000", 2), // scale=100
  amount: 1000n,
  side: true, // Buy
  orderId: generateUUID()
};

if (order.amount < cfg.minQty) throw new Error("Below minimum");
const tx = await fba.placeOrder(order);
await tx.wait();

// 3) キャンセル
await fba.cancelOrder(orderId, true);

// 4) バッチ実行（Keeper/ユーザー）
if (Date.now() / 1000 >= nextBatch) {
  const execTx = await fba.executeFills();
  const receipt = await execTx.wait();

  // イベントログから結果を取得
  const fills = receipt.logs
    .filter(log => log.event === 'FillEvent')
    .map(log => log.args);
}

// 5) 予想清算価格の取得
const topBid = await fba.getTopOrder(true);
const topAsk = await fba.getTopOrder(false);
const estimatedPrice = (topBid.price + topAsk.price) / 2n;
```

---

## 11. 同期戦略（イベント→ローカル状態）

### 11.1 バッチサイクル同期

```typescript
class FBAStateManager {
  private state: BatchState;
  private provider: Provider;
  private contract: Contract;

  async syncWithChain() {
    // バッチ実行イベントを監視
    this.contract.on('BatchExecuted', async (timestamp, fillCount) => {
      // 状態をリセット
      this.state.pendingOrders = [];
      this.state.pendingCancels = [];
      this.state.lastBatchTime = Number(timestamp);

      // 新しいサイクル開始
      this.startNewCycle();
    });

    // 注文イベントを監視
    this.contract.on('OrderPlace', (price, amount, side) => {
      this.state.pendingOrders.push({ price, amount, side });
      this.updateEstimatedPrice();
    });
  }

  private startNewCycle() {
    const interval = this.state.batchInterval;
    this.state.nextBatchTime = this.state.lastBatchTime + interval;

    // カウントダウン開始
    this.startCountdown();
  }

  private updateEstimatedPrice() {
    const bids = this.state.pendingOrders.filter(o => o.side);
    const asks = this.state.pendingOrders.filter(o => !o.side);

    if (bids.length > 0 && asks.length > 0) {
      const maxBid = Math.max(...bids.map(b => b.price));
      const minAsk = Math.min(...asks.map(a => a.price));
      this.state.estimatedClearingPrice = (maxBid + minAsk) / 2;
    }
  }
}
```

---

## 12. 今後の拡張（フロント側）

- **高度な価格予測**: 過去のバッチデータから清算価格を予測
- **バッチ分析**: 約定率、価格改善率等の統計表示
- **自動戦略**: バッチタイミングに合わせた自動発注
- **マルチマーケット**: 複数FBA市場の同時監視・実行
- **MEV保護表示**: SUAVEによる秘匿性のユーザー向け説明

---

## 13. デプロイ情報（例）

```typescript
// ネットワーク設定
const NETWORK_CONFIG = {
  chainId: 42161, // Arbitrum One
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  contracts: {
    FBAOrderBook: '0x...',
    OracleAdapter: '0x...',
    SettlementHook: '0x...'
  },
  params: {
    batchInterval: 30, // 30秒
    priceScale: 100,   // 1e2
    minQty: 100,
    minNotional: 10000
  }
};
```

---

更新履歴:
- v0.1 FBA版初版（バッチオークション方式対応のフロント連携仕様）