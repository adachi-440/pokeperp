# オンチェーン FBA Perp — フロントエンド連携仕様（ミニMVP・非SUAVE版）

> 目的: `book/spec_mini_mvp_fba_updated.md`（非SUAVE版）を基に、dAppフロントエンドがFBA（Frequent Batch Auction）方式の板と相互作用できるようにする実装指針（コントラクトIF、クエリ、アクション、イベント、UX要件）。

---

## 1. スコープと役割

- 対象: 単一マーケットのFBA板（FBAコントラクト）との read/write 連携。会計・清算は後続（SettlementHook/PerpEngine）に委譲
- 目的:
  - バッチオークション状態の可視化（次回実行時刻、保留中の注文、予想清算価格）
  - 発注（placeOrder）、取消（cancelOrder）
  - バッチ実行（executeFills）のトリガと進捗の可視化
  - 最小数量・ノーション等の前処理バリデーション
  - FBA特有のUX（バッチ待機、統一価格表示）
- **非SUAVE環境**: 標準的なEVM環境での動作を前提

---

## 2. コントラクトとインターフェース

### 2.1 FBA（本体）

実際に実装された関数（現在のFBA.sol）:

```solidity
// 注文管理
function placeOrder(Order memory ord) external;
function cancelOrder(string memory orderId, bool side) external;

// バッチ実行
function executeFills() external;

// View関数
function getTopBid() external view returns (Order memory);
function getTopAsk() external view returns (Order memory);
function getBidsAboveThreshold(uint256 threshold) external view returns (Order[] memory);
function getAsksBelowThreshold(uint256 threshold) external view returns (Order[] memory);
function getFills() external view returns (Fill[] memory);
function getPendingCancels() external view returns (Cancel[] memory);
```

注: 現在の実装には`marketCfg`、`lastBatchTime`、`batchInterval`等は含まれていませんが、将来的に追加可能です。

### 2.2 構造体定義（FBAHeap.Order）

```solidity
struct Order {
  uint256 price;      // 価格（tickSize統合済み）
  uint256 amount;     // 数量
  bool side;          // true=Bid, false=Ask
  string orderId;     // ユニークID
}

struct Fill {
  uint256 price;      // 清算価格
  uint256 amount;     // 約定数量
}

struct Cancel {
  string orderId;     // キャンセル対象ID
  bool side;          // 注文サイド
}
```

### 2.3 IOracleAdapter（参照・オプション）

```solidity
function indexPrice() external view returns (uint256);
function markPrice() external view returns (uint256);
function isFresh() external view returns (bool);
```

### 2.4 イベント（発火想定）

```solidity
event OrderPlace(uint256 price, uint256 amount, bool side);
event OrderCancel(string orderId, bool side);
event FillEvent(Fill);
// BatchExecutedイベントは現在の実装にはないが、追加可能
```

---

## 3. ステートモデルと基本クエリ

### 3.1 バッチタイミング管理（将来実装）

現在の実装にはバッチ間隔の制御がないため、フロントエンドで独自に管理する必要があります：

```typescript
// フロントエンドでバッチタイミングを管理
interface BatchConfig {
  suggestedInterval: number;  // 推奨バッチ間隔（秒）
  lastExecutionTime: number;  // 最後の実行時刻（ローカル記録）
}

// 手動実行が可能かチェック
function canExecuteBatch(config: BatchConfig): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= config.lastExecutionTime + config.suggestedInterval;
}
```

### 3.2 予想清算価格

```typescript
// 現在の最良気配から予想清算価格を計算
async function getEstimatedClearingPrice(fba: Contract): Promise<bigint | null> {
  const topBid = await fba.getTopBid();
  const topAsk = await fba.getTopAsk();

  // 有効な注文がない場合
  if (topBid.price === 0n || topAsk.price === MAX_UINT256) {
    return null;
  }

  // 交差していない場合
  if (topBid.price < topAsk.price) {
    return null;
  }

  return (topBid.price + topAsk.price) / 2n;
}
```

### 3.3 保留中の注文状態

```typescript
// 保留中のキャンセルを取得
const pendingCancels = await fba.getPendingCancels();

// 現在の約定リストを取得
const currentFills = await fba.getFills();
```

---

## 4. アクションとUXフロー

### 4.1 発注（placeOrder）

