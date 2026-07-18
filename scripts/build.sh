#!/usr/bin/env bash
# Build the program (.so) + generate the IDL with the toolchain that actually
# works against the 2026 crate ecosystem.
#
# Background: Anchor 0.30.1's CLI hard-pins Solana 1.18.17, whose bundled cargo
# (1.75) can't resolve today's crates (they require edition2024), and its IDL
# macro (`anchor-syn`) won't compile on modern Rust. So instead of `anchor build`
# we drive the matched Agave 4.0 / platform-tools v1.53 SBF compiler directly,
# and generate the IDL deterministically. See scripts/gen-idl.js.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STABLE="$HOME/.local/share/solana/install/releases/stable-549805f3e85f345c9df98d59759691443eef57aa/solana-release/bin"
if [ ! -x "$STABLE/cargo-build-sbf" ]; then
  echo "Expected Agave 4.x at $STABLE"
  echo "Install with: sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
  exit 1
fi
export PATH="$STABLE:$HOME/.cargo/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true

echo "==> cargo-build-sbf ($(cargo-build-sbf --version | head -1))"
cargo-build-sbf

echo "==> generating IDL"
node scripts/gen-idl.js

PROG_ID="$("$STABLE/solana-keygen" pubkey target/deploy/prediction_market-keypair.json)"
echo "==> done. program id: $PROG_ID"
echo "    (ensure this matches declare_id! in lib.rs and Anchor.toml)"
