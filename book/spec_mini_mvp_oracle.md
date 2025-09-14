# オンチェーン Oracle Adapter — ミニMVP（Push型）仕様（TypeScript 想定）

> 目的: 単一マーケット向けに、TypeScript 製のサーバー（Reporter）が定期的にオンチェーンの Oracle Adapter に価格を送信（push）する最小仕様を定義する。OrderBookMVP からは `indexPrice()`/`markPrice()` を参照し、band ガードに利用する。

---

## 1. スコープと設計方針

- 単一マーケット、単一リポーター（サーバー）を想定した Push 型オラクル。
- 価格は `tickSize` と同一単位（例: USD セント = 1e2）で表現し、OrderBook の band 判定と整合。
- ミニMVPでは `indexPrice == markPrice`（同値）。将来は別値やTWAPを検討可能。
- ステート最小限: 価格、最終更新時刻、許容ハートビート（staleness）。

---

## 2. コントラクトIF（I/F）

OrderBookMVP からの参照は以下（ミニMVPは同値を返す）:

```solidity
interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}
```

Push 型更新・運用のための最小拡張（Adapter 実装側）:

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
    function priceScale() external view returns (uint64);     // 例: 1e2（tickSize と一致）
}
```

---

## 3. データモデルと単位

- `price`（uint256）: 価格のベース単位は `priceScale`。ミニMVPでは `priceScale == tickSize` を推奨。
- `lastUpdate`（uint64, epoch秒）: 最終更新時刻。
- `heartbeatSec`（uint64）: 許容する最大更新間隔。超過時は `isFresh=false`。
- `reporter`（address）: プッシュ権限を持つEOA/署名者。
- `paused`（bool）: 緊急時の停止。

注意（単位整合）
- OrderBook の band 判定は `exec = priceTick * tickSize` と `indexPrice()` を直接比較するため、両者の単位を一致させる（例: 1e2）。

---

## 4. イベント

```solidity
event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
event Paused(bool paused);
```

---

## 5. 典型フロー（サーバー → Adapter）

1) サーバー（Reporter）が外部ソースから価格を取得（例: 集計所、取引所API、TWAP等）。
2) `priceOnChain = round(priceOffChain, priceScale)` で単位に丸め。
3) 一定間隔（`heartbeatSec` 以内、例: 5〜15秒）で `pushPrice(priceOnChain)` を送信。
4) コントラクトは `indexPrice=markPrice=priceOnChain`、`lastUpdate=block.timestamp` を更新し `PricePushed` 発火。
5) OrderBook は `indexPrice()` を参照して band 判定を実施。

補足
- ミニMVPでは署名検証は行わず、`onlyReporter` の `msg.sender` による認可のみ。
- 頻度はチェーンの混雑/ガス費に応じて調整。`heartbeatSec` を超えないこと。

---

## 6. ガードと失敗時の動作

- `paused == true` のとき、`pushPrice` は拒否。view系のみ許可。
- `isFresh()==false` の場合、フロント側で `matchAtBest` ボタンを非活性にする等のUXガードを推奨。
- 価格異常（NaN/負値）は呼び出し前にサーバー側で除去。Adapterでは `require(price > 0)`。

---

## 7. 運用・権限

- オーナー（運用者）
  - `setReporter`, `setHeartbeat`, `pause` を実行可能。
  - Reporter鍵のローテーション時は `ReporterUpdated` を発火。
- Reporter（サーバー）
  - `pushPrice` のみ実行可能。EOA推奨、必要に応じてキーパーサービスを併用。

---

## 8. 参考実装シグネチャ（Solidity）

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}

contract OracleAdapterSimple is IOracleAdapter {
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

## 9. TypeScript 実装（Reporter）仕様

### 9.1 ランタイム/依存

- Node.js 18+（推奨 20+）
- 主要パッケージ
  - `ethers@^6`（RPC/tx）
  - `dotenv`（環境変数）
  - `axios`（価格取得）または任意のHTTPクライアント
  - `p-retry`/`p-timeout`（堅牢なリトライ/タイムアウト）
  - `zod`（設定/レスポンスバリデーション）
  - `winston` 等ロガー（任意）

### 9.2 環境変数

- `RPC_URL`（必須）: L2 RPC エンドポイント
- `PRIVATE_KEY`（必須）: Reporter EOA の秘密鍵
- `ORACLE_ADDRESS`（必須）: `OracleAdapterSimple` のコントラクトアドレス
- `PRICE_SOURCE_URL`（任意）: 外部価格APIエンドポイント
- `SCALE`（任意）: 例 `100`。未指定時は on-chain の `priceScale()` を参照
- `HEARTBEAT_SEC`（任意）: 例 `10`。未指定時は on-chain の `heartbeat()` を参照
- `PUSH_INTERVAL_MS`（任意）: 実送信間隔（例 `3000`）。`HEARTBEAT_SEC` より短く設定

### 9.3 価格の丸めと単位

- `roundToScale(priceFloat, scale)` → `BigInt(Math.round(priceFloat * Number(scale)))`
- 例: `$3025.1234`, `scale=100` → `302512`

### 9.4 推奨エラーハンドリング

- 外部価格取得: タイムアウト（1–2s）+ リトライ（指数バックオフ）
- 送信トランザクション: ノンス管理（`ethers.Wallet` に委譲）、必要に応じて `maxFeePerGas` 上乗せ再送
- 連続失敗: アラート（ログ/Slack等）、自動バックオフ

### 9.5 TypeScript サンプル（ethers v6）

```ts
import 'dotenv/config';
import { ethers } from 'ethers';
import axios from 'axios';

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS!;
const PRICE_SOURCE_URL = process.env.PRICE_SOURCE_URL ?? 'https://example.com/price';
const PUSH_INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS ?? '3000');

