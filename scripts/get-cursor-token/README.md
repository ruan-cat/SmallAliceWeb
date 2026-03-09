# get-cursor-token

从本机 Cursor IDE 的存储文件中，程序化地提取以下凭据信息：

1. **Machine ID** — 本机的唯一标识符（UUID 格式），同时输出无连字符的 32 位十六进制版本
2. **Cursor Access Token** — 用户的会话令牌（JWT 格式）

这些信息主要用于 CCS Config 等第三方工具的集成认证。

## 1. 快速开始

```bash
pnpm install
pnpm start
```

输出示例：

```log
 ╭──────────────────────╮
 │                      │
 │  Cursor Credentials  │
 │                      │
 ╰──────────────────────╯

✓ Machine ID: b545779e-f0c2-49a5-b6a1-cdb301cc5a88
✓ Machine ID (no dash): b545779ef0c249a5b6a1cdb301cc5a88
✓ Access Token: eyJhbGciOiJIUzI1NiIs...
```

## 2. 数据来源

### 2.1. Machine ID

|     属性     |                                值                                 |
| :----------: | :---------------------------------------------------------------: |
|   文件路径   |                   `%APPDATA%\Cursor\machineid`                    |
|   文件格式   |                         纯文本，单行内容                          |
|   内容格式   |    带连字符的 UUID，如 `b545779e-f0c2-49a5-b6a1-cdb301cc5a88`     |
| CCS 所需格式 | 去掉连字符的 32 位十六进制，如 `b545779ef0c249a5b6a1cdb301cc5a88` |
|   读取方式   |                    `fs.readFileSync` 直接读取                     |

### 2.2. Access Token

|   属性   |                        值                         |
| :------: | :-----------------------------------------------: |
| 文件路径 | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| 文件格式 |                  SQLite 3 数据库                  |
|  表名称  |                    `ItemTable`                    |
|  Key 值  |             `cursorAuth/accessToken`              |
| 内容格式 |              JWT 字符串，约 415 字符              |
| 读取方式 |      使用 `better-sqlite3` 打开数据库并查询       |

### 2.3. 同一数据库中的其他可用字段

|                Key                |        说明        |
| :-------------------------------: | :----------------: |
|     `cursorAuth/accessToken`      |  访问令牌（JWT）   |
|     `cursorAuth/refreshToken`     |  刷新令牌（JWT）   |
|     `cursorAuth/cachedEmail`      | 登录账号的邮箱地址 |
| `cursorAuth/stripeMembershipType` |      订阅类型      |

## 3. 项目结构

```plain
get-cursor-token/
├── package.json
├── tsconfig.json
├── README.md              ← 本文档
├── DESIGN.md              ← 设计文档（含探索过程记录）
└── src/
    ├── index.ts            ← CLI 入口，使用 consola 输出
    ├── get-machine-id.ts   ← 读取 machineid 文件
    └── get-access-token.ts ← 读取 state.vscdb 数据库
```

## 4. 技术栈

|    组件     |      选型      |            说明             |
| :---------: | :------------: | :-------------------------: |
|   运行时    |  Node.js ≥ 22  |  需要 fs、path 等内置模块   |
|    语言     |   TypeScript   |          类型安全           |
|  命令运行   |      tsx       | 直接运行 .ts 文件，无需编译 |
| SQLite 驱动 | better-sqlite3 |   同步 API，轻量，性能好    |
|  日志输出   |    consola     |     美观的终端输出格式      |

## 5. 设计思想

### 5.1. 数据读取策略

- **Machine ID**：直接通过 `fs.readFileSync` 读取纯文本文件，返回原始 UUID 格式（保留连字符），在 CLI 输出层额外提供无连字符版本供 CCS 使用
- **Access Token**：通过 `better-sqlite3` 以 `readonly: true` 模式打开 SQLite 数据库，避免与 Cursor 运行时产生锁冲突，仅查询 `cursorAuth/accessToken` 字段

### 5.2. 错误处理

每个数据源的读取逻辑独立 try-catch，单个数据源失败不影响其他数据源的输出。主要的异常场景包括：

- `APPDATA` 环境变量缺失（非 Windows 系统）
- `machineid` 文件不存在（Cursor 未首次启动）
- `state.vscdb` 中找不到 `accessToken`（Cursor 未登录）

### 5.3. 模块分离

将 Machine ID 和 Access Token 的获取逻辑分离到独立文件，各自导出纯函数，方便其他模块复用或未来扩展。

## 6. 风险与注意事项

### 6.1. 安全风险

| 风险等级 |            风险项            |                                      说明与缓解措施                                      |
| :------: | :--------------------------: | :--------------------------------------------------------------------------------------: |
|    高    |   Access Token 是敏感凭据    |    相当于用户的 Cursor 登录凭证。**禁止**提交到 Git 仓库、打印到公开日志或分享给他人     |
|    高    |  Token 可被用于冒充用户身份  | 持有 Token 的人可以以该用户身份调用 Cursor API。泄露后应立即在 Cursor 中重新登录使其失效 |
|    中    | state.vscdb 包含多种敏感信息 |     该数据库还可能包含 API Key（Google、OpenAI）。代码中仅读取所需字段，避免全量导出     |

### 6.2. 兼容性风险

| 风险等级 |             风险项              |                                           说明与缓解措施                                            |
| :------: | :-----------------------------: | :-------------------------------------------------------------------------------------------------: |
|    高    |         仅支持 Windows          | `%APPDATA%` 是 Windows 环境变量。macOS / Linux 路径不同，如需跨平台支持需按 `process.platform` 分支 |
|    中    | Cursor 版本升级可能变更存储结构 |           Cursor 内部存储结构未形成公开 API 契约，版本升级后 key 名称、数据库结构可能变化           |
|    中    |   better-sqlite3 需要原生编译   |     安装时需要编译环境（Python、C++ build tools）。如遇问题，可考虑 `sql.js`（纯 WASM）作为替代     |

### 6.3. 运行时风险

| 风险等级 |             风险项              |                            说明与缓解措施                            |
| :------: | :-----------------------------: | :------------------------------------------------------------------: |
|    中    |          Token 会过期           |     JWT 中的 `exp` 字段定义过期时间。过期后需用户重新登录 Cursor     |
|    中    | Cursor 运行时可能锁定数据库文件 |          已使用 `readonly: true` 模式打开数据库以避免锁冲突          |
|    低    |      machineid 文件不存在       | 全新安装且未首次启动的 Cursor 可能没有该文件，代码会给出明确错误提示 |

## 7. 跨平台路径参考

|  平台   |                  machineid 路径                  |                           state.vscdb 路径                            |
| :-----: | :----------------------------------------------: | :-------------------------------------------------------------------: |
| Windows |           `%APPDATA%\Cursor\machineid`           |           `%APPDATA%\Cursor\User\globalStorage\state.vscdb`           |
|  macOS  | `~/Library/Application Support/Cursor/machineid` | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
|  Linux  |           `~/.config/Cursor/machineid`           |           `~/.config/Cursor/User/globalStorage/state.vscdb`           |

## 8. 后续可扩展方向

1. **输出格式化** — 支持 `--json` 参数，输出 JSON 格式方便脚本集成
2. **剪贴板复制** — 获取后自动复制到系统剪贴板（可用 `clipboardy` 包）
3. **Token 有效性检查** — 解析 JWT 的 `exp` 字段，提示用户 Token 是否已过期
4. **跨平台支持** — 根据 `process.platform` 自动匹配不同系统的文件路径
5. **Watch 模式** — 监听 `state.vscdb` 文件变化，Token 更新后自动输出新值
