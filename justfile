# Matrix Service - Task Runner
# https://github.com/casey/just

# ---- Config ----
set dotenv-load := true

export RUSTFLAGS := "--cfg getrandom_backend=\"wasm_js\""

# ---- Default ----
default:
    @just --list

# ============================================================
# Build
# ============================================================

# Check both crates compile (native)
check:
    cargo check -p cloud-backend
    cargo check -p wasm-client

# Check WASM client compiles for wasm32 target
check-wasm:
    cargo check -p wasm-client --target wasm32-unknown-unknown

# Build WASM client (debug)
build-wasm:
    @echo "Building WASM client (debug)..."
    cd crates/wasm-client && wasm-pack build --target web --out-dir pkg --out-name wasm_client .
    @echo ""
    @echo "Build complete! Output in crates/wasm-client/pkg/"
    @echo "  pkg/wasm_client.js        - JS glue code"
    @echo "  pkg/wasm_client_bg.wasm   - WASM binary"
    @echo "  pkg/wasm_client.d.ts      - TypeScript types"

# Build WASM client (release, optimized, smaller)
build-wasm-release:
    @echo "Building WASM client (release)..."
    cd crates/wasm-client && wasm-pack build --target web --release --out-dir pkg --out-name wasm_client .
    @echo ""
    @echo "Build complete! Output in crates/wasm-client/pkg/"

# Build everything
build: check build-wasm

# ============================================================
# Test
# ============================================================

# Run all Playwright tests
test:
    cd crates/wasm-client/tests && npx playwright test

# Run tests with debugger
test-debug:
    cd crates/wasm-client/tests && npx playwright test --debug

# Run only Phase 0 tests (WASM load smoke test)
test-p0:
    cd crates/wasm-client/tests && npx playwright test specs/01-load.spec.ts

# Run only Phase 1 tests (Matrix SDK integration)
test-p1:
    cd crates/wasm-client/tests && npx playwright test specs/02-phase1-real.spec.ts

# Run only Phase 2 tests (SharedWorker message router)
test-p2:
    cd crates/wasm-client/tests && npx playwright test specs/03-phase2-worker.spec.ts

# Run only Phase 3 tests (Bridge CLI)
test-p3:
    cd crates/wasm-client/tests && npx playwright test specs/04-phase3-bridge.spec.ts

# Show Playwright test report
test-report:
    cd crates/wasm-client/tests && npx playwright show-report

# ============================================================
# Infrastructure
# ============================================================

# Start Matrix homeserver (podman)
homeserver-up:
    podman compose up -d

# Stop Matrix homeserver
homeserver-down:
    podman compose down

# View homeserver logs
homeserver-logs:
    podman logs matrix-homeserver

# Restart homeserver
homeserver-restart: homeserver-down homeserver-up

# ============================================================
# Development
# ============================================================

# Install Playwright dependencies (first time setup)
setup:
    cd crates/wasm-client/tests && npm install
    npx playwright install chromium

# Clean all build artifacts
clean:
    cargo clean
    rm -rf crates/wasm-client/pkg
    rm -rf crates/wasm-client/tests/test-results
    rm -f crates/wasm-client/tests/.test-creds.json

# Full CI pipeline
ci: build test

# Start dev server for manual browser testing
dev-server:
    @echo "Serving at http://localhost:3333"
    python3 -m http.server 3333

# ============================================================
# Helpers
# ============================================================

# Check if all prerequisites are installed
doctor:
    @echo "=== Environment Check ==="
    @echo -n "Rust:      " && rustc --version
    @echo -n "Node:      " && node --version
    @echo -n "npm:       " && npm --version
    @echo -n "wasm-pack: " && wasm-pack --version 2>/dev/null || echo "MISSING"
    @echo -n "podman:    " && podman --version 2>/dev/null || echo "MISSING"
    @echo -n "WASM:      " && rustup target list --installed | grep wasm32 || echo "MISSING"
    @echo -n "playwright:" && cd crates/wasm-client/tests && npx playwright --version 2>/dev/null || echo "run 'just setup'"