入力と前処理（フロント）:
```typescript
import { v4 as uuidv4 } from 'uuid';

// ユーザー入力
const side: 'Buy' | 'Sell';
const price: number;
const amount: number;

// 注文オブジェクトの作成
const order = {
  price: BigInt(Math.round(price * 1e18)), // 価格スケールに応じて調整
  amount: BigInt(amount),
  side: side === 'Buy',
  orderId: uuidv4() // ユニークIDを生成
};

// バリデーション（現在の実装には設定値がないため、フロントエンドで定義）
const MIN_AMOUNT = BigInt(100);
const MIN_NOTIONAL = BigInt(10000);

if (order.amount < MIN_AMOUNT) {
  throw new Error('Below minimum quantity');
}

if (order.amount * order.price < MIN_NOTIONAL) {
  throw new Error('Below minimum notional');
}

// 送信
await fba.placeOrder(order);
```

UX考慮:
- 注文後「バッチ実行待ち」メッセージ表示
- 手動でバッチ実行を促すボタンを表示
- 予想清算価格と自分の注文価格の差を表示

### 4.2 取消（cancelOrder）

```typescript
// キャンセルリクエスト
await fba.cancelOrder(orderId, side);

// UI更新
updateOrderStatus(orderId, 'CANCEL_PENDING');
showMessage('Cancel will be processed in next batch execution');
```

### 4.3 バッチ実行（executeFills）

```typescript
async function executeManualBatch() {
  try {
    // トランザクション送信
    const tx = await fba.executeFills();
    showMessage('Executing batch...');

    // トランザクション監視
    const receipt = await tx.wait();

    // イベント解析（FillEventを監視）
    const fillEvents = receipt.logs
      .filter(log => {
        try {
          const parsed = fba.interface.parseLog(log);
          return parsed?.name === 'FillEvent';
        } catch {
          return false;
        }
      });

    // 結果表示
    if (fillEvents.length > 0) {
      showMessage(`Batch executed: ${fillEvents.length} fills`);
      updateTradeHistory(fillEvents);
    } else {
      showMessage('Batch executed: No fills');
    }

    // ローカルのバッチ実行時刻を更新
    updateLastExecutionTime();
  } catch (error) {
    console.error('Batch execution failed:', error);
    showError('Failed to execute batch');
  }
}
```

### 4.4 Keeper機能（自動実行）

```typescript
// オプション: 自動バッチ実行
async function runAutoKeeper(intervalSeconds: number = 30) {
  while (true) {
    try {
      // 予想清算価格をチェック
      const clearingPrice = await getEstimatedClearingPrice(fba);

      if (clearingPrice !== null) {
        // 交差がある場合のみ実行
        await fba.executeFills();
        console.log('Auto batch executed');
      }
    } catch (e) {
      console.error('Auto batch failed:', e);
    }

    // 次回実行まで待機
    await sleep(intervalSeconds * 1000);
  }
}
```

---

## 5. イベント購読とリアルタイム更新

### 5.1 購読対象

```typescript
// 注文イベント
fba.on('OrderPlace', (price, amount, side) => {
  updateOrderBook({ price, amount, side });
  recalculateEstimatedPrice();
});

// キャンセルイベント
fba.on('OrderCancel', (orderId, side) => {
  updateCancelQueue(orderId, side);
});

// 約定イベント
fba.on('FillEvent', (fill) => {
  updateTradeHistory(fill);
  updateVolumeStats(fill);
  clearPendingOrders(); // バッチ実行完了として扱う
});
```

### 5.2 状態同期戦略

```typescript
// 定期的な同期
async function syncState() {
  // 最良気配を取得
  const [topBid, topAsk] = await Promise.all([
    fba.getTopBid(),
    fba.getTopAsk()
  ]);

  // 保留中のキャンセルを取得
  const pendingCancels = await fba.getPendingCancels();

  // 現在の約定を取得
  const currentFills = await fba.getFills();

  // ローカル状態を更新
  updateLocalState({
    topBid,
    topAsk,
    pendingCancels,
    currentFills,
    estimatedClearingPrice: calculateClearingPrice(topBid, topAsk)
  });
}

// 5秒ごとに同期
setInterval(syncState, 5000);
```

---

## 6. FBA特有のUI要素

### 6.1 バッチステータスパネル

