# PokePerp

## Oracle Local E2E（Anvil）

ローカルで Oracle をデプロイし、Reporter を起動する簡易スクリプトを用意しています。

前提: Foundry（forge/cast/anvil）と ripgrep、Node.js が利用可能。

1) 別ターミナルで RPC を起動
```
anvil -p 8545
```

2) 環境変数を指定して一発実行
```
REPORTER_PK=0x<reporter-private-key> \
OWNER_PK=0x<owner-private-key> \
RPC_URL=http://127.0.0.1:8545 \
SCALE=100 HEARTBEAT=10 \
./scripts/local_oracle_e2e.sh
```

スクリプトは Oracle をデプロイし、`reporter/.env` に `RPC_URL/ORACLE_ADDRESS/PRIVATE_KEY` を自動反映します。その後、以下で Reporter を起動できます。

```
cd reporter && npm run dev
```
