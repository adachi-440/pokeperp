#!/usr/bin/env bash
set -euo pipefail

# 簡易ローカル E2E: Anvil 起動確認 → Oracle デプロイ → reporter/.env 設定 → 動作確認

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
RPC_URL_DEFAULT="http://127.0.0.1:8545"
HEARTBEAT=10

RPC_URL="${RPC_URL:-$RPC_URL_DEFAULT}"
REPORTER_PK="${REPORTER_PK:-}"
OWNER_PK="${OWNER_PK:-${REPORTER_PK:-}}"
SCALE="${SCALE:-100}"
HEARTBEAT="${HEARTBEAT:-10}"

if [[ -z "$REPORTER_PK" ]]; then
  echo "[ERR] REPORTER_PK が未設定です。Reporter 用の秘密鍵を環境変数で渡してください。"
  echo "例) REPORTER_PK=0x... OWNER_PK=0x... ./scripts/local_oracle_e2e.sh"
  exit 1
fi
if [[ -z "$OWNER_PK" ]]; then
  echo "[INFO] OWNER_PK が未設定のため REPORTER_PK を使用します。"
  OWNER_PK="$REPORTER_PK"
fi

echo "[1/6] RPC ヘルスチェック: $RPC_URL"
if ! curl -sSf -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}' \
  "$RPC_URL" >/dev/null; then
  echo "[WARN] RPC に接続できません。別ターミナルで anvil を起動してください: anvil -p 8545"
  echo "[INFO] RPC_URL=$RPC_URL (例: http://127.0.0.1:8545)"
  exit 1
fi

echo "[2/6] アドレス計算（cast）"
if ! command -v cast >/dev/null 2>&1; then
  echo "[ERR] cast コマンドが見つかりません。Foundry のインストールを確認してください。"
  exit 1
fi
REPORTER_ADDR=$(cast wallet address --private-key "$REPORTER_PK")
if [[ -z "$REPORTER_ADDR" ]]; then
  echo "[ERR] REPORTER_PK からアドレスを導出できませんでした。"
  exit 1
fi
echo "REPORTER=$REPORTER_ADDR"

echo "[2.5/6] Foundry ライブラリ準備 (forge-std)"
if [[ ! -f "$ROOT_DIR/contract/lib/forge-std/src/Script.sol" ]]; then
  echo "  forge-std が見つかりません。インストールします…"
  pushd "$ROOT_DIR/contract" >/dev/null
  # 既存の壊れたディレクトリがあれば削除
  if [[ -d lib/forge-std && ! -f lib/forge-std/src/Script.sol ]]; then
    rm -rf lib/forge-std
  fi
  if ! forge install foundry-rs/forge-std@v1.9.5; then
    echo "[ERR] forge-std のインストールに失敗しました。ネットワークや git の状態を確認してください。"
    exit 1
  fi
  popd >/dev/null
fi

echo "[3/6] デプロイ (forge script)"
if ! command -v forge >/dev/null 2>&1; then
  echo "[ERR] forge コマンドが見つかりません。Foundry のインストールを確認してください。"
  exit 1
fi
pushd "$ROOT_DIR/contract" >/dev/null
REPORTER="$REPORTER_ADDR" SCALE="$SCALE" HEARTBEAT="$HEARTBEAT" \
forge script script/DeployOracle.s.sol \
  --rpc-url "$RPC_URL" \
  --private-key "$OWNER_PK" \
  --broadcast 2>&1 | tee /tmp/deploy_oracle.log

echo "[4/6] デプロイアドレス抽出"
if ! command -v rg >/dev/null 2>&1; then
  echo "[ERR] ripgrep (rg) が見つかりません。インストールしてください。"
  exit 1
fi
ORACLE_ADDR=$(rg -n "OracleAdapterSimple deployed:" -N /tmp/deploy_oracle.log | sed -E 's/.*deployed:\s*([0-9xa-fA-F]+).*/\1/')
if [[ -z "$ORACLE_ADDR" ]]; then
  echo "[ERR] デプロイログからアドレスを取得できませんでした。ログ: /tmp/deploy_oracle.log"
  exit 1
fi
popd >/dev/null
echo "ORACLE=$ORACLE_ADDR"

echo "[5/6] reporter/.env を更新"
ENV_FILE="$ROOT_DIR/reporter/.env"
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%s)"
fi
touch "$ENV_FILE"
set_kv() {
  local key="$1"; shift
  local val="$1"; shift
  if grep -qE "^${key}=" "$ENV_FILE"; then
    # macOS の sed -i 互換で空文字を渡す
    sed -i '' -e "s#^${key}=.*#${key}=${val}#" "$ENV_FILE" || true
    # Linux sed
    sed -i -e "s#^${key}=.*#${key}=${val}#" "$ENV_FILE" 2>/dev/null || true
  else
    echo "${key}=${val}" >>"$ENV_FILE"
  fi
}
set_kv RPC_URL "$RPC_URL"
set_kv ORACLE_ADDRESS "$ORACLE_ADDR"
set_kv PRIVATE_KEY "$REPORTER_PK"

echo "[6/6] 動作確認 (npm run check)"
pushd "$ROOT_DIR/reporter" >/dev/null
if ! command -v npm >/dev/null 2>&1; then
  echo "[ERR] npm が見つかりません。Node.js 環境を確認してください。"
  exit 1
fi
npm run -s check || {
  echo "[WARN] check に失敗しました。.env と RPC の状態を確認してください。"; exit 1; }
popd >/dev/null

echo "--- 完了 ---"
echo "ORACLE_ADDRESS=$ORACLE_ADDR を reporter/.env に設定しました。"
echo "Reporter を起動するには: (別ターミナルで)"
echo "  cd reporter && npm run dev"
