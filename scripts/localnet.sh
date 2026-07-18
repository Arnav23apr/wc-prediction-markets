#!/usr/bin/env bash
# Start a PERSISTENT local validator with the program preloaded, for running the
# relayer + app against. Leave this running in its own terminal (Ctrl-C to stop).
#
# RPC: http://127.0.0.1:8899   (gossip moved to 8100 to avoid the local :8000 dev server)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STABLE="$HOME/.local/share/solana/install/releases/stable-549805f3e85f345c9df98d59759691443eef57aa/solana-release/bin"
export PATH="$STABLE:$PATH"

SO="$ROOT/target/deploy/prediction_market.so"
PROG_KEYPAIR="$ROOT/target/deploy/prediction_market-keypair.json"
[ -f "$SO" ] || { echo "missing $SO — run: bash scripts/build.sh"; exit 1; }

echo "validator RPC at http://127.0.0.1:8899 (program $(solana-keygen pubkey "$PROG_KEYPAIR"))"
exec solana-test-validator --reset \
  --ledger /tmp/wc-localnet-ledger \
  --rpc-port 8899 --gossip-port 8100 --dynamic-port-range 8200-8260 \
  --bpf-program "$PROG_KEYPAIR" "$SO"
