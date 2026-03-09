# 2026-03-09 get-cursor-token 子包设计文档

## 1. 概述

本子包用于从本机 Cursor IDE 的存储文件中，程序化地提取以下信息：

1. **Cursor Access Token** — 用户的会话令牌（JWT 格式）
2. **Machine ID** — 本机的唯一标识符（32 位十六进制，无连字符）

这些信息主要用于 CCS Config 等第三方工具的集成认证。

## 2. 信息存储位置

### 2.1. Machine ID

|     属性     |                                值                                 |
| :----------: | :---------------------------------------------------------------: |
|   文件路径   |                   `%APPDATA%\Cursor\machineid`                    |
|   文件格式   |                         纯文本，单行内容                          |
|   内容格式   |    带连字符的 UUID，如 `b545779e-f0c2-49a5-b6a1-cdb301cc5a88`     |
| CCS 所需格式 | 去掉连字符的 32 位十六进制，如 `b545779ef0c249a5b6a1cdb301cc5a88` |
|   读取方式   |                    `fs.readFileSync` 直接读取                     |

### 2.2. Cursor Access Token

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

## 3. 技术方案

### 3.1. 技术栈选型

|    组件     |      选型      |            说明             |
| :---------: | :------------: | :-------------------------: |
|   运行时    |  Node.js ≥ 18  |  需要 fs、path 等内置模块   |
|    语言     |   TypeScript   |          类型安全           |
|  命令运行   |      tsx       | 直接运行 .ts 文件，无需编译 |
| SQLite 驱动 | better-sqlite3 |   同步 API，轻量，性能好    |
|  CLI 框架   | 可选（citty）  |    如需子命令扩展可引入     |

### 3.2. 核心实现逻辑

#### 3.2.1. 获取 Machine ID

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 获取 Cursor Machine ID（无连字符的 32 位十六进制） */
export function getMachineId(): string {
	const appData = process.env.APPDATA;
	if (!appData) {
		throw new Error("无法读取 APPDATA 环境变量，当前可能不是 Windows 系统");
	}

	const machineIdPath = join(appData, "Cursor", "machineid");
	const rawId = readFileSync(machineIdPath, "utf-8").trim();

	return rawId.replace(/-/g, "");
}
```

#### 3.2.2. 获取 Access Token

```typescript
import Database from "better-sqlite3";
import { join } from "node:path";

/** 获取 Cursor Access Token */
export function getAccessToken(): string {
	const appData = process.env.APPDATA;
	if (!appData) {
		throw new Error("无法读取 APPDATA 环境变量，当前可能不是 Windows 系统");
	}

	const dbPath = join(appData, "Cursor", "User", "globalStorage", "state.vscdb");

	const db = new Database(dbPath, { readonly: true });
	try {
		const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as
			| { value: string | Buffer }
			| undefined;

		if (!row) {
			throw new Error("未找到 accessToken，请确认 Cursor 已登录");
		}

		return row.value.toString();
	} finally {
		db.close();
	}
}
```

#### 3.2.3. CLI 入口（使用 tsx 运行）

```typescript
import { getMachineId } from "./get-machine-id";
import { getAccessToken } from "./get-access-token";

function main() {
	console.log("=== Cursor Credentials ===\n");

	try {
		const machineId = getMachineId();
		console.log("Machine ID (32 hex):", machineId);
	} catch (e) {
		console.error("获取 Machine ID 失败:", (e as Error).message);
	}

	try {
		const token = getAccessToken();
		console.log("Access Token:", token);
	} catch (e) {
		console.error("获取 Access Token 失败:", (e as Error).message);
	}
}

main();
```

### 3.3. 推荐的包目录结构

```plain
get-cursor-token/
├── package.json
├── tsconfig.json
├── DESIGN.md              ← 本文档
└── src/
    ├── index.ts            ← CLI 入口
    ├── get-machine-id.ts   ← 读取 machineid 文件
    └── get-access-token.ts ← 读取 state.vscdb 数据库
```

### 3.4. package.json 关键配置

```json
{
	"name": "get-cursor-token",
	"version": "0.1.0",
	"private": true,
	"type": "module",
	"scripts": {
		"start": "tsx src/index.ts"
	},
	"dependencies": {
		"better-sqlite3": "^11.0.0"
	},
	"devDependencies": {
		"@types/better-sqlite3": "^7.0.0",
		"tsx": "^4.0.0",
		"typescript": "^5.0.0"
	}
}
```

运行命令：

```bash
pnpm install
pnpm start
```

## 4. 探索过程记录

以下是本次实际探索中发现的关键路径和验证结果。

### 4.1. 发现 machineid 文件

通过列出 `%APPDATA%\Cursor\` 目录，发现了 `machineid` 纯文本文件：

```log
> Get-Content "$env:APPDATA\Cursor\machineid"
b545779e-f0c2-49a5-b6a1-cdb301cc5a88
```

CCS Config 对话框要求的是"32 位十六进制（无连字符 UUID）"格式，因此需要去掉 `-`：

```log
b545779ef0c249a5b6a1cdb301cc5a88
```

### 4.2. 发现 state.vscdb 数据库

通过列出 `%APPDATA%\Cursor\User\globalStorage\` 目录，发现 `state.vscdb` 文件。该文件是 SQLite 3 格式数据库，包含两张表：

|      表名      |          用途           |
| :------------: | :---------------------: |
|  `ItemTable`   | Cursor 全局状态键值存储 |
| `cursorDiskKV` |   Cursor 磁盘键值缓存   |

### 4.3. 发现 Token 相关 Key

通过查询 `ItemTable` 中包含 `token`、`auth`、`cursor` 关键词的 key，筛选出了认证相关的 key：

|                  Key                  |      说明      |
| :-----------------------------------: | :------------: |
|       `cursorAuth/accessToken`        |  访问令牌 JWT  |
|       `cursorAuth/refreshToken`       |  刷新令牌 JWT  |
|       `cursorAuth/cachedEmail`        |  登录邮箱地址  |
|     `cursorAuth/cachedSignUpType`     |    注册方式    |
|   `cursorAuth/stripeMembershipType`   |    订阅类型    |
| `cursorAuth/stripeSubscriptionStatus` |    订阅状态    |
|        `cursorAuth/googleKey`         | Google API Key |
|        `cursorAuth/openAIKey`         | OpenAI API Key |

### 4.4. 验证读取方案

使用 `better-sqlite3`（全局安装后通过绝对路径引用）成功读取了 `state.vscdb`：

```log
=== Access Token ===
Length: 415
Format: JWT (eyJhbGciOiJIUzI1NiIs...)

