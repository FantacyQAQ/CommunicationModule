#!/usr/bin/env bash
# Bot gRPC integration test
# Run from workspace root: ./crates/cloud-backend/test-grpc.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROTO_DIR="$SCRIPT_DIR/proto"
PORT="${TEST_GRPC_PORT:-50051}"
ADDR="127.0.0.1:$PORT"
BOT_PID=""

cleanup() {
    if [ -n "$BOT_PID" ]; then
        kill "$BOT_PID" 2>/dev/null || true
        wait "$BOT_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

grpc_call() {
    local method="$1" body="${2:-}"
    if [ -n "$body" ]; then
        grpcurl -plaintext -import-path "$PROTO_DIR" -proto bot.proto -d "$body" "$ADDR" "bot.BotService/$method"
    else
        grpcurl -plaintext -import-path "$PROTO_DIR" -proto bot.proto "$ADDR" "bot.BotService/$method"
    fi
}

echo "=== Bot gRPC Integration Test ==="

# Build
echo "[1/5] Building..."
cd "$WORKSPACE"
cargo build -p cloud-backend 2>/dev/null

# Start bot in gRPC mode
echo "[2/5] Starting gRPC server on $ADDR..."
BOT_PASSWORD="${BOT_PASSWORD:-botpass123}" ./target/debug/cloud-backend \
    --mode grpc --port "$ADDR" &
BOT_PID=$!
sleep 3

# Verify server is up
if ! kill -0 "$BOT_PID" 2>/dev/null; then
    echo "ERROR: Bot failed to start"
    exit 1
fi

# Test commands
TS=$(date +%s)
PASS=0
FAIL=0

echo "[3/5] Running tests..."

# Ping
if grpc_call Ping '{}' | grep -q '"pong": true'; then
    echo "  ✓ Ping"
    PASS=$((PASS + 1))
else
    echo "  ✗ Ping"
    FAIL=$((FAIL + 1))
fi

# RegisterUser
RESULT=$(grpc_call RegisterUser "{\"platform_user_id\":\"${TS}_a\"}")
if echo "$RESULT" | grep -q '"matrixUserId"'; then
    USER_A_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['matrixUserId'])" 2>/dev/null || echo "")
    echo "  ✓ RegisterUser → $USER_A_ID"
    PASS=$((PASS + 1))
else
    echo "  ✗ RegisterUser: $RESULT"
    FAIL=$((FAIL + 1))
fi

# RegisterUser (second user)
RESULT=$(grpc_call RegisterUser "{\"platform_user_id\":\"${TS}_b\"}")
if echo "$RESULT" | grep -q '"matrixUserId"'; then
    USER_B_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['matrixUserId'])" 2>/dev/null || echo "")
    echo "  ✓ RegisterUser → $USER_B_ID"
    PASS=$((PASS + 1))
else
    echo "  ✗ RegisterUser: $RESULT"
    FAIL=$((FAIL + 1))
fi

# CreateRoom
RESULT=$(grpc_call CreateRoom "{\"buyer_pid\":\"${TS}_a\",\"seller_pid\":\"${TS}_b\",\"title\":\"gRPC test ${TS}\"}")
if echo "$RESULT" | grep -q '"matrixRoomId"'; then
    ROOM_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['matrixRoomId'])" 2>/dev/null || echo "")
    echo "  ✓ CreateRoom → $ROOM_ID"
    PASS=$((PASS + 1))
else
    echo "  ✗ CreateRoom: $RESULT"
    FAIL=$((FAIL + 1))
fi

# GetRoom
RESULT=$(grpc_call GetRoom "{\"buyer_pid\":\"${TS}_a\",\"seller_pid\":\"${TS}_b\"}")
if echo "$RESULT" | grep -q 'matrixRoomId'; then
    echo "  ✓ GetRoom"
    PASS=$((PASS + 1))
else
    echo "  ✗ GetRoom: $RESULT"
    FAIL=$((FAIL + 1))
fi

# GetUserCredentials
RESULT=$(grpc_call GetUserCredentials "{\"platform_user_id\":\"${TS}_a\"}")
if echo "$RESULT" | grep -q '"matrixUserId"'; then
    echo "  ✓ GetUserCredentials"
    PASS=$((PASS + 1))
else
    echo "  ✗ GetUserCredentials: $RESULT"
    FAIL=$((FAIL + 1))
fi

# ListUsers
RESULT=$(grpc_call ListUsers '{}')
if echo "$RESULT" | grep -q '"users"'; then
    echo "  ✓ ListUsers"
    PASS=$((PASS + 1))
else
    echo "  ✗ ListUsers: $RESULT"
    FAIL=$((FAIL + 1))
fi

# ListRooms
RESULT=$(grpc_call ListRooms '{}')
if echo "$RESULT" | grep -q '"rooms"'; then
    echo "  ✓ ListRooms"
    PASS=$((PASS + 1))
else
    echo "  ✗ ListRooms: $RESULT"
    FAIL=$((FAIL + 1))
fi

echo "[4/5] Stopping server..."
kill "$BOT_PID" 2>/dev/null || true
wait "$BOT_PID" 2>/dev/null || true
BOT_PID=""

echo "[5/5] Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
