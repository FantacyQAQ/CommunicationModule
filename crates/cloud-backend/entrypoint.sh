#!/usr/bin/env bash
set -euo pipefail

HOMESERVER="${HOMESERVER_URL:-http://homeserver:8008}"
BOT_USERNAME="${BOT_USERNAME:-chatbot}"
DB_PATH="${DB_PATH:-/data/bot.db}"
GRPC_PORT="${GRPC_PORT:-50051}"
PASSWORD_FILE="/data/.bot_password"

# Read persisted password, or generate and persist a new one
if [ -z "${BOT_PASSWORD:-}" ]; then
    if [ -f "$PASSWORD_FILE" ]; then
        BOT_PASSWORD=$(cat "$PASSWORD_FILE")
        echo "[entrypoint] Loaded bot password from $PASSWORD_FILE"
    else
        BOT_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 24)
        echo "$BOT_PASSWORD" > "$PASSWORD_FILE"
        echo "[entrypoint] Generated and saved bot password to $PASSWORD_FILE"
    fi
fi
export BOT_PASSWORD

# Wait for homeserver to be ready
echo "[entrypoint] Waiting for homeserver at $HOMESERVER..."
for i in $(seq 1 30); do
    if curl -sf "$HOMESERVER/_matrix/client/versions" > /dev/null 2>&1; then
        echo "[entrypoint] Homeserver is ready"
        break
    fi
    echo "[entrypoint]   attempt $i/30..."
    sleep 2
done

# Register bot user (idempotent — fails silently if already exists)
echo "[entrypoint] Registering bot user '$BOT_USERNAME'..."
curl -sf -X POST "$HOMESERVER/_matrix/client/v3/register" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$BOT_USERNAME\",\"password\":\"$BOT_PASSWORD\",\"auth\":{\"type\":\"m.login.dummy\"}}" \
    > /dev/null 2>&1 && echo "[entrypoint] Bot user registered" \
    || echo "[entrypoint] Bot user may already exist, continuing..."

echo "[entrypoint] Starting bot daemon on 0.0.0.0:$GRPC_PORT..."
exec cloud-backend \
    --mode grpc \
    --port "0.0.0.0:$GRPC_PORT" \
    --homeserver-url "$HOMESERVER" \
    --bot-username "$BOT_USERNAME" \
    --db-path "$DB_PATH"
