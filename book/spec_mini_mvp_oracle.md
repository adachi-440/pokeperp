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
    function setHeartbeat(uint64 heartbeat) external;         // onlyOwner
    function pause(bool p) external;                          // onlyOwner
}

interface IOraclePush {
    function pushPrice(uint256 price) external;               // onlyReporter
}

interface IOracleViewExt {
    function lastUpdated() external view returns (uint64);
    function heartbeat() external view returns (uint64);
    function isFresh() external view returns (bool);          // now - lastUpdated <= heartbeat
    function priceScale() external view returns (uint64);     // 例: 1e2（tickSize と一致）
    // 監視便宜用の最小セット
    function reporter() external view returns (address);
    function paused() external view returns (bool);
    function state() external view returns (
        uint256 price,
        uint64 lastUpdated,
        uint64 heartbeat,
        uint64 scale,
        bool paused,
        address reporter
    );
}
```

---

## 3. データモデルと単位

- `price`（uint256）: 価格のベース単位は `priceScale`。ミニMVPでは `priceScale == tickSize` を推奨。
- `lastUpdated`（uint64, epoch秒）: 最終更新時刻。
- `heartbeat`（uint64）: 許容する最大更新間隔。超過時は `isFresh=false`。
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
3) 一定間隔（`heartbeat` 以内、例: 5〜15秒）で `pushPrice(priceOnChain)` を送信。
4) コントラクトは `indexPrice=markPrice=priceOnChain`、`lastUpdated=block.timestamp` を更新し `PricePushed` 発火。
5) OrderBook は `indexPrice()` を参照して band 判定を実施。

補足
- ミニMVPでは署名検証は行わず、`onlyReporter` の `msg.sender` による認可のみ。
- 頻度はチェーンの混雑/ガス費に応じて調整。`heartbeat` を超えないこと。

---

## 6. ガードと失敗時の動作

- `paused == true` のとき、`pushPrice` は拒否。view系のみ許可。
- `isFresh()==false` の場合、フロント側で `matchAtBest` ボタンを非活性にする等のUXガードを推奨。
- 価格異常（NaN/負値）は呼び出し前にサーバー側で除去。Adapterでは `require(price > 0)`。

オプション（運用強化・軽量追加）
- Guardian Pause: `guardian` を1名だけ許可（`pause(true)` のみ実行可能）。誤操作リスクを限定しつつ緊急停止を迅速化。
- 価格ジャンプ簡易ガード: 任意で `maxDeltaBps` を導入し、前回値からの過大変動を拒否/要pause。

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

    // Custom Errors（軽量・可読性向上）
    error NotOwner();
    error NotReporter();
    error PausedErr();
    error BadPrice();
    error BadConfig();

    constructor(address _reporter, uint64 _scale, uint64 _heartbeat) {
        if (_reporter == address(0)) revert BadConfig();
        if (_scale == 0) revert BadConfig();
        if (_heartbeat == 0) revert BadConfig();
        owner = msg.sender;
        reporter = _reporter;
        scale = _scale;
        heartbeat = _heartbeat;
    }

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyReporter() { if (msg.sender != reporter) revert NotReporter(); _; }

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
        if (paused) revert PausedErr();
        if (price == 0) revert BadPrice();
        _price = price;
        lastUpdated = uint64(block.timestamp);
        emit PricePushed(price, lastUpdated, msg.sender);
    }

    // IOracleAdapter
    function indexPrice() external view returns (uint256) { return _price; }
    function markPrice()  external view returns (uint256) { return _price; }

    // helpers
    function isFresh() external view returns (bool) {
        return uint256(block.timestamp) - uint256(lastUpdated) <= uint256(heartbeat);
    }
    function priceScale() external view returns (uint64) { return scale; }

    // 一括取得（監視/UI向け）
    function state() external view returns (
        uint256 price,
        uint64 _lastUpdated,
        uint64 _heartbeat,
        uint64 _scale,
        bool _paused,
        address _reporter
    ) {
        return (_price, lastUpdated, heartbeat, scale, paused, reporter);
    }
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

- Number 依存は禁止（IEEE754 により `scale=1e18` 等で精度崩壊）。
- 推奨: decimal ライブラリ（例: `big.js`）で「floor」丸め（安定）。
- 代替: `ethers.parseUnits(priceString, decimals)`（`scale=10**decimals` の場合に有効）。

例（`big.js`、floor 固定）:

```ts
import Big from 'big.js';

