#!/usr/bin/env bash
set -euo pipefail

# Build the WASM client for web target (ES module output)
#
# Usage:
#   ./build.sh              # Debug build
#   ./build.sh --release    # Release build (optimized, smaller)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RELEASE_FLAG=""
if [[ "${1:-}" == "--release" ]]; then
    RELEASE_FLAG="--release"
    echo "Building WASM client (release)..."
else
    echo "Building WASM client (debug)..."
fi

# Required for getrandom 0.3 to work with wasm32-unknown-unknown
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' wasm-pack build \
    --target web \
    $RELEASE_FLAG \
    --out-dir pkg \
    --out-name wasm_client \
    .

echo ""
echo "Build complete! Output in: pkg/"
echo "  pkg/wasm_client.js       - JS glue code"
echo "  pkg/wasm_client_bg.wasm  - WASM binary"
echo "  pkg/wasm_client.d.ts     - TypeScript types"
