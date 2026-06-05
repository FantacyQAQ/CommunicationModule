#!/usr/bin/env bash
# Bot daemon integration test (CLI mode)
# Run from workspace root: ./crates/cloud-backend/test-bot.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$WORKSPACE"

echo "=== Bot CLI Integration Test ==="

# Build
echo "Building..."
cargo build -p cloud-backend

# Prepare test commands with unique IDs
TS=$(date +%s)
cat > /tmp/bot_test_input.json << EOF
{"id":"1","method":"ping","params":{}}
{"id":"2","method":"register_user","params":{"platform_user_id":"${TS}_a"}}
{"id":"3","method":"register_user","params":{"platform_user_id":"${TS}_b"}}
{"id":"4","method":"create_room","params":{"buyer_pid":"${TS}_a","seller_pid":"${TS}_b","title":"Test ${TS}"}}
{"id":"5","method":"get_room","params":{"buyer_pid":"${TS}_a","seller_pid":"${TS}_b"}}
{"id":"6","method":"shutdown","params":{}}
EOF

echo "Running daemon..."
BOT_PASSWORD="${BOT_PASSWORD:-botpass123}" timeout 15 ./target/debug/cloud-backend \
    < /tmp/bot_test_input.json \
    2>/tmp/bot_stderr.log

echo "Done."
