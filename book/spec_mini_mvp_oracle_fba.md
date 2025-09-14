# オンチェーン Oracle Adapter — FBA版ミニMVP（Push型）仕様（TypeScript 想定）

> 目的: FBA（Frequent Batch Auction）システム向けに、TypeScript製のサーバー（Reporter）が定期的にオンチェーンのOracle Adapterに価格を送信（push）する最小仕様を定義する。FBAOrderBookからは`indexPrice()`/`markPrice()`を参照し、band ガードおよび清算価格計算に利用する。

---

## 1. スコープと設計方針

- 単一マーケット、単一リポーター（サーバー）を想定した Push 型オラクル
- 価格単位はFBAOrderBookと整合（例: USD セント = 1e2）
- バッチ実行タイミングとの同期を考慮した更新頻度
- ミニMVPでは `indexPrice == markPrice`（同値）。将来は別値やTWAPを検討可能
- ステート最小限: 価格、最終更新時刻、許容ハートビート（staleness）

---

## 2. コントラクトIF（I/F）

FBAOrderBookからの参照は以下（ミニMVPは同値を返す）:

```solidity
interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}
```

Push型更新・運用のための最小拡張（Adapter実装側）:

```solidity
interface IOracleAdmin {
    function setReporter(address reporter) external;          // onlyOwner
    function setHeartbeat(uint64 heartbeatSec) external;      // onlyOwner
    function pause(bool p) external;                          // onlyOwner
}

interface IOraclePush {
    function pushPrice(uint256 price) external;               // onlyReporter
}

interface IOracleViewExt {
    function lastUpdate() external view returns (uint64);
    function heartbeatSec() external view returns (uint64);
    function isFresh() external view returns (bool);          // now - lastUpdate <= heartbeatSec
    function priceScale() external view returns (uint64);     // 例: 1e2（FBAと一致）
}
```

---

## 3. FBAバッチとの連携考慮事項

### 3.1 更新タイミング
- **バッチ実行前**: `executeFills()`実行前に最新価格が反映されていることが理想
- **更新頻度**: `batchInterval`の1/3〜1/2の間隔で更新（例: バッチ30秒なら10-15秒ごと）
- **清算価格への影響**: bandチェックで使用されるため、古い価格は約定を制限する可能性

### 3.2 価格の一貫性
- FBAの清算価格計算: `(bidMax + askMin) / 2`
- Oracleのindex価格はこの清算価格のband判定に使用
- 価格が古い場合、正当な約定がband違反で拒否される可能性

---

## 4. データモデルと単位

- `price`（uint256）: 価格のベース単位は`priceScale`。FBAと同一単位を推奨
- `lastUpdate`（uint64, epoch秒）: 最終更新時刻
- `heartbeatSec`（uint64）: 許容する最大更新間隔。超過時は`isFresh=false`
- `reporter`（address）: プッシュ権限を持つEOA/署名者
- `paused`（bool）: 緊急時の停止

注意（単位整合）
- FBAOrderBookのband判定は清算価格と`indexPrice()`を直接比較するため、両者の単位を一致させる（例: 1e2）

---

## 5. イベント

```solidity
event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
event Paused(bool paused);
```

---

## 6. 典型フロー（サーバー → Adapter → FBA）

1) サーバー（Reporter）が外部ソースから価格を取得（例: 集計所、取引所API、TWAP等）
2) `priceOnChain = round(priceOffChain, priceScale)`で単位に丸め
3) バッチ実行タイミングを考慮した間隔で`pushPrice(priceOnChain)`を送信
4) コントラクトは`indexPrice=markPrice=priceOnChain`、`lastUpdate=block.timestamp`を更新し`PricePushed`発火
5) FBAOrderBookは`executeFills()`時に`indexPrice()`を参照してband判定を実施

補足
- バッチ実行の直前（例: 実行の5秒前）に価格更新することで、最新価格でのband判定を保証
- 頻度はチェーンの混雑/ガス費に応じて調整。`heartbeatSec`を超えないこと

---

## 7. ガードと失敗時の動作

- `paused == true`のとき、`pushPrice`は拒否。view系のみ許可
- `isFresh()==false`の場合:
  - FBAの`executeFills`はband判定を慎重に（場合により約定をスキップ）
  - フロント側でバッチ実行前の警告表示
- 価格異常（NaN/負値）は呼び出し前にサーバー側で除去。Adapterでは`require(price > 0)`

---

## 8. 運用・権限

- オーナー（運用者）
  - `setReporter`, `setHeartbeat`, `pause`を実行可能
  - Reporter鍵のローテーション時は`ReporterUpdated`を発火
- Reporter（サーバー）
  - `pushPrice`のみ実行可能。EOA推奨、必要に応じてキーパーサービスを併用
  - バッチ実行スケジュールと同期した自動更新を実装

