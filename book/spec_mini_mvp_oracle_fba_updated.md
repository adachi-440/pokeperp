# オンチェーン Oracle Adapter — FBA版ミニMVP（Push型）仕様（非SUAVE版）

> 目的: FBA（Frequent Batch Auction）システム向けに、TypeScript製のサーバー（Reporter）が定期的にオンチェーンのOracle Adapterに価格を送信（push）する最小仕様を定義する。FBAコントラクトからは`indexPrice()`/`markPrice()`を参照し、band ガードおよび清算価格計算に利用する。

---

## 1. スコープと設計方針

- 単一マーケット、単一リポーター（サーバー）を想定した Push 型オラクル
- 価格単位はFBAコントラクトと整合（例: USD = 1e18、または適切なスケール）
- バッチ実行タイミングとの同期を考慮した更新頻度
- ミニMVPでは `indexPrice == markPrice`（同値）。将来は別値やTWAPを検討可能
- ステート最小限: 価格、最終更新時刻、許容ハートビート（staleness）
- **非SUAVE環境**: 標準的なEVM環境で動作

---

## 2. コントラクトIF（I/F）

FBAコントラクトからの参照は以下（ミニMVPは同値を返す）:

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
    function priceScale() external view returns (uint256);    // 価格スケール
}
```

---

## 3. FBAバッチとの連携考慮事項

### 3.1 更新タイミング
- **バッチ実行前**: `executeFills()`実行前に最新価格が反映されていることが理想
- **更新頻度**: `batchInterval`の1/3〜1/2の間隔で更新（例: バッチ30秒なら10-15秒ごと）
- **清算価格への影響**: bandチェックで使用されるため、古い価格は約定を制限する可能性

### 3.2 価格の一貫性
- FBAの清算価格計算: `(bidMax.price + askMin.price) / 2`
- Oracleのindex価格はこの清算価格のband判定に使用（実装により使用有無が異なる）
- 価格が古い場合、正当な約定がband違反で拒否される可能性

### 3.3 非SUAVE環境での考慮事項
- MEV保護はバッチ処理のみに依存
- 価格更新のフロントランニングに対する追加の保護が必要な場合は、commit-reveal等の検討

---

## 4. データモデルと単位

- `price`（uint256）: 価格のベース単位は`priceScale`。FBAと同一単位を推奨
- `lastUpdate`（uint64, epoch秒）: 最終更新時刻
- `heartbeatSec`（uint64）: 許容する最大更新間隔。超過時は`isFresh=false`
- `reporter`（address）: プッシュ権限を持つEOA/署名者
- `paused`（bool）: 緊急時の停止

注意（単位整合）
- FBAコントラクトのband判定（実装される場合）は清算価格と`indexPrice()`を直接比較するため、両者の単位を一致させる

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
5) FBAコントラクトは`executeFills()`時に必要に応じて`indexPrice()`を参照

補足
- バッチ実行の直前（例: 実行の5秒前）に価格更新することで、最新価格でのband判定を保証
- 頻度はチェーンの混雑/ガス費に応じて調整。`heartbeatSec`を超えないこと

---

## 7. ガードと失敗時の動作

- `paused == true`のとき、`pushPrice`は拒否。view系のみ許可
- `isFresh()==false`の場合:
  - FBAの`executeFills`はband判定を慎重に（実装により異なる）
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
pragma solidity ^0.8.13;

interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}

contract OracleAdapterFBA is IOracleAdapter {
    address public owner;
    address public reporter;
    uint64  public heartbeat;      // sec
    uint64  public lastUpdated;    // epoch sec
    uint256 public immutable priceScale; // e.g., 1e18
    bool    public paused;

    uint256 private _price;        // index == mark (MVP)

    event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
    event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
    event Paused(bool paused);

    constructor(address _reporter, uint256 _scale, uint64 _heartbeat) {
        owner = msg.sender;
        reporter = _reporter;
        priceScale = _scale;
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

    function pause(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

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
  - `node-cron`（バッチスケジュール同期）- オプション
  - `zod`（設定/レスポンスバリデーション）
  - `winston`等ロガー（任意）

### 10.2 環境変数

- `RPC_URL`（必須）: L2 RPC エンドポイント
- `PRIVATE_KEY`（必須）: Reporter EOA の秘密鍵
- `ORACLE_ADDRESS`（必須）: `OracleAdapterFBA`のコントラクトアドレス
- `FBA_ADDRESS`（オプション）: `FBA`のコントラクトアドレス（バッチタイミング取得用）
- `PRICE_SOURCE_URL`（任意）: 外部価格APIエンドポイント
- `PRICE_SCALE`（任意）: 例 `1000000000000000000`（1e18）
- `UPDATE_INTERVAL_MS`（任意）: 定期更新間隔（ミリ秒）

### 10.3 シンプルな定期更新実装

```ts
import 'dotenv/config';
import { ethers } from 'ethers';
import axios from 'axios';

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS!;
const PRICE_SOURCE_URL = process.env.PRICE_SOURCE_URL ?? 'https://example.com/price';
const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS ?? '10000'); // 10秒デフォルト

