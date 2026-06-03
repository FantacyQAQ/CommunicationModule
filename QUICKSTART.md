# Matrix Bridge 快速上手

## 1. 复制文件

**运行时资源（放到 `public/matrix/`）**：

这三个文件在运行时被浏览器动态加载，不能被 Vite/Webpack 打包，必须放在静态资源目录。

```
crates/wasm-client/workspace/matrix-worker.js   → public/matrix/matrix-worker.js
crates/wasm-client/pkg/wasm_client.js           → public/matrix/wasm_client.js
crates/wasm-client/pkg/wasm_client_bg.wasm      → public/matrix/wasm_client_bg.wasm
```

> **注意**：三个文件必须在同一目录下。`matrix-worker.js` 通过相对路径 `import ... from '../pkg/wasm_client.js'` 引用 WASM 模块，`wasm_client.js` 通过 `fetch('wasm_client_bg.wasm')` 加载二进制。

**SDK 模块（放到 `src/utils/`）**：

这个文件是普通 JS 模块，被 Vue 组件 `import`，可以被打包工具处理。

```
crates/wasm-client/bridge/matrix-bridge.js      → src/utils/matrix-bridge.js
```

如果你使用 Vite，`public/` 下的文件会被原样复制到构建输出；如果你使用 Webpack，需要配置 `copy-webpack-plugin`。

---

## 2. 引入

```javascript
import { matrixBridge } from '@/utils/matrix-bridge.js';
```

`@/utils/` 是 Vite 的 src 别名，实际路径为 `src/utils/matrix-bridge.js`。

---

## 3. 初始化

在用户登录后调用（通常放在 App.vue 的 `onMounted` 或路由守卫中）：

```javascript
// 初始化（只需一次）
await matrixBridge.init('http://localhost:8008');
```

Homeserver URL 建议从环境变量或后端配置接口获取。

---

## 4. 登录

从你的 Java 后端获取 Matrix 凭证。每个平台用户对应一个 Matrix 账号，后端在用户注册时完成 Matrix 账号的创建。

```javascript
// 从后端获取当前用户的 Matrix 凭证
const resp = await fetch('/api/chat/credentials');
const { accessToken, userId, deviceId } = await resp.json();

// 登录 Matrix
await matrixBridge.login(accessToken, userId, deviceId);

// 登录成功后，后台 sync 自动启动，可以开始监听事件
```

后端接口建议设计：

```
GET /api/chat/credentials
Response:
{
    "accessToken": "syt_abc123...",
    "userId": "@user_42:localhost",
    "deviceId": "WEB_BROWSER",
    "homeserverUrl": "http://localhost:8008"
}
```

---

## 5. 获取房间列表

```javascript
const rooms = await matrixBridge.getRooms();
// rooms = [
//   { roomId: "!abc:localhost", name: "交易-#456", topic: "商品: MacBook Pro | 买家: Alice" },
//   ...
// ]
```

---

## 6. 接收消息

```javascript
matrixBridge.on('message.new', (msg) => {
    // msg = {
    //   eventId: "$xxx",
    //   roomId: "!abc:localhost",
    //   sender: "@user_88:localhost",
    //   body: "你好，这个还在吗？",
    //   timestamp: 1717400000000
    // }

    // 更新聊天 UI
    chatStore.addMessage(msg.roomId, msg);
    // 如果在其他页面，显示未读提示
    if (chatStore.activeRoomId !== msg.roomId) {
        chatStore.incrementUnread(msg.roomId);
    }
});
```

---

## 7. 发送消息

```javascript
async function handleSend(text) {
    try {
        const { eventId } = await matrixBridge.sendMessage(
            currentRoomId.value,
            text
        );
        // 发送成功，本地立即显示
        chatStore.addLocalMessage(currentRoomId.value, {
            eventId,
            body: text,
            sender: myUserId,
            timestamp: Date.now(),
        });
    } catch (err) {
        showToast('发送失败: ' + err.message);
    }
}
```

---

## 8. 完整示例：Vue 3 Composition API

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { matrixBridge } from '@/utils/matrix-bridge.js';

const rooms = ref([]);
const messages = ref([]);
const currentRoomId = ref(null);

onMounted(async () => {
    // 初始化（假设全局已调用 init）
    const creds = await fetch('/api/chat/credentials').then(r => r.json());
    await matrixBridge.login(creds.accessToken, creds.userId, creds.deviceId);
    
    rooms.value = await matrixBridge.getRooms();
    
    matrixBridge.on('message.new', (msg) => {
        if (msg.roomId === currentRoomId.value) {
            messages.value.push(msg);
        }
    });
});

onUnmounted(() => {
    // 可选：不销毁，让 Worker 在后台继续接收消息
});
</script>
```

---

## 9. Vue 3 Pinia Store 示例

```javascript
// stores/chat.js
import { defineStore } from 'pinia';
import { matrixBridge } from '@/utils/matrix-bridge.js';

export const useChatStore = defineStore('chat', () => {
    const rooms = ref([]);
    const messages = ref({});   // roomId → Message[]
    const activeRoomId = ref(null);
    const isReady = ref(false);

    async function init() {
        const creds = await fetch('/api/chat/credentials').then(r => r.json());
        await matrixBridge.init(creds.homeserverUrl);
        await matrixBridge.login(creds.accessToken, creds.userId, creds.deviceId);
        
        rooms.value = await matrixBridge.getRooms();
        isReady.value = true;

        matrixBridge.on('message.new', (msg) => {
            if (!messages.value[msg.roomId]) {
                messages.value[msg.roomId] = [];
            }
            messages.value[msg.roomId].push(msg);
        });
    }

    async function sendMessage(roomId, text) {
        const { eventId } = await matrixBridge.sendMessage(roomId, text);
        return eventId;
    }

    return { rooms, messages, activeRoomId, isReady, init, sendMessage };
});
```

---

## 常见问题

**Q: 用户刷新页面后需要重新登录吗？**

A: 不需要。WASM 客户端使用 IndexedDB 持久化会话，SharedWorker 在浏览器后台存活。`login()` 调用会自动恢复之前的会话。

**Q: WASM 文件太大（9.8MB），加载慢怎么办？**

A: 
- 构建时使用 `--release` 模式 + `wasm-opt` 可压缩到约 3MB
- WASM 只在首次进入聊天页面时加载，不是首屏必需资源
- 可以显示骨架屏（Skeleton Loading）优化体验

**Q: 如何知道连接断了？**

A: 监听 `sync.state` 事件，当 `state === 'error'` 时表示连接异常。

```javascript
matrixBridge.on('sync.state', ({ state }) => {
    if (state === 'error') {
        showBanner('消息连接断开，正在重连...');
    }
});
```

---

*文档版本: 0.1.0*
*最后更新: 2026-06-03*