---

## 9. 参考実装シグネチャ（Solidity）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}

contract OracleAdapterFBA is IOracleAdapter {
    address public owner;
    address public reporter;
    uint64  public heartbeat;      // sec
    uint64  public lastUpdated;    // epoch sec
    uint64  public immutable scale; // e.g., 1e2
    bool    public paused;

    uint256 private _price;        // index == mark (MVP)

    event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
    event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
    event Paused(bool paused);

    constructor(address _reporter, uint64 _scale, uint64 _heartbeat) {
        owner = msg.sender;
        reporter = _reporter;
        scale = _scale;
        heartbeat = _heartbeat;
    }

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
    modifier onlyReporter() { require(msg.sender == reporter, "reporter"); _; }

    function setReporter(address r) external onlyOwner {
        emit ReporterUpdated(reporter, r);
        reporter = r;
    }
    function setHeartbeat(uint64 hb) external onlyOwner {
        emit HeartbeatUpdated(heartbeat, hb);
        heartbeat = hb;
    }
    function pause(bool p) external onlyOwner { paused = p; emit Paused(p); }

    function pushPrice(uint256 price) external onlyReporter {
        require(!paused, "paused");
        require(price > 0, "price");
        _price = price;
        lastUpdated = uint64(block.timestamp);
        emit PricePushed(price, lastUpdated, msg.sender);
    }

    // IOracleAdapter
    function indexPrice() external view returns (uint256) { return _price; }
    function markPrice()  external view returns (uint256) { return _price; }

    // helpers
    function isFresh() external view returns (bool) {
        return uint64(block.timestamp) - lastUpdated <= heartbeat;
    }
    function priceScale() external view returns (uint64) { return scale; }
}
```

---

## 10. TypeScript実装（Reporter）仕様 - FBA対応版

### 10.1 ランタイム/依存

- Node.js 18+（推奨 20+）
- 主要パッケージ
  - `ethers@^6`（RPC/tx）
  - `dotenv`（環境変数）
  - `axios`（価格取得）または任意のHTTPクライアント
  - `p-retry`/`p-timeout`（堅牢なリトライ/タイムアウト）
  - `node-cron`（バッチスケジュール同期）
  - `zod`（設定/レスポンスバリデーション）
  - `winston`等ロガー（任意）

### 10.2 環境変数

- `RPC_URL`（必須）: L2 RPC エンドポイント
- `PRIVATE_KEY`（必須）: Reporter EOA の秘密鍵
- `ORACLE_ADDRESS`（必須）: `OracleAdapterFBA`のコントラクトアドレス
- `FBA_ADDRESS`（必須）: `FBAOrderBook`のコントラクトアドレス（バッチタイミング取得用）
- `PRICE_SOURCE_URL`（任意）: 外部価格APIエンドポイント
- `SCALE`（任意）: 例 `100`。未指定時はon-chainの`priceScale()`を参照
- `BATCH_INTERVAL_SEC`（任意）: FBAのバッチ間隔（例 `30`）
- `PRICE_UPDATE_OFFSET_SEC`（任意）: バッチ実行の何秒前に価格更新するか（例 `5`）

### 10.3 バッチ同期ロジック

```ts
// FBAのバッチタイミングを監視し、適切なタイミングで価格更新
async function syncWithBatch(fbaContract: Contract, oracleContract: Contract) {
    const batchInterval = await fbaContract.batchInterval();
    const lastBatchTime = await fbaContract.lastBatchTime();

    // 次回バッチ実行時刻を計算
    const nextBatch = lastBatchTime + batchInterval;
    const updateTime = nextBatch - PRICE_UPDATE_OFFSET_SEC;

    // スケジュール設定
    scheduleUpdate(updateTime, async () => {
        await pushPriceUpdate(oracleContract);
    });
}
```

### 10.4 TypeScriptサンプル（FBA対応版）

```ts
import 'dotenv/config';
import { ethers } from 'ethers';
import axios from 'axios';
import * as cron from 'node-cron';

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS!;
const FBA_ADDRESS = process.env.FBA_ADDRESS!;
const PRICE_SOURCE_URL = process.env.PRICE_SOURCE_URL ?? 'https://example.com/price';
const BATCH_INTERVAL_SEC = Number(process.env.BATCH_INTERVAL_SEC ?? '30');
const PRICE_UPDATE_OFFSET_SEC = Number(process.env.PRICE_UPDATE_OFFSET_SEC ?? '5');

const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function isFresh() external view returns (bool)'
];

const FBAAbi = [
  'function batchInterval() external view returns (uint256)',
  'function lastBatchTime() external view returns (uint256)',
  'event BatchExecuted(uint256 timestamp, uint256 fillCount)'
];