function roundToScale(priceStr: string, scale: bigint): bigint {
  const x = new Big(priceStr);
  const s = new Big(scale.toString());
  return BigInt(x.times(s).round(0, Big.roundDown).toFixed(0));
}
```

### 9.4 推奨エラーハンドリング

- 外部価格取得: タイムアウト（1–2s）+ リトライ（指数バックオフ）
- 送信トランザクション: ノンス管理（`ethers.Wallet` に委譲）、必要に応じて `maxFeePerGas` 上乗せ再送
- 連続失敗: アラート（ログ/Slack等）、自動バックオフ

### 9.5 TypeScript サンプル（ethers v6）

```ts
import 'dotenv/config';
import { ethers } from 'ethers';
import axios from 'axios';
import Big from 'big.js';

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS!;
const PRICE_SOURCE_URL = process.env.PRICE_SOURCE_URL ?? 'https://example.com/price';
const PUSH_INTERVAL_MS = Number(process.env.PUSH_INTERVAL_MS ?? '3000');

const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint64)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function paused() external view returns (bool)',
  'function reporter() external view returns (address)'
];

function roundToScale(priceStr: string, scale: bigint): bigint {
  const x = new Big(priceStr);
  const s = new Big(scale.toString());
  return BigInt(x.times(s).round(0, Big.roundDown).toFixed(0)); // floor
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, wallet);

  const scale: bigint = BigInt(await oracle.priceScale());
  const hb: bigint = BigInt(await oracle.heartbeat());
  console.log('scale', scale.toString(), 'heartbeat', hb.toString(), 'reporter', await oracle.reporter());

  async function fetchPrice(): Promise<string> {
    const resp = await axios.get(PRICE_SOURCE_URL, { timeout: 1500 });
    const raw = resp.data.price;
    const s = typeof raw === 'string' ? raw : String(raw);
    const x = new Big(s);
    if (!x.gt(0)) throw new Error('bad price');
    return x.toString();
  }

  async function pushOnce() {
    try {
      if (await oracle.paused()) {
        console.warn('oracle paused');
        return;
      }
      const off = await fetchPrice();
      const on = roundToScale(off, scale);

      const fee = await provider.getFeeData();
      const overrides = (fee.maxFeePerGas && fee.maxPriorityFeePerGas)
        ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas }
        : {};

      const tx = await oracle.pushPrice(on, overrides);
      const rec = await tx.wait();
      console.log('pushed', on.toString(), 'tx', rec?.hash);
    } catch (e) {
      console.error('push error', e);
    }
  }

  // 重複送信を避ける逐次ループ
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let running = true;
  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  while (running) {
    const started = Date.now();
    await pushOnce();
    const elapsed = Date.now() - started;
    const wait = Math.max(0, PUSH_INTERVAL_MS - elapsed);
    await sleep(wait);
  }
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
- 周期: `heartbeat` 未満で定期送信（例: 5〜15秒）。
- エラー処理: 送信失敗時はリトライ。一定回数超で運用者に通知。ネットワーク断時は自動バックオフ。
- 健全性: 直近チェーン上 `lastUpdated` と乖離が大きい場合に警告。

テスト観点（推奨）
- 境界: `block.timestamp == lastUpdated + heartbeat` のとき `isFresh()==true`。
- イベント: `PricePushed` の `reporter indexed` フィルタで取得可能か。
- Fuzz: `pushPrice` を複数回、時間進行に伴い `isFresh` が想定通りトグル。
- 権限: `setReporter` 後は旧 reporter の `pushPrice` が revert。
- コンストラクタ: `_reporter=0`/`_scale=0`/`_heartbeat=0` で revert。
- TS 丸め精度: `scale=1e18` でも誤差なく floor 丸めされること。
- 送信競合: ネットワーク遅延時でも重複送信が起きないこと（逐次ループ）。

---

## 11. OrderBook 側の利用上の注意

- band 判定の単位整合: `exec = priceTick * tickSize` と `oracle.indexPrice()` が同一スケールであること。
- 鮮度: ミニMVPの OrderBook は `isFresh()` を必須とはしないが、フロントエンドで鮮度を表示して利用者に判断可能とする。
- 止め方: オラクル停止時は `pause(true)`、OrderBook は `matchAtBest` を手動/自動で抑止（UI側で非活性化）。

---

## 12. TODO（実装チェックリスト）

- [ ] Adapter 実装（push/set/view/権限/イベント、Custom Errors）
- [ ] デプロイパラメータ（`reporter`, `scale`, `heartbeat`）の決定（0値禁止）
- [ ] 監視用 getter（`reporter()`/`paused()`/`state()`）
- [ ] サーバー（Reporter）実装（TypeScript: 価格取得→正規化→push tx）
- [ ] 丸め: Number禁止、decimal系で floor 丸め or `parseUnits`
- [ ] 送信: 逐次ループ化（`setInterval` 非推奨）、`getFeeData` フォールバック
- [ ] モニタリング（`lastUpdated`, `isFresh`, 一括 `state()`、イベントログ）
- [ ] フロント統合（鮮度表示、band単位整合の検証）
- [ ] 運用手順（鍵ローテ/guardian/pause/再開）

---

更新履歴:
- v0.1 初版（Push型 Oracle Adapter 仕様）
- v0.2 TypeScript（Reporter）想定を追記
- v0.3 命名統一・丸め/逐次送信・監視getter・Custom Errors 追記
