#!/usr/bin/env bash
# Run the integration tests against a local validator WITHOUT `anchor test`.
#
# Anchor 0.30.1's CLI hard-pins Solana 1.18.17, whose toolchain can't compile
# today's crates (edition2024); meanwhile its IDL macro can't build on modern
# Rust. So we drive the pieces directly with the modern (4.0 / platform-tools
# v1.53) toolchain that DOES work:
#   1. build the .so          (cargo-build-sbf, done separately / here)
#   2. generate the IDL       (scripts/gen-idl.js)
#   3. boot a local validator with the program preloaded
#   4. run ts-mocha against it
#
# Usage: bash scripts/test-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STABLE="$HOME/.local/share/solana/install/releases/stable-549805f3e85f345c9df98d59759691443eef57aa/solana-release/bin"
export PATH="$STABLE:$HOME/.cargo/bin:$PATH"

SO="$ROOT/target/deploy/prediction_market.so"
PROG_KEYPAIR="$ROOT/target/deploy/prediction_market-keypair.json"
WALLET="$ROOT/.test-wallet.json"
LEDGER="/tmp/wc-test-ledger"
RPC="http://127.0.0.1:8899"

[ -f "$SO" ] || { echo "missing $SO — run: cargo-build-sbf"; exit 1; }
[ -f "target/idl/prediction_market.json" ] || node scripts/gen-idl.js
[ -f "$WALLET" ] || solana-keygen new --no-bip39-passphrase -s -o "$WALLET" >/dev/null

echo "==> starting validator (program preloaded at $(solana-keygen pubkey "$PROG_KEYPAIR"))"
rm -rf "$LEDGER"
# Gossip/dynamic ports moved off the default 8000 (taken here by a local dev server).
solana-test-validator --reset --quiet \
  --ledger "$LEDGER" \
  --rpc-port 8899 \
  --gossip-port 8100 \
  --dynamic-port-range 8200-8260 \
  --bpf-program "$PROG_KEYPAIR" "$SO" &
VALIDATOR_PID=$!
trap 'kill $VALIDATOR_PID 2>/dev/null || true' EXIT

echo "==> waiting for RPC..."
for i in $(seq 1 60); do
  if curl -s "$RPC" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"result":"ok"'; then
    echo "    up after ${i}s"; break
  fi
  sleep 1
  [ "$i" = "60" ] && { echo "validator did not start"; exit 1; }
done

echo "==> funding test wallet"
solana airdrop 100 "$(solana-keygen pubkey "$WALLET")" --url "$RPC" >/dev/null

echo "==> running ts-mocha"
export ANCHOR_PROVIDER_URL="$RPC"
export ANCHOR_WALLET="$WALLET"
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
