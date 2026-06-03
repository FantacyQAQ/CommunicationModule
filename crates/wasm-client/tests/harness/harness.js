// Test harness: loads WASM module and exposes API for Playwright tests.
import init, { WasmMatrixClient } from '../../pkg/wasm_client.js';

// Global state
let client = null;
let events = [];
let syncRunning = false;

// Update status in the DOM
function setStatus(text) {
    document.getElementById('status').textContent = text;
}

// Expose test API on window
window.__harness = {
    // ========== Initialization ==========

    async loadWasm() {
        const start = performance.now();
        await init();
        const loadTimeMs = (performance.now() - start).toFixed(0);
        setStatus('ready');
        return { ok: true, loadTimeMs };
    },

    // ========== Connection & Session ==========

    async connect(homeserverUrl) {
        client = new WasmMatrixClient(homeserverUrl);
        return { ok: true };
    },

    async login(accessToken, userId, deviceId) {
        if (!client) throw new Error('Client not connected');
        await client.login(accessToken, userId, deviceId);
        const loggedIn = client.is_logged_in();
        setStatus('logged_in');
        return { ok: true, loggedIn };
    },

    async logout() {
        if (!client) return { ok: true };
        await client.logout();
        client = null;
        syncRunning = false;
        setStatus('disconnected');
        return { ok: true };
    },

    // ========== Sync ==========

    async startSync() {
        if (!client) throw new Error('Not logged in');
        events = [];

        // Register event callback
        client.set_event_callback((eventJson) => {
            try {
                const event = JSON.parse(eventJson);
                event.receivedAt = Date.now();
                events.push(event);
            } catch (e) {
                // ignore parse errors
            }
        });

        client.start_sync();
        syncRunning = true;
        return { ok: true };
    },

    async stopSync() {
        if (client && syncRunning) {
            client.stop_sync();
            syncRunning = false;
        }
        return { ok: true };
    },

    getEvents(sinceIndex = 0) {
        const newEvents = events.slice(sinceIndex);
        return { events: newEvents, totalCount: events.length };
    },

    async waitForEvent(type, timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const match = events.find(e => e.type === type);
            if (match) return match;
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error(`Timeout waiting for event: ${type}`);
    },

    // ========== Rooms ==========

    async getRooms() {
        if (!client) throw new Error('Not logged in');
        const rooms = await client.get_rooms();
        return { ok: true, rooms };
    },

    async joinRoom(roomId) {
        if (!client) throw new Error('Not logged in');
        await client.join_room(roomId);
        return { ok: true };
    },

    async leaveRoom(roomId) {
        if (!client) throw new Error('Not logged in');
        await client.leave_room(roomId);
        return { ok: true };
    },

    // ========== Messages ==========

    async sendMessage(roomId, text) {
        if (!client) throw new Error('Not logged in');
        const eventId = await client.send_message(roomId, text);
        return { ok: true, eventId };
    },

    async getMessages(roomId, limit = 20, before = null) {
        if (!client) throw new Error('Not logged in');
        const messages = await client.get_messages(roomId, limit, before);
        return { ok: true, messages };
    },

    // ========== Crypto ==========

    async getCryptoStatus() {
        if (!client) throw new Error('Not logged in');
        // get_crypto_status may not exist yet, return empty
        if (typeof client.get_crypto_status === 'function') {
            return await client.get_crypto_status();
        }
        return { ok: true, e2e_available: client.is_logged_in() };
    },

    // ========== Session Info ==========

    async getSessionInfo() {
        if (!client) return { isLoggedIn: false };
        return {
            ok: true,
            isLoggedIn: client.is_logged_in(),
        };
    },
};

setStatus('harness_loaded');
console.log('[harness] Ready. window.__harness available.');