=== Machine ID ===
With dashes: b545779e-f0c2-49a5-b6a1-cdb301cc5a88
Without dashes: b545779ef0c249a5b6a1cdb301cc5a88
```

## 5. 风险项

### 5.1. 安全风险

| 风险等级 |            风险项            |                                                        说明与缓解措施                                                         |
| :------: | :--------------------------: | :---------------------------------------------------------------------------------------------------------------------------: |
|    高    |   Access Token 是敏感凭据    | Token 相当于用户的 Cursor 登录凭证。**禁止**将其提交到 Git 仓库、打印到公开日志或分享给他人。建议仅在本地使用，输出后立即复制 |
|    高    |  Token 可被用于冒充用户身份  |               持有 Token 的人可以以该用户身份调用 Cursor API。泄露后应立即在 Cursor 中重新登录以使旧 Token 失效               |
|    中    | state.vscdb 包含多种敏感信息 |               该数据库不仅有 Token，还可能包含 API Key（Google、OpenAI）。代码中应仅读取所需字段，避免全量导出                |

### 5.2. 兼容性风险

| 风险等级 |             风险项              |                                                                               说明与缓解措施                                                                                |
| :------: | :-----------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|    高    |         仅支持 Windows          | `%APPDATA%` 是 Windows 环境变量。macOS 路径为 `~/Library/Application Support/Cursor/`，Linux 路径为 `~/.config/Cursor/`。如需跨平台支持，需要按 `process.platform` 分支处理 |
|    中    | Cursor 版本升级可能变更存储结构 |                                    Cursor 是 VS Code 的 fork，其内部存储结构未形成公开 API 契约。版本升级后 key 名称、数据库结构可能变化                                    |
|    中    |   better-sqlite3 需要原生编译   |                 `better-sqlite3` 是 C++ 原生模块，安装时需要编译环境（Python、C++ build tools）。如遇安装问题，可考虑 `sql.js`（纯 WASM 实现）作为替代方案                  |

### 5.3. 运行时风险

| 风险等级 |             风险项              |                                                            说明与缓解措施                                                            |
| :------: | :-----------------------------: | :----------------------------------------------------------------------------------------------------------------------------------: |
|    中    |          Token 会过期           | JWT 中的 `exp` 字段定义了过期时间。过期后需要用户重新登录 Cursor，或使用 refreshToken 刷新（但刷新逻辑较复杂，不建议在本工具中实现） |
|    中    | Cursor 运行时可能锁定数据库文件 |                                 使用 `readonly: true` 模式打开数据库可避免锁冲突。已在代码方案中采用                                 |
|    低    |      machineid 文件不存在       |                          全新安装且未首次启动的 Cursor 可能没有该文件。代码应做存在性检查并给出明确错误提示                          |

## 6. 替代方案对比

### 6.1. SQLite 驱动选型

|        方案        |           优点           |           缺点           | 推荐度 |
| :----------------: | :----------------------: | :----------------------: | :----: |
|  `better-sqlite3`  | 同步 API、性能极好、轻量 |     需要原生编译环境     |  推荐  |
|      `sql.js`      |   纯 WASM、零编译依赖    | 需要加载整个数据库到内存 |  备选  |
| 系统 `sqlite3` CLI |      无需 npm 依赖       |    Windows 默认不自带    | 不推荐 |

### 6.2. 跨平台路径参考

|  平台   |                  machineid 路径                  |                           state.vscdb 路径                            |
| :-----: | :----------------------------------------------: | :-------------------------------------------------------------------: |
| Windows |           `%APPDATA%\Cursor\machineid`           |           `%APPDATA%\Cursor\User\globalStorage\state.vscdb`           |
|  macOS  | `~/Library/Application Support/Cursor/machineid` | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
|  Linux  |           `~/.config/Cursor/machineid`           |           `~/.config/Cursor/User/globalStorage/state.vscdb`           |

## 7. 后续可扩展方向

1. **输出格式化** — 支持 `--json` 参数，输出 JSON 格式方便脚本集成
2. **剪贴板复制** — 获取后自动复制到系统剪贴板（可用 `clipboardy` 包）
3. **Token 有效性检查** — 解析 JWT 的 `exp` 字段，提示用户 Token 是否已过期
4. **跨平台支持** — 根据 `process.platform` 自动匹配不同系统的文件路径
5. **Watch 模式** — 监听 `state.vscdb` 文件变化，Token 更新后自动输出新值
