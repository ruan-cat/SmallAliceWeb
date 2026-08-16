# 项目上下文

## Purpose

`@ruan-cat/drill-doc`：以 VitePress 为根文档站、pnpm workspace monorepo 组织的技术文档仓库，内含独立 Nitro API（`packages/ai-rag-api`）与 AI 对话组件库（`packages/ai-vue`、`ai-vitepress-plugins`、`ai-vue-doc`）。二期目标为基于 RAG 的动态知识库问答系统（知识源 `docs/docx/**/*.md`），作为简历作品。

## 技术栈

- Vue3 + `vue-element-plus-x`（Bubble/BubbleList/Sender）+ `markstream-vue` + `@ai-sdk/vue`（仅业务使用方）
- 独立 Nitro v3 API（`@ruan-cat-drill-doc/ai-rag-api`）+ zod
- Neon + drizzle + pgvector（`packages/ai-rag-api/drizzle/0000_ai_rag.sql` 已执行）
- RAG：PostgreSQL 词法全文检索 + pgvector 余弦 + RRF 融合（`packages/ai-rag-core`）
- VitePress 文档站 + Nuxt 组件库文档站（`shadcn-docs-nuxt`）

## 项目约定

### 代码风格

- 简体中文注释优先；TypeScript 注释使用 jsdoc 格式；markdown 表格居中对齐、二级/三级标题带数字序号。

### 架构模式

- 通用展示包（ai-vue）不得导入 `@ai-sdk/vue`、不得包含 Nitro 请求逻辑；`@ai-sdk/vue` 仅由业务使用方的 `useKnowledgeChat` 调用。
- 未装配运行时上下文时，chat/search/sync/sync-runs 路由统一返回 `503 RAG_NOT_CONFIGURED`，不得伪造成功。

### 测试策略

- Vitest `describe`/`test` 格式，`*.test.ts`；包内 `tests/` 或 `src/tests/` 目录；验收证据需区分本地/外部（本地构建成功不能证明 Neon、Vercel、模型服务可用）。

### Git 工作流

- 开发在 `dev` 分支；conventional commits 中文前缀（feat/fix/docs/chore/config 等）。

## 领域上下文

- 二期唯一知识源：`docs/docx/**/*.md`（可变上游产物，每次同步按相对路径+内容哈希对账）。
- 来源跳转：确定性 `headingAnchor`（SHA-256 base64url `rag-heading-<digest>`）+ `sourceUrl`（移除 docs/、.md→.html、逐段 encodeURIComponent），不依赖 VitePress 默认 slug。

## 重要约束

- Windows 平台禁止 `neonctl`（已复现 CPU 自旋事故）；Neon 操作统一使用官方 `neon` CLI 且先跑 `pnpm run neon:guard`。
- 禁止 Python/FastAPI、Java/Spring 体系、多向量库混用、一期 MCP 工具网关；OCR/多模态属于三期。
- 未锁版本并完成 API spike 前，禁止接入 `@shikijs/stream` 代码高亮；不得以 `vue-element-plus-x` 的 Typewriter 包裹 Markdown 正文。
- 仓库根 `vercel.json` 已删除；Vercel 双项目配置维护在云端 Project Settings；部署前必须先 `vercel link --project <name> --yes` 切换单槽绑定。
- Windows 下 `pnpm run docs:build` 需 `NODE_OPTIONS=--max-old-space-size=8192` 且串行执行（峰值约 7 GiB）。

## 外部依赖

- Neon：组织 `org-super-fog-48541962`、项目 `patient-cloud-43432277`、Vercel 关联数据库 `neon-smallalice-ai-rag`（项目内实际数据库名 `neondb`）；禁止新建同用途资源。
- Vercel 双项目：`small-alice-web-odse`（文档站）、`smallalice-docs-ai-nitro-api`（Nitro API，生产域名 https://smallalice-docs-ai-nitro-api.ruan-cat.com/）。
- Vercel 三环境需维护 `ENABLE_EXPERIMENTAL_COREPACK=1`（自定义 pnpm install 时）。
- 连接串、密码、token 属敏感信息，禁止写入仓库、报告、测试快照或终端记录。
