/**
 * Matrix Bridge — 前端 SDK
 *
 * 封装 SharedWorker postMessage 通信，暴露 Promise 风格 API。
 * 前端开发人员只需 import matrixBridge，调用方法即可操作 Matrix 客户端。
 *
 * @example
 *   import { matrixBridge } from './matrix-bridge.js';
 *   await matrixBridge.init('http://localhost:8008');
 *   await matrixBridge.login(token, userId, deviceId);
 *   matrixBridge.on('message.new', (msg) => { ... });
 *   await matrixBridge.sendMessage(roomId, 'hello');
 */

class MatrixBridge {
    constructor() {
        this._worker = null;
        this._port = null;
        this._requestId = 0;
        this._pending = new Map();
        this._handlers = new Map();   // eventType → Set<callback>
        this._ready = false;
        this._homeserverUrl = '';
        this._connected = false;
        this.debug = false;
    }

    // ==================== Lifecycle ====================

    /**
     * 初始化：加载 SharedWorker 和 WASM 模块。
     * @param {string} homeserverUrl - Matrix Homeserver URL
     * @param {string} [workerPath] - SharedWorker 路径，默认 '/matrix/matrix-worker.js'
     */
    async init(homeserverUrl, workerPath = '/matrix/matrix-worker.js') {
        if (this._connected) {
            this._log('Already connected, skipping init');
            return;
        }

        this._homeserverUrl = homeserverUrl;

        this._log(`Connecting to worker: ${workerPath}`);
        this._worker = new SharedWorker(workerPath, { type: 'module' });
        this._port = this._worker.port;

        this._port.onmessage = (e) => this._handleMessage(e.data);
        this._port.onerror = (e) => {
            this._log('Worker error', e);
            this._emit('error', { code: 'WORKER_ERROR', message: 'SharedWorker error' });
        };

        this._port.start();

        // Wait for worker to be ready, with timeout
        await this._waitForEvent('worker.ready', 10000);

        // Load WASM in the worker
        await this._call('loadWasm');

        // Connect to homeserver
        await this._call('connect', { homeserverUrl });

        this._connected = true;
        this._emit('connected', {});
        this._log('Bridge initialized');
    }

    /**
     * 销毁：断开 Worker，释放资源。
     */
    destroy() {
        if (this._port) {
            try { this._port.close(); } catch (_) { /* ignore */ }
        }
        this._worker = null;
        this._port = null;
        this._connected = false;
        this._ready = false;
        this._pending.clear();
        this._handlers.clear();
        this._emit('disconnected', {});
        this._log('Bridge destroyed');
    }

    // ==================== Session ====================

    /**
     * 登录 Matrix Homeserver。
     * @param {string} accessToken
     * @param {string} userId - 如 '@user_42:localhost'
     * @param {string} deviceId
     */
    async login(accessToken, userId, deviceId) {
        const result = await this._call('login', { accessToken, userId, deviceId });
        this._ready = true;
        this._emit('login.ready', { userId });
        return result;
    }

    /** 登出并清除会话。 */
    async logout() {
        const result = await this._call('logout');
        this._ready = false;
        this._connected = false;
        this._emit('disconnected', {});
        return result;
    }

    /** 是否已登录（同步）。 */
    isLoggedIn() {
        return this._ready;
    }

    // ==================== Sync ====================

    /** 启动后台同步循环（登录后自动调用）。 */
    async startSync() {
        return this._call('startSync');
    }

    /** 停止后台同步。 */
    async stopSync() {
        return this._call('stopSync');
    }

    // ==================== Rooms ====================

    /** 获取已加入的房间列表。 */
    async getRooms() {
        return this._call('getRooms');
    }

    /** 加入房间（接受邀请）。 */
    async joinRoom(roomId) {
        return this._call('joinRoom', { roomId });
    }

    /** 离开房间。 */
    async leaveRoom(roomId) {
        return this._call('leaveRoom', { roomId });
    }

    // ==================== Messages ====================

    /**
     * 发送文本消息。
     * @returns {Promise<{eventId: string}>}
     */
    async sendMessage(roomId, text) {
        return this._call('sendMessage', { roomId, text });
    }

    /**
     * 获取历史消息。
     * @param {string} roomId
     * @param {number} [limit=20]
     */
    async getMessages(roomId, limit = 20) {
        return this._call('getMessages', { roomId, limit });
    }

    // ==================== Events ====================

    /**
     * 订阅事件。
     * @param {string} event - 事件名，'*' 订阅所有
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        this._handlers.get(event).add(callback);
    }

    /**
     * 取消订阅。
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const handlers = this._handlers.get(event);
        if (handlers) {
            handlers.delete(callback);
        }
    }

    // ==================== Crypto ====================

    /** 获取加密状态。 */
    async getCryptoStatus() {
        return this._call('getCryptoStatus');
    }

    // ==================== Internal ====================

    /** 发送请求到 Worker，等待响应。 */
    _call(method, params = {}) {
        if (!this._port) {
            return Promise.reject(new Error('Bridge not initialized. Call init() first.'));
        }

        return new Promise((resolve, reject) => {
            const id = ++this._requestId;
            this._pending.set(id, { resolve, reject, method });

            this._log('→', method, params);

            this._port.postMessage({ id, method, params });

            // 超时
            setTimeout(() => {
                if (this._pending.has(id)) {
                    const p = this._pending.get(id);
                    this._pending.delete(id);
                    p.reject(new Error(`Request timeout: ${method}`));
                }
            }, 30000);  // 30 秒超时（sync 等操作可能较慢）
        });
    }

    /** 处理 Worker 发来的消息。 */
    _handleMessage(msg) {
        // 请求响应
        if (msg.id !== undefined) {
            const pending = this._pending.get(msg.id);
            if (!pending) return;

            this._pending.delete(msg.id);

            if (msg.error) {
                this._log('✗', pending.method, msg.error);
                pending.reject(new Error(msg.error));
            } else {
                this._log('←', pending.method, msg.result);
                pending.resolve(msg.result);
            }
            return;
        }

        // 广播事件
        this._log('EVENT', msg.type, msg.payload);
        this._emit(msg.type, msg.payload);
    }

    /** 触发事件回调。 */
    _emit(type, payload) {
        // 特定事件
        const handlers = this._handlers.get(type);
        if (handlers) {
            handlers.forEach(fn => {
                try { fn(payload); } catch (e) { console.error('[matrix-bridge] handler error:', e); }
            });
        }

        // 通配符 '*'
        const wildcard = this._handlers.get('*');
        if (wildcard) {
            wildcard.forEach(fn => {
                try { fn(type, payload); } catch (e) { console.error('[matrix-bridge] wildcard error:', e); }
            });
        }
    }

    /** 等待特定类型的 Worker 事件。 */
    _waitForEvent(type, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(type, handler);
                reject(new Error(`Timeout waiting for event: ${type}`));
            }, timeoutMs);

            const handler = (payload) => {
                clearTimeout(timer);
                this.off(type, handler);
                resolve(payload);
            };

            this.on(type, handler);
        });
    }

    /** 调试日志。 */
    _log(...args) {
        if (this.debug) {
            console.log('[matrix-bridge]', ...args);
        }
    }
}

// 单例导出
export const matrixBridge = new MatrixBridge();
export { MatrixBridge };
