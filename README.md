# 你好

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ruan-cat/SmallAliceWeb)

你好，这是钻头文档。

## 1. 错误占位图片

![2025-04-11-16-41-34](https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-04-11-16-41-34.png)

## 2. AI RAG 的 Neon 资源标识

二期 AI RAG 复用本仓库关联 Vercel 项目中的既有 Neon 资源，不创建同用途的第二套云数据库。

- Neon 组织 ID：`org-super-fog-48541962`
- Neon 项目 ID：`patient-cloud-43432277`
- Vercel 已关联的 Neon 数据库名称：`neon-smallalice-ai-rag`

数据库连接前，先从 Vercel 拉取当前环境变量；连接串和其他凭据不得提交到仓库。所有 Neon CLI 操作统一使用 `neon`，其安装与认证由用户完成。

## 3. 二期 AI RAG Chat 技术选型

- 聊天 UI 唯一采用 `vue-element-plus-x`，直接使用 `Bubble`、`BubbleList` 和 `Sender`；不得重复实现同职责的消息气泡、输入框或停止按钮。
- 流式 Markdown 唯一采用 `markstream-vue`，负责不完整 AI 输出、表格、代码块和安全 HTML 策略；不得手写 Markdown parser。
- `@shikijs/stream` 只用于生成中的代码块高亮。必须在完成 `markstream-vue` 集成并锁定版本后，以真实 API spike 和测试确认，当前不能声称已经集成。
- 业务使用方通过 `useKnowledgeChat` 中的 `@ai-sdk/vue` 管理 transport、会话状态与 abort；该依赖不得进入通用展示包 `ai-vue`。
- AI Elements Vue 是 Tailwind/shadcn 栈的替代方案，当前 Element Plus X 栈不得混用。
- `ai-vue` 仅负责 DTO 到第三方 props 的薄适配、`sourceHref` 和 mock 文档演示，不耦合 Nitro、检索或模型服务。

`ai-vue` 已接入 `vue-element-plus-x@1.3.98` 的 `BubbleList`、其内部 `Bubble` 渲染和 `Sender`，并接入 `markstream-vue@1.0.8` 渲染助手消息。`@ai-sdk/vue` 与 `@shikijs/stream` 仍未安装或接入。本地文档不表示 Neon、Vercel、数据库或模型服务已经完成云端验收。

## vercel 项目名称

- 核心 vitepress 文档项目： small-alice-web-odse
- rag nitro 接口项目： smallalice-docs-ai-nitro-api

## 4. Vercel 双项目部署架构

本仓库同时绑定两个 Vercel 项目，采用统一的**仓库根安装 + 产物搬运**模式（`use-vercel-deploy-in-monorepo` 技能的形态 1 模式 A）。

|          Vercel 项目           |       用途       | Root Directory | Framework |                          Build Command                          |    Output Directory    | Install Command | Node |
| :----------------------------: | :--------------: | :------------: | :-------: | :-------------------------------------------------------------: | :--------------------: | :-------------: | :--: |
|     `small-alice-web-odse`     | VitePress 文档站 |      `.`       |   Other   |                        `pnpm run build`                         | `docs/.vitepress/dist` | `pnpm install`  | 22.x |
| `smallalice-docs-ai-nitro-api` |  Nitro API 接口  |      `.`       |   Other   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |    `.vercel/output`    | `pnpm install`  | 22.x |

### 4.1 破坏性变更记录：删除根 `vercel.json`

仓库根 `vercel.json` 已于 2026-08-07 删除（备份在 QoderWork 工作区）。原因：`vercel.json` 会覆盖云端 Project Settings，在同一仓库绑定多个 Vercel 项目时会造成跨项目配置污染。原 `vercel.json` 中的文档站配置已迁移到 `small-alice-web-odse` 的云端 Project Settings，两者值完全一致。

### 4.2 CLI 单槽绑定纪律

`.vercel/project.json` 是单槽绑定。部署任一项目前必须先 `vercel link --project <name> --yes` 切换到目标项目，再执行 `vercel deploy`。禁止在未确认绑定状态时直接部署。

### 4.3 Nitro API 生产域名

- 生产：`https://smallalice-docs-ai-nitro-api.ruan-cat.com/`
- Vercel 默认地址（不使用）：`https://smallalice-docs-ai-nitro-api.vercel.app`
- 路由前缀：`/v1/chat`、`/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs`

### 4.4 Nitro RAG 环境变量

二期 RAG 的 Cloudflare embedding 运行时会读取以下环境变量：

- `NITRO_CLOUDFLARE_ACCOUNT_ID`：`3412269ab0def154c8806e38acd1b493`
- `NITRO_EMBEDDING_MODEL`：`@cf/baai/bge-m3`
- `NITRO_CLOUDFLARE_API_TOKEN`：Cloudflare Workers AI 专用 API token，必须保密；Vercel 的 Production / Preview 使用 Sensitive，Development 受平台限制只能用 Non-sensitive

其中 `ACCOUNT_ID` 可以公开写入文档，`API_TOKEN` 不能提交到仓库。你贴出的 R2/S3 兼容密钥属于另一组云存储凭证，不参与 embedding 接入，也不应写入 README。