```typescript
interface BatchStatus {
  canExecute: boolean;           // 手動実行可能か
  pendingCancelCount: number;    // 保留中のキャンセル数
  estimatedClearingPrice: bigint | null; // 予想清算価格
  currentFillCount: number;       // 現在の約定数
  hasCross: boolean;             // 価格交差があるか
}

// 表示例
<BatchStatusPanel>
  <div>Status: {status.hasCross ? 'Orders can match' : 'No crossing orders'}</div>
  <div>Pending Cancels: {status.pendingCancelCount}</div>
  {status.estimatedClearingPrice && (
    <div>Est. Clearing Price: ${formatPrice(status.estimatedClearingPrice)}</div>
  )}
  <button
    onClick={executeManualBatch}
    disabled={!status.canExecute}
  >
    Execute Batch
  </button>
</BatchStatusPanel>
```

### 6.2 注文ステータス表示

```typescript
enum OrderStatus {
  PENDING = 'Waiting for batch',
  CANCEL_PENDING = 'Cancel pending',
  FILLED = 'Filled at uniform price',
  CANCELLED = 'Cancelled'
}

// 注文リストの表示
<OrderList>
  {orders.map(order => (
    <OrderRow key={order.orderId}>
      <span>Price: ${formatPrice(order.price)}</span>
      <span>Amount: {order.amount}</span>
      <span>Status: {order.status}</span>
      {estimatedClearingPrice && (
        <span>Est. Fill: ${formatPrice(estimatedClearingPrice)}</span>
      )}
      <button onClick={() => cancelOrder(order.orderId, order.side)}>
        Cancel
      </button>
    </OrderRow>
  ))}
</OrderList>
```

### 6.3 清算価格インジケーター

```typescript
// リアルタイム予想清算価格
<PriceIndicator>
  <div>Best Bid: ${formatPrice(topBid.price)}</div>
  {estimatedClearingPrice ? (
    <div className="highlight">
      Clearing Price: ${formatPrice(estimatedClearingPrice)}
    </div>
  ) : (
    <div>No Cross</div>
  )}
  <div>Best Ask: ${formatPrice(topAsk.price)}</div>
</PriceIndicator>
```

---

## 7. エラーと例外処理

### 7.1 FBA特有のエラー

```typescript
// エラーハンドリング
try {
  await fba.executeFills();
} catch (error: any) {
  if (error.message?.includes('No valid orders')) {
    showMessage('No orders to match');
  } else if (error.message?.includes('Order not found')) {
    showMessage('Order already processed or does not exist');
  } else {
    showError('Transaction failed: ' + error.message);
  }
}
```

### 7.2 ユーザーフィードバック

```typescript
// 成功/失敗のフィードバック
function showTransactionStatus(tx: TransactionResponse) {
  // 保留中
  showMessage('Transaction pending...', 'info');

  tx.wait().then(receipt => {
    if (receipt.status === 1) {
      showMessage('Transaction successful', 'success');
    } else {
      showMessage('Transaction failed', 'error');
    }
  }).catch(error => {
    showMessage('Transaction error: ' + error.message, 'error');
  });
}
```

---

## 8. パフォーマンス最適化

### 8.1 効率的なデータ取得

```typescript
// バッチでデータ取得
async function fetchMarketData() {
  const [topBid, topAsk, fills, cancels] = await Promise.all([
    fba.getTopBid(),
    fba.getTopAsk(),
    fba.getFills(),
    fba.getPendingCancels()
  ]);

  return { topBid, topAsk, fills, cancels };
}
```

### 8.2 キャッシング戦略

```typescript
// メモリキャッシュ
class MarketDataCache {
  private cache = new Map<string, { data: any, timestamp: number }>();
  private ttl = 5000; // 5秒

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.ttl) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }
}

const cache = new MarketDataCache();

// 使用例
const topBid = await cache.get('topBid', () => fba.getTopBid());
```

---

## 9. TypeScript型定義とヘルパー

