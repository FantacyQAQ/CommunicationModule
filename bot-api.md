# Bot gRPC API 参考

## 概述

`cloud-backend` 是部署在服务器上的 Matrix 管理 Bot，通过 gRPC 协议调用。负责平台用户到 Matrix 用户的注册映射、聊天室创建与管理。

**默认监听**: `127.0.0.1:50051`

---

## 部署

从 `backend.zip` 解压后直接启动:

```bash
unzip backend.zip && cd backend
podman compose up -d
```

启动后暴露两个端口：

| 端口 | 服务 | 调用方 |
|------|------|--------|
| `8008` | Matrix Client-Server API | 前端 WASM 客户端 |
| `50051` | Bot gRPC | Java 后端 |

容器内 `entrypoint.sh` 自动完成：生成随机密码 → 等待 Conduit → 注册 Bot → 启动服务。无需任何手动配置。

| 参数 | 默认值 | 说明 |
|------|------|------|
| `--mode grpc` | `cli` | 启动模式，必须设为 `grpc` |
| `--port` | `127.0.0.1:50051` | gRPC 监听地址 |
| `--homeserver-url` | `http://127.0.0.1:8008` | Matrix Homeserver URL |
| `--bot-username` | `chatbot` | Bot 的 Matrix 账号 |
| `--bot-password` / `BOT_PASSWORD` | 无默认（必填） | Bot 密码，优先用环境变量 |
| `--db-path` | `./data/bot.db` | SQLite 数据库路径 |

---

## 服务定义

```
service BotService {
    rpc Ping(PingRequest) returns (PingResponse);

    rpc RegisterUser(RegisterUserRequest) returns (RegisterUserResponse);
    rpc GetUserCredentials(GetUserCredentialsRequest) returns (GetUserCredentialsResponse);

    rpc CreateRoom(CreateRoomRequest) returns (CreateRoomResponse);
    rpc GetRoom(GetRoomRequest) returns (GetRoomResponse);
    rpc CloseRoom(CloseRoomRequest) returns (CloseRoomResponse);

    rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
    rpc ListRooms(ListRoomsRequest) returns (ListRoomsResponse);
}
```

---

## RPC 参考

### Ping

健康检查。

**请求**: `PingRequest {}`（空）

**响应**: `PingResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `pong` | `bool` | 固定为 `true` |
| `time` | `int64` | 服务器 Unix 毫秒时间戳 |

```bash
grpcurl -plaintext -proto bot.proto 127.0.0.1:50051 bot.BotService/Ping
# → { "pong": true, "time": 1717400000000 }
```

---

### RegisterUser

为平台用户注册 Matrix 账号。**幂等**：若用户已注册，返回已有映射（但不返回新 token）。

**请求**: `RegisterUserRequest`

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform_user_id` | `string` | 平台用户 ID（如 `"123"`） |

**响应**: `RegisterUserResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_user_id` | `string` | Matrix 用户 ID（如 `"@u_123:localhost"`） |
| `access_token` | `string` | Matrix Access Token（首次注册时返回，已存在时为空） |
| `device_id` | `string` | 设备 ID |

```bash
grpcurl -plaintext -d '{"platform_user_id":"123"}' \
    127.0.0.1:50051 bot.BotService/RegisterUser
# → {
#     "matrixUserId": "@u_123:localhost",
#     "accessToken": "syt_abc123...",
#     "deviceId": "BOT_DEV"
#   }
```

**Java 端流程**：收到 `access_token` 后立即返回给前端，前端存 localStorage 并用它调用 `matrixBridge.login()`。**Java 后端不存储 token**。

---

### GetUserCredentials

查询平台用户对应的 Matrix 用户 ID。不返回 access token（token 由wasm客户端自行管理）。

**请求**: `GetUserCredentialsRequest`

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform_user_id` | `string` | 平台用户 ID |

**响应**: `GetUserCredentialsResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_user_id` | `string` | Matrix 用户 ID |

**错误**：用户未注册时返回 `NOT_FOUND`。

---

### CreateRoom

创建聊天室并邀请买卖双方。**幂等**：若 (buyer_pid, seller_pid) 已有活跃房间，直接返回已有房间 ID。

**请求**: `CreateRoomRequest`

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `buyer_pid` | `string` | ✅ | 买家平台用户 ID |
| `seller_pid` | `string` | ✅ | 卖家平台用户 ID |
| `title` | `string` | ✅ | 房间名称（如 `"二手 MacBook Pro"`） |
| `topic` | `string` | ❌ | 房间主题（可存放订单摘要） |

**响应**: `CreateRoomResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_room_id` | `string` | Matrix 房间 ID（如 `"!abc123:localhost"`） |

```bash
grpcurl -plaintext -d '{
    "buyer_pid": "123",
    "seller_pid": "456",
    "title": "二手 MacBook Pro",
    "topic": "商品: MacBook Pro | 买家: Alice | 卖家: Bob"
}' 127.0.0.1:50051 bot.BotService/CreateRoom
# → { "matrixRoomId": "!abc123:localhost" }
```

**流程**：
1. Java 后端校验订单有效性
2. 调用 `CreateRoom`
3. Bot 在 Matrix 上创建房间、邀请买卖双方、发送欢迎消息
4. 返回 `matrix_room_id`
5. 前端 WASM 客户端通过 Sync 收到邀请 → 自动 joinRoom

---

### GetRoom

按买卖家平台 ID 查询已有房间。

**请求**: `GetRoomRequest`

| 字段 | 类型 | 说明 |
|------|------|------|
| `buyer_pid` | `string` | 买家平台用户 ID |
| `seller_pid` | `string` | 卖家平台用户 ID |

**响应**: `GetRoomResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_room_id` | `string` (optional) | Matrix 房间 ID，无活跃房间时为空 |

---

### CloseRoom

关闭/归档聊天室。房间关闭后会发送系统通知。

**请求**: `CloseRoomRequest`

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_room_id` | `string` | Matrix 房间 ID |

**响应**: `CloseRoomResponse {}`（空）

---

### ListUsers

列出所有已注册的平台用户 → Matrix 用户映射。

**响应**: `ListUsersResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `users` | `repeated UserEntry` | 用户列表 |

**UserEntry**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform_user_id` | `string` | 平台用户 ID |
| `matrix_user_id` | `string` | Matrix 用户 ID |
| `created_at` | `int64` | Unix 秒时间戳 |

---

### ListRooms

列出所有聊天室。

**响应**: `ListRoomsResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `rooms` | `repeated RoomEntry` | 房间列表 |

**RoomEntry**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `matrix_room_id` | `string` | Matrix 房间 ID |
| `buyer_pid` | `string` | 买家平台用户 ID |
| `seller_pid` | `string` | 卖家平台用户 ID |
| `title` | `string` | 房间名称 |
| `topic` | `string` (optional) | 房间主题 |
| `status` | `string` | `"active"` 或 `"closed"` |

---

## 错误处理

所有 RPC 在失败时返回标准 gRPC Status：

| 状态码 | 场景 |
|--------|------|
| `INTERNAL` | 服务器内部错误（Matrix 连接异常、DB 错误等） |
| `NOT_FOUND` | 用户未注册或房间不存在 |
| `INVALID_ARGUMENT` | 参数格式错误 |

---

## Proto 文件

完整定义见 `crates/cloud-backend/proto/bot.proto`。

Java 端可使用 `protoc` 生成客户端 stub：

```bash
protoc --java_out=src/main/java \
    --grpc-java_out=src/main/java \
    proto/bot.proto
```

---

*文档版本: 0.1.0*
*最后更新: 2026-06-05*