const OracleAbi = [
  'function pushPrice(uint256 price) external',
  'function priceScale() external view returns (uint256)',
  'function heartbeat() external view returns (uint64)',
  'function lastUpdated() external view returns (uint64)',
  'function isFresh() external view returns (bool)'
];

function roundToScale(price: number, scale: bigint): bigint {
  return BigInt(Math.round(price * Number(scale)));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, OracleAbi, wallet);

  const scale: bigint = await oracle.priceScale();
  console.log('Oracle scale:', scale.toString());

  async function fetchPrice(): Promise<number> {
    try {
      const resp = await axios.get(PRICE_SOURCE_URL, { timeout: 1500 });
      const v = Number(resp.data.price);
      if (!Number.isFinite(v) || v <= 0) throw new Error('Invalid price');
      return v;
    } catch (error) {
      console.error('Failed to fetch price:', error);
      throw error;
    }
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

  // 初回価格更新
  await pushPrice();

  // 定期更新
  setInterval(async () => {
    await pushPrice();
  }, UPDATE_INTERVAL_MS);

  // フォールバック: heartbeat間隔での鮮度チェック
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

### 10.4 FBAバッチ同期版（オプション）

FBAコントラクトと連携する場合の実装例：

```ts
// FBAコントラクトのイベントを監視（実装されている場合）
const FBAAbi = [
  'event FillEvent(tuple(uint256 price, uint256 amount))',
  'event BatchExecuted(uint256 timestamp, uint256 fillCount)' // 実装により異なる
];

// バッチ実行を検知して価格更新タイミングを調整
if (process.env.FBA_ADDRESS) {
  const fba = new ethers.Contract(process.env.FBA_ADDRESS, FBAAbi, provider);

  // FillEventを監視（実装されている場合）
  fba.on('FillEvent', async (fill) => {
    console.log('Batch executed with fill:', fill);
    // 次回バッチに向けて価格を更新
    setTimeout(async () => {
      await pushPrice();
    }, 5000); // 5秒後に更新
  });
}
```

---

## 11. サーバー仕様（Reporter） - FBA特化

- **入力ソース**: 1つ以上の取引所/アグリゲータAPI。異常値はロバスト統計（median/trimmed mean）で平滑化
- **更新戦略**:
  - シンプル版: 固定間隔での定期更新
  - 高度版: FBAイベント監視による動的更新
- **正規化**: `priceOnChain = roundToScale(price, scale)`。例: `$3025.1234` → `3025123400000000000000`（scale=1e18）
- **エラー処理**: 送信失敗時はリトライ。連続失敗時は運用者に通知
- **健全性**: 直近チェーン上`lastUpdated`と乖離が大きい場合に警告

---

## 12. FBAコントラクト側の利用上の注意

- **band判定の実装**: 現在のFBA実装ではband判定は含まれていないが、将来的に追加可能
- **単位整合**: 価格の単位はFBAとOracleで一致させること
- **鮮度チェック**: 必要に応じて`isFresh()`を確認
- **止め方**: オラクル停止時は`pause(true)`、FBAは価格なしでも動作可能（設計による）

---

## 13. 非SUAVE環境での追加考慮事項

### 13.1 MEV対策
- 価格更新のフロントランニング対策として、以下を検討：
  - Commit-Revealパターン
  - 時間ベースの更新制限
  - マルチシグまたは閾値署名

### 13.2 分散化
- 将来的に複数のReporterによる価格集約を検討
- Chainlink等の既存オラクルとの統合も可能

---

## 14. TODO（実装チェックリスト）

- [ ] Adapter実装（push/set/view/権限/イベント）
- [ ] デプロイパラメータ（`reporter`, `scale`, `heartbeat`）の決定
- [ ] サーバー（Reporter）実装:
  - [ ] 価格取得→正規化→push tx基本機能
  - [ ] エラーハンドリングとリトライロジック
  - [ ] ロギングとモニタリング
- [ ] テスト:
  - [ ] 単体テスト（価格更新、権限チェック）
  - [ ] 統合テスト（FBAとの連携）
- [ ] 運用:
  - [ ] デプロイスクリプト
  - [ ] モニタリングダッシュボード
  - [ ] アラート設定

---

更新履歴:
- v0.2 非SUAVE版（標準EVM環境対応）
- v0.1 FBA版初版（SUAVE想定）