// SharedWorker: Matrix WASM Client Message Router
//
// Loads the WASM Matrix client and exposes it to multiple browser tabs/pages
// via postMessage. All Matrix operations (login, sync, rooms, messages) are
// handled here. Frontend pages only send/receive structured messages.
//
// Architecture:
//   Vue 3 Page → postMessage → SharedWorker → WASM Client → Matrix Homeserver

import init, { WasmMatrixClient, greet } from '../pkg/wasm_client.js';

// ---- State ----

let wasmInitialized = false;
let wasmClient = null;
let connectedPorts = [];   // All connected page ports
let eventBuffer = [];       // Events received before any page connects

// ---- Worker Initialization ----

async function ensureWasmLoaded() {
    if (!wasmInitialized) {
        const start = performance.now();
        await init();
        wasmInitialized = true;
        console.log(`[matrix-worker] WASM loaded in ${(performance.now() - start).toFixed(0)}ms`);
    }
}

// ---- Connection Management ----

self.onconnect = (event) => {
    const port = event.ports[0];
    connectedPorts.push(port);

    console.log(`[matrix-worker] Page connected. Total ports: ${connectedPorts.length}`);

    // Flush buffered events to the new connection
    for (const ev of eventBuffer) {
        safePostMessage(port, ev);
    }

    port.onmessage = (e) => handleMessage(port, e.data);
    port.start();

    // Notify the page that the worker is ready
    safePostMessage(port, { type: 'worker.ready' });
};

// ---- Message Handler ----

async function handleMessage(port, msg) {
    const { id, method, params } = msg;

    try {
        const result = await dispatchMethod(method, params || {});
        safePostMessage(port, { id, result });
    } catch (err) {
        safePostMessage(port, { id, error: err.message || String(err) });
    }
}

// ---- Method Dispatch ----

async function dispatchMethod(method, params) {
    switch (method) {
        // ---- Debug (no WASM needed) ----
        case 'ping':
            return { pong: true, time: Date.now() };

        case 'workerStatus':
            return {
                wasmInitialized,
                hasClient: wasmClient !== null,
                connectedPorts: connectedPorts.length,
            };

        // ---- WASM Lifecycle ----
        case 'loadWasm':
            await ensureWasmLoaded();
            return { ok: true };

        // ---- Session ----
        case 'connect':
            await ensureWasmLoaded();
            wasmClient = new WasmMatrixClient(params.homeserverUrl);
            return { ok: true };

        case 'login':
            if (!wasmClient) throw new Error('Not connected. Call connect first.');
            await wasmClient.login(params.accessToken, params.userId, params.deviceId);
            return { ok: true, userId: params.userId };

        case 'logout':
            if (wasmClient) {
                wasmClient.stop_sync();
                await wasmClient.logout();
                wasmClient = null;
            }
            return { ok: true };

        case 'getSession':
            return {
                ok: true,
                isLoggedIn: wasmClient ? wasmClient.is_logged_in() : false,
            };

        // ---- Sync ----
        case 'startSync':
            if (!wasmClient) throw new Error('Not logged in');
            eventBuffer = [];

            wasmClient.set_event_callback((eventJson) => {
                try {
                    const event = JSON.parse(eventJson);
                    broadcast({ type: event.type || 'matrix.event', payload: event });
                } catch (_) { /* ignore parse errors */ }
            });

            wasmClient.start_sync();
            return { ok: true };

        case 'stopSync':
            if (wasmClient) wasmClient.stop_sync();
            return { ok: true };

        // ---- Rooms ----
        case 'getRooms':
            if (!wasmClient) throw new Error('Not logged in');
            const rooms = await wasmClient.get_rooms();
            return { ok: true, rooms };

        case 'joinRoom':
            if (!wasmClient) throw new Error('Not logged in');
            await wasmClient.join_room(params.roomId);
            return { ok: true };

        case 'leaveRoom':
            if (!wasmClient) throw new Error('Not logged in');
            await wasmClient.leave_room(params.roomId);
            return { ok: true };

        // ---- Messages ----
        case 'sendMessage':
            if (!wasmClient) throw new Error('Not logged in');
            const eventId = await wasmClient.send_message(params.roomId, params.text);
            return { ok: true, eventId };

        case 'getMessages':
            if (!wasmClient) throw new Error('Not logged in');
            const messages = await wasmClient.get_messages(
                params.roomId,
                params.limit || 20,
                params.before || null
            );
            return { ok: true, messages };

        // ---- Crypto ----
        case 'getCryptoStatus':
            if (!wasmClient) throw new Error('Not logged in');
            return { ok: true, e2eAvailable: true };

        // ---- Default ----
        default:
            throw new Error(`Unknown method: ${method}`);
    }
}

// ---- Event Broadcasting ----

function broadcast(event) {
    // Buffer event for future connections
    eventBuffer.push(event);
    // Keep buffer at a reasonable size
    if (eventBuffer.length > 500) {
        eventBuffer = eventBuffer.slice(-300);
    }

    // Send to all connected pages
    connectedPorts = connectedPorts.filter((port) => {
        try {
            port.postMessage(event);
            return true;
        } catch (_) {
            // Port closed (page navigated away), remove it
            return false;
        }
    });
}

// ---- Safe PostMessage ----

function safePostMessage(port, msg) {
    try {
        port.postMessage(msg);
    } catch (_) {
        // Port may be closed
    }
}

// Log startup
console.log('[matrix-worker] SharedWorker initialized, waiting for connections...');