function roundToScale(price: number, scale: bigint): bigint {
  return BigInt(Math.round(price * Number(scale)));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, wallet);
  const fba = new ethers.Contract(FBA_ADDRESS, FBAAbi, provider);

  const scale: bigint = BigInt(await oracle.priceScale());
  console.log('Oracle scale:', scale.toString());

  async function fetchPrice(): Promise<number> {
    const resp = await axios.get(PRICE_SOURCE_URL, { timeout: 1500 });
    const v = Number(resp.data.price);
    if (!Number.isFinite(v) || v <= 0) throw new Error('Invalid price');
    return v;
  }

  async function pushPrice() {
    try {
      const offchainPrice = await fetchPrice();
      const onchainPrice = roundToScale(offchainPrice, scale);

      const fee = await provider.getFeeData();
      const tx = await oracle.pushPrice(onchainPrice, {
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas
      });
      const receipt = await tx.wait();
      console.log(`Price pushed: ${onchainPrice.toString()}, tx: ${receipt?.hash}`);
    } catch (e) {
      console.error('Push price error:', e);
    }
  }

  // バッチ実行イベントを監視
  fba.on('BatchExecuted', async (timestamp, fillCount) => {
    console.log(`Batch executed at ${timestamp}, fills: ${fillCount}`);
    // 次回バッチに向けて価格更新スケジュールを調整
    scheduleNextUpdate();
  });

  async function scheduleNextUpdate() {
    const batchInterval = await fba.batchInterval();
    const lastBatch = await fba.lastBatchTime();
    const nextBatch = Number(lastBatch) + Number(batchInterval);
    const now = Math.floor(Date.now() / 1000);

    // 次回バッチの少し前に価格更新
    const updateTime = nextBatch - PRICE_UPDATE_OFFSET_SEC;
    const delay = Math.max(0, (updateTime - now) * 1000);

    console.log(`Next price update scheduled in ${delay/1000}s`);
    setTimeout(async () => {
      await pushPrice();
      scheduleNextUpdate(); // 再帰的にスケジュール
    }, delay);
  }

  // 初回価格更新とスケジュール開始
  await pushPrice();
  await scheduleNextUpdate();

  // フォールバック: heartbeat間隔での定期更新
  const heartbeat = Number(await oracle.heartbeat());
  setInterval(async () => {
    const isFresh = await oracle.isFresh();
    if (!isFresh) {
      console.log('Price stale, forcing update');
      await pushPrice();
    }
  }, heartbeat * 500); // heartbeatの半分の間隔でチェック
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 11. サーバー仕様（Reporter） - FBA特化

- **入力ソース**: 1つ以上の取引所/アグリゲータAPI。異常値はロバスト統計（median/trimmed mean）で平滑化
- **バッチ同期**: FBAのバッチ実行タイミングを監視し、実行前に価格を更新
- **正規化**: `priceOnChain = roundToScale(price, scale)`。例: `$3025.1234` → `302512`（scale=1e2）
- **周期**:
  - 通常: バッチ実行の5-10秒前に更新
  - フォールバック: `heartbeatSec`未満で定期送信
- **エラー処理**: 送信失敗時はリトライ。バッチ実行に間に合わない場合は運用者に通知
- **健全性**: 直近チェーン上`lastUpdated`と乖離が大きい場合に警告

---

## 12. FBAOrderBook側の利用上の注意

- **band判定の単位整合**: 清算価格と`oracle.indexPrice()`が同一スケールであること
- **鮮度チェック**: `executeFills()`実行時に`isFresh()`を確認し、古い価格での約定を制限
- **タイミング最適化**: Oracleの更新タイミングとバッチ実行タイミングの同期が重要
- **止め方**: オラクル停止時は`pause(true)`、FBAは`executeFills`を自動スキップまたは制限モードへ

---

## 13. TODO（実装チェックリスト）

- [ ] Adapter実装（push/set/view/権限/イベント）- FBA対応
- [ ] デプロイパラメータ（`reporter`, `scale`, `heartbeat`）の決定
- [ ] FBAとの連携パラメータ（`batchInterval`同期）の設定
- [ ] サーバー（Reporter）実装:
  - [ ] 価格取得→正規化→push tx基本機能
  - [ ] FBAバッチタイミング監視機能
  - [ ] バッチ実行前の自動価格更新
- [ ] モニタリング:
  - [ ] `lastUpdated`, `isFresh`の監視
  - [ ] バッチ実行イベントとの同期状態
- [ ] フォールバック手順（報告鍵ローテーション、pause、再開）
- [ ] パフォーマンステスト（バッチ実行前の更新が間に合うか）

---

更新履歴:
- v0.1 FBA版初版（バッチ同期を考慮したPush型Oracle Adapter仕様）