<!-- 已完成 -->

# 2026-08-07 独立 Nitro 接口服务 Vercel 部署设计（v2）

> 本文档为 v2 最终版，覆盖并否决 v1 中「保留根 vercel.json + 子包 Root Directory」方案。v1 的 Root Directory 设计已被删除，取而代之的是「删除根 vercel.json + 两项目统一采用模式 A」的破坏性变更。

## 1. 任务背景与目标

本仓库 `ruan-cat/SmallAliceWeb` 是 pnpm monorepo，仓库根内容是基于 VitePress 的钻头文档库，已拥有对应 Vercel 项目 `small-alice-web-odse`（`prj_vdrAvRthiSjkhotfPTXFSV5e1KQW`），由仓库根 `vercel.json` 承载其部署参数。

二期 AI RAG 的服务端是独立 Nitro v3 接口包 `packages/ai-rag-api`（包名 `@ruan-cat-drill-doc/ai-rag-api`）。本任务的目标是把它部署为**新建 Vercel 项目** `smallalice-docs-ai-nitro-api`，并完成生产环境接线、migration 与 API 冒烟验证。

**本任务是纯部署任务，不涉及上一个任务的 A0-A5 授权框架。**

任务目标拆解如下：

1. 新建 Vercel 项目 `smallalice-docs-ai-nitro-api`，完成 `packages/ai-rag-api` 的生产部署。
2. **删除根 `vercel.json`**（破坏性变更），将其配置迁移到 docs 项目云端 Project Settings。
3. 完成云端环境变量接线与数据库 migration。
4. 对生产环境接口做冒烟测试，取得可复核的响应证据。

## 2. 现状侦察结论

以下结论均经过文件与命令核实，作为方案设计的输入。

