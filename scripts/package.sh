#!/usr/bin/env bash
# Build and package frontend + backend zips for distribution
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE"

rm -rf dist
mkdir -p dist/frontend dist/backend

echo "========================================="
echo "  Matrix Service — Packaging"
echo "========================================="

# ========================================
# Frontend
# ========================================
echo ""
echo "[1/3] Building WASM client (release)..."
cd "$WORKSPACE/crates/wasm-client"
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
    wasm-pack build --target web --release --out-dir pkg --out-name wasm_client .
cd "$WORKSPACE"

echo "[2/3] Packaging frontend..."
cp crates/wasm-client/bridge/matrix-bridge.js    dist/frontend/
cp crates/wasm-client/workspace/matrix-worker.js dist/frontend/
cp crates/wasm-client/pkg/wasm_client.js          dist/frontend/
cp crates/wasm-client/pkg/wasm_client_bg.wasm     dist/frontend/

# Include docs if they exist at project root
for f in API.md QUICKSTART.md; do
    [ -f "$f" ] && cp "$f" dist/frontend/
done

WASM_SIZE=$(ls -lh dist/frontend/wasm_client_bg.wasm | awk '{print $5}')
echo "  WASM size: $WASM_SIZE"

cd dist && zip -qr frontend.zip frontend/ && cd "$WORKSPACE"
echo "  → dist/frontend.zip"

# ========================================
# Backend
# ========================================
echo "[3/3] Building bot (release) + packaging backend..."
cargo build --release -p cloud-backend

cp target/release/cloud-backend                   dist/backend/
cp crates/cloud-backend/Dockerfile.bot            dist/backend/
cp crates/cloud-backend/entrypoint.sh             dist/backend/
cp conduit-config.toml                            dist/backend/
cp docker-compose.prod.yml                        dist/backend/docker-compose.yml

cd dist && zip -qr backend.zip backend/ && cd "$WORKSPACE"
echo "  → dist/backend.zip"

# ========================================
# Summary
# ========================================
echo ""
echo "========================================="
echo "  Done!"
echo "========================================="
echo "  dist/frontend.zip   — $(du -h dist/frontend.zip | cut -f1)"
echo "  dist/backend.zip    — $(du -h dist/backend.zip | cut -f1)"
echo ""
echo "  Frontend files:"
ls -lh dist/frontend/
echo ""
echo "  Backend files:"
ls -lh dist/backend/