```typescript
// FBA専用型定義
export interface FBAOrder {
  price: bigint;
  amount: bigint;
  side: boolean;
  orderId: string;
}

export interface FBAFill {
  price: bigint;
  amount: bigint;
}

export interface FBACancel {
  orderId: string;
  side: boolean;
}

export interface MarketState {
  topBid: FBAOrder | null;
  topAsk: FBAOrder | null;
  estimatedClearingPrice: bigint | null;
  pendingCancels: FBACancel[];
  recentFills: FBAFill[];
  hasCross: boolean;
}

// ヘルパー関数
export function calculateClearingPrice(
  topBid: FBAOrder | null,
  topAsk: FBAOrder | null
): bigint | null {
  if (!topBid || !topAsk) return null;
  if (topBid.price === 0n || topAsk.price === MAX_UINT256) return null;
  if (topBid.price < topAsk.price) return null;

  return (topBid.price + topAsk.price) / 2n;
}

export function formatPrice(price: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = price / divisor;
  const fractionalPart = price % divisor;

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.slice(0, 2); // 小数点以下2桁

  return `${wholePart}.${trimmedFractional}`;
}

export function generateOrderId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

---

## 10. コール例（ethers v6）

```typescript
import { ethers } from "ethers";
import { FBAOrder } from "./types";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const fba = new ethers.Contract(FBA_ADDRESS, FBAAbi, signer);

// 1) 最良気配の取得
const topBid = await fba.getTopBid();
const topAsk = await fba.getTopAsk();

// 2) 注文発注
const order: FBAOrder = {
  price: ethers.parseEther("3000"), // 価格
  amount: ethers.parseEther("1"),   // 数量
  side: true, // Buy
  orderId: generateOrderId()
};

const tx = await fba.placeOrder(order);
await tx.wait();

// 3) キャンセル
await fba.cancelOrder(orderId, true);

// 4) バッチ実行
const execTx = await fba.executeFills();
const receipt = await execTx.wait();

// 5) 約定情報の取得
const fills = await fba.getFills();
console.log('Current fills:', fills);
```

---

## 11. 同期戦略（イベント→ローカル状態）

```typescript
class FBAStateManager {
  private state: MarketState = {
    topBid: null,
    topAsk: null,
    estimatedClearingPrice: null,
    pendingCancels: [],
    recentFills: [],
    hasCross: false
  };

  constructor(private contract: Contract) {
    this.setupEventListeners();
    this.syncInitialState();
  }

  private setupEventListeners() {
    // 注文イベント
    this.contract.on('OrderPlace', async () => {
      await this.refreshOrderBook();
    });

    // キャンセルイベント
    this.contract.on('OrderCancel', async () => {
      await this.refreshCancels();
    });

    // 約定イベント
    this.contract.on('FillEvent', async (fill) => {
      this.state.recentFills.push(fill);
      await this.refreshOrderBook();
    });
  }

  private async refreshOrderBook() {
    const [topBid, topAsk] = await Promise.all([
      this.contract.getTopBid(),
      this.contract.getTopAsk()
    ]);

    this.state.topBid = this.parseOrder(topBid, true);
    this.state.topAsk = this.parseOrder(topAsk, false);
    this.state.estimatedClearingPrice = calculateClearingPrice(
      this.state.topBid,
      this.state.topAsk
    );
    this.state.hasCross = this.state.estimatedClearingPrice !== null;
  }

  private parseOrder(order: any, isBid: boolean): FBAOrder | null {
    if ((isBid && order.price === 0n) ||
        (!isBid && order.price === MAX_UINT256)) {
      return null;
    }
    return order;
  }

  getState(): MarketState {
    return { ...this.state };
  }
}
```

---

## 12. デプロイ情報（例）

```typescript
// ネットワーク設定
const NETWORK_CONFIG = {
  chainId: 42161, // Arbitrum One
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  contracts: {
    FBA: '0x...',
    OracleAdapter: '0x...' // オプション
  },
  params: {
    priceScale: BigInt(10 ** 18), // 1e18
    minAmount: BigInt(100),
    minNotional: BigInt(10000)
  }
};
```

---

## 13. 今後の拡張（フロント側）

- **バッチ間隔管理**: コントラクトにbatchInterval実装後の対応
- **高度な価格予測**: 過去のバッチデータから清算価格を予測
- **バッチ分析**: 約定率、価格改善率等の統計表示
- **自動戦略**: バッチタイミングに合わせた自動発注
- **マルチマーケット**: 複数FBA市場の同時監視・実行

---

更新履歴:
- v0.2 非SUAVE版（標準EVM環境対応、実装に基づく調整）
- v0.1 FBA版初版（SUAVE想定）