# Matrix Bridge API 参考

## 架构概述

```
Vue 3 页面                          浏览器进程
┌──────────────────┐                ┌───────────────────────────────────┐
│ matrix-bridge.js │──postMessage──>│ SharedWorker                      │
│ (Promise API)    │                │ matrix-worker.js                  │
│                  │<─broadcast──── │   ├── WASM 客户端 (login,         │
│ on('message')    │                │   │   sync, send, crypto)         │
└──────────────────┘                │   └── Matrix CS API -> Homeserver │
                                    └───────────────────────────────────┘
```

- **matrix-bridge.js**：前端唯一需要 import 的模块，暴露 Promise 风格的 API
- **SharedWorker**：浏览器后台线程，加载 WASM Matrix 客户端，所有页面共享同一连接
- **WASM 客户端**：matrix-rust-sdk -> WASM，处理 E2E 加密、sync 循环

---

## 安装

从 `frontend.zip` 中提取文件，按以下规则放置：

**运行时资源 — 复制到 `public/matrix/`（不可打包，运行时动态加载）：**

| 文件 | 目标路径 | 说明 |
|------|---------|------|
| `matrix-worker.js` | `public/matrix/matrix-worker.js` | SharedWorker |
| `wasm_client.js` | `public/matrix/wasm_client.js` | WASM JS 胶水 |
| `wasm_client_bg.wasm` | `public/matrix/wasm_client_bg.wasm` | WASM 二进制（~13MB，gzip ~3.9MB） |

**SDK 模块 — 复制到 `src/utils/`（可打包）：**

| 文件 | 目标路径 | 说明 |
|------|---------|------|
| `matrix-bridge.js` | `src/utils/matrix-bridge.js` | 前端 SDK |

---

## 快速开始

```javascript
import { matrixBridge } from '@/utils/matrix-bridge.js';

// 1. 初始化
// Homeserver URL 填实际ip地址或域名, 端口看具体反代情况, 后端Matrix home server默认暴露8008端口
await matrixBridge.init('http://localhost:8008');

// 2. 登录（凭证来自后端 API）
await matrixBridge.login(accessToken, userId, deviceId);

// 3. 获取房间
const rooms = await matrixBridge.getRooms();

// 4. 监听新消息
matrixBridge.on('message.new', (msg) => {
    console.log(`[${msg.roomId}] ${msg.sender}: ${msg.body}`);
});

// 5. 发消息
await matrixBridge.sendMessage(roomId, '你好！');
```

---

## API 参考

### 初始化

#### `matrixBridge.init(homeserverUrl, workerPath?)`

初始化桥接：加载 SharedWorker 和 WASM 模块。

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `homeserverUrl` | `string` | true | Matrix Homeserver URL，如 `http://localhost:8008` |
| `workerPath` | `string` | false | SharedWorker 路径，默认 `'/matrix/matrix-worker.js'` |

| 返回值 | 说明 |
|--------|------|
| `Promise<void>` | 初始化完成 |

```javascript
await matrixBridge.init('http://localhost:8008');
// 或指定 Worker 路径
await matrixBridge.init('http://localhost:8008', '/static/matrix-worker.js');
```

#### `matrixBridge.destroy()`

断开 Worker 连接，释放资源。一般在用户登出或页面卸载时调用。

```javascript
window.addEventListener('beforeunload', () => matrixBridge.destroy());
```

---

### 会话管理

#### `matrixBridge.login(accessToken, userId, deviceId)`

登录 Matrix 服务器。这三个参数需要从后端获取（后端负责在 Matrix Homeserver 上注册用户）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `accessToken` | `string` | Matrix Access Token（如 `syt_abc123...`） |
| `userId` | `string` | Matrix 用户 ID（如 `@user_42:localhost`） |
| `deviceId` | `string` | 设备 ID（如 `WEB_BROWSER`） |

| 返回值 | 说明 |
|--------|------|
| `Promise<{ok: true, userId: string}>` | 登录成功 |

登录成功后自动：
1. 连接 Matrix Homeserver 并验证 Token
2. 执行初始同步（拉取房间列表）
3. 启动后台 sync 循环（实时接收新消息）
4. 触发 `login.ready` 事件

#### `matrixBridge.logout()`

登出并清除会话。

```javascript
await matrixBridge.logout();
// 触发 'disconnected' 事件
```

#### `matrixBridge.isLoggedIn()`

同步检查是否已登录。