const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)'
];

function roundToScale(price: number, scale: bigint): bigint {
  return BigInt(Math.round(price * Number(scale)));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, wallet);

  const scale: bigint = BigInt(await oracle.priceScale());
  const hb: bigint = BigInt(await oracle.heartbeat());
  console.log('scale', scale.toString(), 'heartbeat', hb.toString());

  async function fetchPrice(): Promise<number> {
    const resp = await axios.get(PRICE_SOURCE_URL, { timeout: 1500 });
    const v = Number(resp.data.price);
    if (!Number.isFinite(v) || v <= 0) throw new Error('bad price');
    return v;
  }

  async function pushOnce() {
    try {
      const off = await fetchPrice();
      const on = roundToScale(off, scale);

      const fee = await provider.getFeeData();
      const tx = await oracle.pushPrice(on, {
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas
      });
      const rec = await tx.wait();
      console.log('pushed', on.toString(), 'tx', rec?.hash);
    } catch (e) {
      console.error('push error', e);
    }
  }

  await pushOnce();
  setInterval(pushOnce, PUSH_INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## 10. サーバー仕様（Reporter）

- 入力ソース: 1つ以上の取引所/アグリゲータAPI。異常値はロバスト統計（median/trimmed mean）で平滑化可。
- 正規化: `priceOnChain = roundToScale(price, scale)`。例: `$3025.1234` → `302512`（scale=1e2）。
- 周期: `heartbeatSec` 未満で定期送信（例: 5〜15秒）。
- エラー処理: 送信失敗時はリトライ。一定回数超で運用者に通知。ネットワーク断時は自動バックオフ。
- 健全性: 直近チェーン上 `lastUpdated` と乖離が大きい場合に警告。

---

## 11. OrderBook 側の利用上の注意

- band 判定の単位整合: `exec = priceTick * tickSize` と `oracle.indexPrice()` が同一スケールであること。
- 鮮度: ミニMVPの OrderBook は `isFresh()` を必須とはしないが、フロントエンドで鮮度を表示して利用者に判断可能とする。
- 止め方: オラクル停止時は `pause(true)`、OrderBook は `matchAtBest` を手動/自動で抑止（UI側で非活性化）。

---

## 12. TODO（実装チェックリスト）

- [ ] Adapter 実装（push/set/view/権限/イベント）
- [ ] デプロイパラメータ（`reporter`, `scale`, `heartbeat`）の決定
- [ ] サーバー（Reporter）実装（TypeScript: 価格取得→正規化→push tx）
- [ ] モニタリング（`lastUpdated`, `isFresh`, イベントログ）
- [ ] フロント統合（鮮度表示、band単位整合の検証）
- [ ] フォールバック手順（報告鍵ローテーション、pause、再開）

---

更新履歴:
- v0.1 初版（Push型 Oracle Adapter 仕様）
- v0.2 TypeScript（Reporter）想定を追記