|       项目        |                                                                                                   现状                                                                                                   |                                证据                                 |
| :---------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------: |
|    文档库项目     |                                            `small-alice-web-odse`，`prj_vdrAvRthiSjkhotfPTXFSV5e1KQW`，Node 22.x，最新部署 READY，域名含 `drill.ruan-cat.com`                                            |                    Vercel MCP `get_project` 返回                    |
| 根 `vercel.json`  | `framework: null`、`buildCommand: pnpm run build`、`outputDirectory: docs/.vitepress/dist`、`installCommand: pnpm install`、`devCommand: pnpm run docs:dev`、`git.deploymentEnabled: true`，服务于文档库 |                        根 `vercel.json` 原文                        |
|   新 Nitro 项目   |                                                                      团队项目列表中不存在 `smallalice-docs-ai-nitro-api`，需要新建                                                                       |                   Vercel MCP `list_projects` 返回                   |
|     构建脚本      |                                             `packages/ai-rag-api` 已有 `build:vercel`：先构建 workspace 依赖 `ai-rag-core`，再 `nitro build --preset vercel`                                             |                 `packages/ai-rag-api/package.json`                  |
|     装配缺口      |   `createRagRuntimeContext` 仅有定义（`server/runtime/rag-assembly.ts:135`），全仓库无调用点，无 Nitro plugin 挂载 `event.context.rag`；按现有测试合同，未装配时全部路由返回 `503 RAG_NOT_CONFIGURED`    |               全仓库检索仅 1 处命中（v1 侦察时确认）                |
|     过期产物      |                        现存 `.vercel/output` 是 2026-07-31 的零路由构建（早于 `server/routes` 落盘），且存在错误嵌套目录 `packages/ai-rag-api/packages/ai-rag-api/.vercel/output`                        |              产物内 `nitro.json` 时间戳与路由清单为空               |
|     环境变量      |          运行时期望 `NITRO_DATABASE_URL`、`NITRO_OPENAI_API_KEY`、`NITRO_CHAT_MODEL`、`NITRO_EMBEDDING_MODEL`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET`；仓库内不存在任何 `.env*` 文件          |                `src/runtime-config.ts` 与全仓库检索                 |
|      数据库       |                     Neon 资源固定为 `org-super-fog-48541962` / `patient-cloud-43432277` / 数据库 `neon-smallalice-ai-rag`；尚未执行过 migration（`drizzle/0000_ai_rag.sql` 未上云）                      | README 与 `reports/2026-07-31-ai-rag-phase2-technical-decisions.md` |
|      工具链       |                                      Vercel CLI 58.7.1 已登录（`ruan-cat`），Node v22.23.1，`pnpm-workspace.yaml` 覆盖 `packages/*`，`.gitignore` 已忽略 `.vercel`                                       |                            本机命令核实                             |
| docs 部署工具绑定 |                  `vercel-deploy-tool.config.ts` 绑定 `small-alice-web-odse`（`prj_vdrAvRthiSjkhotfPTXFSV5e1KQW`），部署目标为 `docs/.vitepress/dist`，构建命令 `pnpm -C=./ docs:build`                   |                   `vercel-deploy-tool.config.ts`                    |
|        Git        |                                                                              当前分支 `dev`，远端 `ruan-cat/SmallAliceWeb`                                                                               |                            `git status`                             |

## 3. 核心决策——破坏性变更：删除根 vercel.json

### 3.1 决策内容

**删除仓库根 `vercel.json`**。此决策已由用户明确批准。

### 3.2 决策原因

Vercel 的机制是：仓库根的 `vercel.json` 会**覆盖**云端 Project Settings 中同名字段（`buildCommand`、`outputDirectory`、`installCommand`、`framework`）。同一仓库内存在两个 Vercel 项目时：

- **docs 文档库项目** `small-alice-web-odse`：需要 `buildCommand: pnpm run build`、`outputDirectory: docs/.vitepress/dist`。
- **nitro API 项目** `smallalice-docs-ai-nitro-api`：需要 `buildCommand: pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel`、`outputDirectory: .vercel/output`。

两个项目的构建参数完全不同，无法共享一份写死的根 `vercel.json`。若保留根 `vercel.json`，则以其所在目录为 Project Root 的所有 Vercel 项目都会被强制覆盖为 docs 参数，导致 nitro 项目构建失败——这正是跨项目配置污染事故。

### 3.3 原始配置值记录

被删除的根 `vercel.json` 原始内容如下，用于迁移对账：

```json
{
	"framework": null,
	"buildCommand": "pnpm run build",
	"installCommand": "pnpm install",
	"outputDirectory": "docs/.vitepress/dist",
	"devCommand": "pnpm run docs:dev",
	"git": {
		"deploymentEnabled": true
	}
}
```

### 3.4 配置迁移方案

将根 `vercel.json` 的全部有效配置迁移到 docs 项目 `small-alice-web-odse` 的**云端 Project Settings**：

|         字段          |         迁移值         |                                                                                                              说明                                                                                                               |
| :-------------------: | :--------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|     buildCommand      |    `pnpm run build`    | 注意 docs 构建链含 `build:doc-in-vercel`（docx→md 转换发生在 Vercel 构建环境内），经由 turbo 任务链 `//#docs:build:run` → `//#build:doc-in-vercel` + `^build` → `vitepress build docs` 完整执行，不能简化成裸 `vitepress build` |
|    installCommand     |     `pnpm install`     |                                                                                                      与根 vercel.json 一致                                                                                                      |
|    outputDirectory    | `docs/.vitepress/dist` |                                                                                                      与根 vercel.json 一致                                                                                                      |
|       framework       |         Other          |                                                                                       对应原始 `framework: null`，VitePress 归类为 Other                                                                                        |
|      devCommand       |  `pnpm run docs:dev`   |                                                                                                    仅本地开发使用，可选迁移                                                                                                     |
| git.deploymentEnabled |         `true`         |                                                                                                   保持推送自动部署，可选迁移                                                                                                    |

## 4. 部署形态：统一模式 A

### 4.1 形态判定

本仓库根存在 `pnpm-workspace.yaml`，属于 monorepo 子包部署形态。`packages/ai-rag-api` 依赖 `workspace:*` 的 `ai-rag-core`，云端安装必须在 workspace 根解析。

### 4.2 两个项目统一采用模式 A

模式 A 的定义：**仓库根安装 + 产物搬运到仓库根**。即 Vercel 项目的 Root Directory 留空（指向仓库根），Install Command 在仓库根执行 `pnpm install`，Build Command 在仓库根通过 `--filter` 触发子包构建，Output Directory 指向仓库根的 `.vercel/output`。

删除根 `vercel.json` 后，模式 A 的最大障碍（根 vercel.json 覆盖云端 Settings）已被移除，两个项目均可安全使用模式 A。

### 4.3 docs 文档库项目配置（云端 Project Settings）

|       字段       |         期望值         |         说明         |
| :--------------: | :--------------------: | :------------------: |
|     项目名称     | `small-alice-web-odse` |       既有项目       |
|  Root Directory  |          留空          |      指向仓库根      |
| Framework Preset |         Other          | VitePress 归类 Other |
|  Build Command   |    `pnpm run build`    |   turbo 链完整执行   |
| Output Directory | `docs/.vitepress/dist` |  VitePress 产物路径  |
| Install Command  |     `pnpm install`     |      仓库根安装      |
| Node.js Version  |          22.x          |    与既有配置一致    |

### 4.4 nitro API 项目配置（云端 Project Settings）

|       字段       |                             期望值                              |                       说明                        |
| :--------------: | :-------------------------------------------------------------: | :-----------------------------------------------: |
|     项目名称     |                 `smallalice-docs-ai-nitro-api`                  |                     用户指定                      |
|  Root Directory  |                              留空                               |                    指向仓库根                     |
| Framework Preset |                              Other                              |         Nitro 归类为 Other + 显式构建命令         |
|  Build Command   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |              在仓库根触发子包构建链               |
| Output Directory |                        `.vercel/output`                         |              仓库根的 .vercel/output              |
| Install Command  |                         `pnpm install`                          |                    仓库根安装                     |
| Node.js Version  |                              22.x                               | 与根 engines `>=22.14.0` 及产物 `nodejs22.x` 一致 |
|     Git 连接     |            `ruan-cat/SmallAliceWeb`，生产分支 `main`            |    首次部署完成后再连接，保障后续推送自动部署     |

### 4.5 build:vercel 脚本链

nitro 项目的 `build:vercel` 脚本执行链如下（按顺序）：

1. **构建 ai-rag-core**：`pnpm --filter @ruan-cat-drill-doc/ai-rag-core build`，确保 workspace 依赖已编译。
2. **Nitro 构建**：`nitro build --preset vercel`，在子包内生成 `.vercel/output`。
3. **产物搬运**：`move-vercel-output-to-root`，将子包内的 `.vercel/output` 搬运到 monorepo 根的 `.vercel/output`。

`move-vercel-output-to-root` 是 `@ruan-cat/utils`（`^4.24.0`）提供的 bin 工具。其核心行为：

- 以子包目录为 cwd。
- 清理仓库根已有的 `.vercel/output`（防止旧产物残留）。
- 将子包内 `.vercel/output` 完整复制到 monorepo 根的 `.vercel/output`。
- 支持 `--dry-run`（仅打印不执行）、`--skip-clean`（跳过清理）、`--root-dir`（自定义根目录）等参数。

**依赖变更**：需要在 `packages/ai-rag-api/package.json` 的 `devDependencies` 中加入 `@ruan-cat/utils: ^4.24.0`，并将 `build:vercel` 脚本更新为包含 `move-vercel-output-to-root` 的完整链。

## 5. Vercel CLI 单槽绑定约束

### 5.1 约束描述

`.vercel/project.json` 是**单槽位**文件：每个目录只能绑定一个 Vercel 项目。monorepo 多项目场景下，仓库根目录的 `.vercel/project.json` 只能指向一个项目。

### 5.2 切换纪律

每次使用 Vercel CLI 部署前，**必须先执行 `vercel link` 切换到目标项目**，再执行 `vercel deploy`。具体流程：

1. 部署 docs 项目前：在仓库根执行 `vercel link`，选择 `small-alice-web-odse`。
2. 部署 nitro API 项目前：在仓库根执行 `vercel link`，选择 `smallalice-docs-ai-nitro-api`。
3. 部署完成后，`.vercel/project.json` 的内容会指向最后 link 的项目。

**禁止假设 `.vercel/project.json` 当前指向哪个项目。** 每次部署前必须显式 link。此文件已被 `.gitignore` 忽略，不会进入版本控制。

## 6. 代码改动（已实施）

以下改动已实施完毕，测试 49/49 通过、typecheck 退出码 0。

### 6.1 src/runtime-config.ts 新增 baseUrl 字段

在 `RagNitroConfig` 类型与 `ragNitroConfig` 默认值中新增 `baseUrl: string` 字段。环境变量映射为 `NITRO_BASE_URL`，用于指定 OpenAI 兼容 API 的基础 URL（非 OpenAI 官方端点时需要）。

### 6.2 server/services/openai-chat.ts 条件传递 baseURL

当 `config.baseUrl` 非空时，向 `createOpenAI` 传递 `baseURL` 参数；为空时不传，保持 SDK 默认行为（指向 OpenAI 官方 API）。写法为展开条件对象：

```ts
const provider = createOpenAI({
	apiKey: config.openaiApiKey,
	...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
});
```

此改动同时应用于 `server/plugins/rag.ts` 内的 embedding provider 创建逻辑。

### 6.3 新建 server/plugins/rag.ts 运行时装配插件

此插件解决 v1 侦察中发现的「装配缺口」——`createRagRuntimeContext` 有定义但无调用点、无 Nitro plugin 挂载 `event.context.rag` 的问题。

**插件设计要点：**

1. **六项私有配置门禁**：`databaseUrl`、`openaiApiKey`、`chatModel`、`embeddingModel`、`knowledgeSyncToken`、`cronSecret`。任一为空字符串时不挂载运行时，并保持 `503 RAG_NOT_CONFIGURED` 契约（此行为已被既有测试覆盖）。

2. **模块级单例惰性初始化**：`ragContext` 和 `initializationAttempted` 为模块级变量。首次请求到达时触发 `tryInitialize()`，后续请求复用已初始化的上下文。初始化仅尝试一次，失败后不再重试（避免每个请求都触发昂贵的初始化逻辑）。

3. **request 钩子挂载**：通过 `nitro.hooks.hook("request", ...)` 在每个请求的 `event.context.rag` 上挂载已初始化的 `RagRuntimeContext`。配置不完整或初始化失败时不挂载，路由层按既有合同返回 503。

4. **createSync 为最小 stub**：当前 `createSync` 工厂返回的 `sync` 方法仅返回 `{ accepted: true, dryRun }`，`syncRuns` 方法返回空数组。这是已知边界——真实增量同步由二期后续任务推进，本任务如实标注此局限，不在部署基础设施中假装完整实现。

## 7. 云端环境变量

以下为 nitro API 项目需要配置的全部环境变量。**只记录变量名与用途，不记录敏感值。**

|            变量名            |                            用途                             |                               来源说明                               |
| :--------------------------: | :---------------------------------------------------------: | :------------------------------------------------------------------: |
|     `NITRO_DATABASE_URL`     |      Neon PostgreSQL pooled 连接串，供运行时 SQL 查询       | 来自 docs 项目既有 Vercel 集成（Neon 项目 `patient-cloud-43432277`） |
|       `NITRO_BASE_URL`       | OpenAI 兼容 API 的基础 URL，值为 `https://api.code-tab.com` |                         用户提供的自定义端点                         |
|    `NITRO_OPENAI_API_KEY`    |                    OpenAI 兼容 API 密钥                     |                 用户提供的自定义 key，不得写入文档值                 |
|      `NITRO_CHAT_MODEL`      |                       聊天模型标识符                        |                               用户指定                               |
|   `NITRO_EMBEDDING_MODEL`    |                      向量化模型标识符                       |                               用户指定                               |
| `NITRO_KNOWLEDGE_SYNC_TOKEN` |                 知识同步端点的 Bearer Token                 |                               用户指定                               |
|     `NITRO_CRON_SECRET`      |                    Cron 触发器的验证密钥                    |                               用户指定                               |

### 7.1 Neon 固定资源约束

- Neon 组织 ID：`org-super-fog-48541962`
- Neon 项目 ID：`patient-cloud-43432277`
- 数据库名称：`neon-smallalice-ai-rag`

**禁止事项：**

- 禁止使用 `neonctl`（Windows 平台已确认可导致 Node CPU 自旋）。
- 禁止因示例名称或资源查询不完整而创建第二个同用途 Neon project 或 database。
- migration 必须使用**非 pooled URL** 执行 `drizzle/0000_ai_rag.sql`。
- 数据库连接串、密码和 token 仍属敏感信息，禁止写入仓库文件、终端记录与报告。

## 8. 安全执行顺序

以下步骤必须严格按序执行，每一步绑定验证点。

| 步骤 |                             动作                             |                        验证点                         |
| :--: | :----------------------------------------------------------: | :---------------------------------------------------: |
|  1   |     在 docs 项目云端 Project Settings 中设置全部迁移配置     | 通过 Vercel Dashboard 或 MCP `get_project` 确认字段值 |
|  2   |                     验证云端设置已持久化                     |         刷新后重新读取，确认值未丢失或被覆盖          |
|  3   |        备份根 `vercel.json`（复制到回收站或临时目录）        |                备份文件存在且内容完整                 |
|  4   |                将根 `vercel.json` 移入回收站                 |           仓库根不再存在 `vercel.json` 文件           |
|  5   | 部署 docs 项目一次（`vercel link` → `vercel deploy --prod`） |    部署状态 READY，`drill.ruan-cat.com` 正常可访问    |
|  6   | 创建 nitro API 新项目 `smallalice-docs-ai-nitro-api` 并部署  |             部署状态 READY，返回生产 URL              |
|  7   |                     接线全部云端环境变量                     |     变量名清单可核对，秘密值不落终端、仓库与报告      |
|  8   |       使用非 pooled URL 执行 `drizzle/0000_ai_rag.sql`       |             migration 执行成功，表已创建              |
|  9   |                         生产冒烟测试                         |     每条测试记录状态码与响应体摘要（见第 10 节）      |

**关键约束**：步骤 5（docs 对等部署）必须在步骤 4（删除 vercel.json）之后立即执行。若 docs 对等部署失败，应立即恢复根 `vercel.json` 并排查，不得继续后续步骤。

## 9. 风险与已知边界

|          风险/已知边界           |                                                                                     说明                                                                                      |                                         处理                                         |
| :------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
|  docs/docx 知识源在部署后不可读  | 模式 A 下 Root Directory 虽指向仓库根，但 Vercel Serverless Function 的运行时工作目录仅包含构建产物；`docs/docx` 目录的源文件不在部署包内，知识同步端点在云端拿不到知识源文件 |    属知识同步任务的部署输入设计问题，本任务记录为已知边界，不在部署基础设施中解决    |
|        Vercel Cron 未配置        |                                    定时知识同步需要 `vercel.json` 的 `crons` 字段配置，但本设计已删除根 vercel.json，且受 Vercel 套餐限制                                     |          本任务不配置 Cron；同步可由携带 Bearer token 的 POST 请求手动触发           |
|       HNSW 召回质量未验证        |                                                           向量检索的召回精度与排序质量属于数据与模型层面的调优工作                                                            |                                不属于本次部署验证范围                                |
| vercel.json 删除后 docs 项目风险 |                                             docs 项目仅靠云端 Project Settings 承载构建配置，若云端设置被误改或丢失会导致构建失败                                             | 必须先设置云端 Settings 并验证持久化后，再删除 vercel.json，并立即做一次对等部署验证 |
|      createSync 为最小 stub      |                                `POST /v1/knowledge/sync` 当前仅返回 `accepted: true` 与 `dryRun` 标志及空 `syncRuns` 数组，不执行真实增量同步                                 |                             如实标注，由二期后续任务推进                             |
|  .vercel/project.json 单槽绑定   |                                         仓库根的 `.vercel/project.json` 只能指向一个项目，多项目部署需要每次部署前显式 `vercel link`                                          |                               已在第 5 节写明切换纪律                                |

## 10. 验收标准

### 10.1 生产冒烟测试状态码证据表

|       测试项       | 方法 |           路径            | 期望状态码 |             说明             |
| :----------------: | :--: | :-----------------------: | :--------: | :--------------------------: |
|    聊天流式响应    | POST |        `/v1/chat`         |    200     |    流式 data-stream 响应     |
|      向量检索      | POST |       `/v1/search`        |    200     |       返回检索结果数组       |
|  同步运行记录查询  | GET  | `/v1/knowledge/sync-runs` |    200     |      返回空数组（stub）      |
| 知识同步（未授权） | POST |   `/v1/knowledge/sync`    |    401     | 缺少 Bearer token 时拒绝访问 |

### 10.2 docs 项目对等部署成功证据

- docs 项目 `small-alice-web-odse` 在根 `vercel.json` 删除后，通过云端 Project Settings 成功完成一次生产部署。
- 部署状态为 READY，`drill.ruan-cat.com` 域名正常可访问。
- 此证据用于验证「删除根 vercel.json + 云端 Settings 迁移」方案的可行性。

### 10.3 安全与合规

- 全部秘密仅存在于 Vercel 项目环境变量与本机 gitignore 文件，不出现于仓库文件、终端记录与报告。
- Neon 资源未重复创建，未使用 `neonctl`。
- 根 `vercel.json` 已备份后删除，非永久丢失。