| 返回值 | 说明 |
|--------|------|
| `boolean` | 无 |

---

### 房间操作

#### `matrixBridge.getRooms()`

获取当前用户已加入的所有房间。

| 返回值 |
|--------|
| `Promise<Room[]>` |

```javascript
const rooms = await matrixBridge.getRooms();
// [{ roomId: '!abc:localhost', name: '交易-#456', topic: '商品: MacBook Pro' }]
```

#### `matrixBridge.joinRoom(roomId)`

加入一个房间（通常用于接受邀请）。

| 参数 | 说明 |
|------|------|
| `roomId` | Matrix 房间 ID，如 `!abc123:localhost` |

#### `matrixBridge.leaveRoom(roomId)`

离开一个房间。

---

### 消息操作

#### `matrixBridge.sendMessage(roomId, text)`

向指定房间发送文本消息。

| 参数 | 类型 | 说明 |
|------|------|------|
| `roomId` | `string` | 目标房间 ID |
| `text` | `string` | 消息文本 |

| 返回值 | 说明 |
|--------|------|
| `Promise<{eventId: string}>` | `eventId` 为 Matrix 事件 ID |

```javascript
const { eventId } = await matrixBridge.sendMessage(
    '!abc123:localhost',
    '你好，这个还在吗？'
);
```

#### `matrixBridge.getMessages(roomId, limit?)`

获取房间历史消息。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|:---:|------|
| `roomId` | `string` | — | 房间 ID |
| `limit` | `number` | 20 | 最大返回条数 |

| 返回值 | 说明 |
|--------|------|
| `Promise<Message[]>` | 按时间升序排列 |

---

### 事件系统

#### `matrixBridge.on(event, callback)`

订阅事件。

```javascript
matrixBridge.on('message.new', (msg) => {
    chatStore.addMessage(msg.roomId, msg);
});
```

#### `matrixBridge.off(event, callback)`

取消订阅。

---

### 事件参考

| 事件名 | payload | 触发时机 |
|--------|------|------|
| `connected` | `{}` | Worker 连接建立 |
| `login.ready` | `{ userId: string }` | 登录成功并完成初始同步 |
| `message.new` | `Message` | 收到新消息 |
| `room.invite` | `{ roomId, roomName?, inviterId }` | 收到房间邀请 |
| `room.joined` | `{ roomId }` | 成功加入房间 |
| `sync.state` | `{ state: 'syncing' \| 'error' }` | 同步状态变更 |
| `error` | `{ code, message }` | 错误 |

```javascript
// 监听特定事件
matrixBridge.on('message.new', handler);

// 监听所有事件（调试用）
matrixBridge.on('*', (eventName, payload) => {
    console.log('[matrix]', eventName, payload);
});

// 监听连接状态
matrixBridge.on('sync.state', ({ state }) => {
    if (state === 'error') showReconnectBanner();
});
```

---

## 数据结构

### Room

```typescript
interface Room {
    roomId: string;      // Matrix 房间 ID，如 "!abc123:localhost"
    name: string;        // 房间名称
    topic: string | null; // 房间主题（可用于存储订单信息）
}
```

### Message

```typescript
interface Message {
    eventId: string;     // Matrix 事件 ID
    roomId: string;      // 所属房间 ID
    sender: string;      // 发送者 Matrix 用户 ID
    body: string;        // 消息文本
    timestamp: number;   // Unix 毫秒时间戳
}
```

---

## 错误处理

所有异步方法在失败时会抛出 `Error`：

```javascript
try {
    await matrixBridge.login(token, userId, deviceId);
} catch (err) {
    console.error('登录失败:', err.message);
    // err.message 示例:
    // "Login failed: the server returned an error: [401 / M_UNKNOWN_TOKEN]"
}
```

通用错误事件：

```javascript
matrixBridge.on('error', ({ code, message }) => {
    // code: 'NETWORK_ERROR' | 'AUTH_ERROR' | 'SYNC_ERROR' | ...
    // message: 人类可读的错误描述
});
```

---

## 调试

开启调试模式会在浏览器控制台输出详细日志：

```javascript
matrixBridge.debug = true;
// 控制台输出:
// [matrix-bridge] -> connect {homeserverUrl: "http://localhost:8008"}
// [matrix-bridge] <- connect {ok: true}
// [matrix-bridge] EVENT message.new {roomId: "!abc:localhost", ...}
```

---

*最后更新: 2026-06-03*
