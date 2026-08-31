# 二期 AI RAG：观测整理（01）

> 本文档整理自 memorix CLI 完整导出（`00-full-export.md` 的 Observations 部分，21 条观测），**保留全部事实与决策结论，未删减任何内容**。组织形式：按观测类型分组，文末附「观测总索引表」。
>
> 观测编号即 memorix 内部 ID（#5460-#5569）。「实体」是 memorix 存储时归类的主题分组。

## 1. DECISION 决策（7 条）

> **对 ChatGPT 的意义**：这些是已经拍板的技术与业务决策，是二期 RAG 实施时**必须遵守的约束**。不要推翻、不要重新设计；若与任务冲突，先按决策执行再向用户确认。

### 1.1 #5498 用户 AI 转型简历定位与作品方向

- **类型**：DECISION（decision）
- **创建时间**：2026-07-29T15:49:27.093Z

用户转型到 AI 方向的简历定位和作品设计。

自我定位：有 3 年 Vue3 + TypeScript 业务前端经验，正在转向 AI 应用工程化，能独立完成 AI 产品前端、流式交互、RAG 知识库、Agent 工作流平台的前端与部分 Node.js 服务端开发。

作品方向选型设计：

1. AI 知识库问答系统
   - 设计并实现基于 RAG 的企业知识库问答系统
   - 支持文档上传、文本切分、向量检索、上下文组装、流式问答与引用溯源
   - 前端实现 Chat UI、SSE 流式渲染、检索来源高亮、会话状态管理和错误重试机制

2. AI Agent 工作流平台（偏前端可视化）
   - 实现可视化 AI Agent 工作流编辑器
   - 支持 LLM 节点、工具调用节点、条件分支、人工确认节点与执行轨迹回放
   - 使用 TypeScript 建模节点 Schema，通过 Zod 完成运行时参数校验

需要专门突出的个人技术栈：AI 应用工程化

**Files**：`D:/code/ruan-cat/resume/简历/转型到AI方向/index.md`、Node.js

### 1.2 #5499 RAG 项目技术栈选型决策

- **类型**：DECISION（decision）
- **创建时间**：2026-07-29T15:49:29.556Z

二期 RAG 项目的完整技术栈选型决策。

前端层：

- UI 框架：Vue3 + Element Plus X
- 流式传输：@ai-sdk/vue + Nuxt/Nitro
- Markdown 渲染：x-markdown-vue + @shikijs/stream

数据层：

- 数据库：Neon + drizzle + pgvector
- 输入校验：zod
- RAG 框架：LangChain.js / Vercel AI SDK RAG

向量数据库选型：

- 本地学习：Chroma
- 正式项目：Neon + pgvector
- 检索质量为核心：Qdrant
- 边缘部署：Cloudflare Vectorize

推荐：采用「本地 Chroma 学习 → Neon/pgvector 落地」的渐进策略。

Chunk 策略：

- chunk_size: 500 tokens
- overlap: 50 tokens
- separators: ["\n\n", "\n", "。", "！", "？", ". "]

Embedding 配置：

- model: text-embedding-3-small
- dimension: 1536
- batch_size: 100

Hybrid Search：BM25 + 向量并行检索 → RRF 融合（k=60）

**Files**：无

### 1.3 #5500 RAG 学习路径与里程碑规划

- **类型**：DECISION（decision）
- **创建时间**：2026-07-29T15:49:33.286Z

二期 RAG 学习的完整路径与里程碑规划。

学习阶段划分：

第一周：RAG 基础与本地实验

- 理解 Chunk 策略：固定大小 / 语义切分 / overlap
- 跑通 Chroma 本地向量库：add / query / delete
- 生成第一个 embedding：调用 OpenAI/Cohere API
- 最小 RAG demo：文档 → Chunk → Embedding → 检索 → 回答

第二周：检索质量与 Hybrid Search

- BM25 / PostgreSQL full-text search 基础
- Hybrid Search 实现：关键词 + 向量并行检索 → RRF 融合
- ReRank 概念与接入（可选）
- 评估集设计：准备 10-20 个固定问题，对比不同检索效果

第三周：工程落地与产品化

- Neon + drizzle + pgvector 建模与迁移
- Nuxt/Nitro API 实现：文档上传、向量生成、流式问答
- 前端 UI：Element Plus X + 流式 Markdown + 来源高亮
- 输入校验：zod schema

第四周：优化与展示准备

- 检索质量调优：chunk_size / top_k / score threshold
- 性能优化：批量 embedding、缓存策略
- 简历作品文档完善
- 演示视频 / README 编写

里程碑检查点：

- M1：最小 RAG 闭环（本地 demo 截图）
- M2：Hybrid Search（评估结果表）
- M3：完整问答系统（可演示作品）
- M4：简历作品集（GitHub 仓库）

**Files**：无

### 1.4 #5503 Node 与独立 Nitro v3 API 边界

- **类型**：DECISION（decision）
- **创建时间**：2026-07-31T12:14:14.723Z
- **Topic**：ai-transition-phase2 | Rev: 2

二期运行时固定为 Node.js + 独立 Nitro v3 API，不引入 Bun，也不把服务端设计为 Nuxt 项目。Nitro 代码遵循 nitro、server/、nitro/h3 与 nitro/runtime-config 的边界；AI SDK 流式结果直接返回 Web Response。现有 packages/ai-vue 是 mock Chat，应演进为真实对话和 RAG 来源展示的复用组件，不能重新建设一套 Chat UI。

**Facts**：

- Node.js 运行时
- 独立 Nitro v3 API
- 不使用 Bun
- 不使用 Nuxt API
- ai-vue 演进复用

**Files**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`、`packages/ai-vue`、Node.js

### 1.5 #5504 二期 RAG 知识源与动态同步边界

- **类型**：DECISION（decision）
- **创建时间**：2026-07-31T12:14:54.035Z
- **Topic**：ai-transition-phase2-rag-sync

二期 RAG 的唯一知识源是 docs/docx/\*_/_.md。知识库会随上游 DOCX 转换结果动态变化，必须以相对 sourcePath、内容哈希、切分版本和 embedding 模型版本做增量对账，不依赖全量盲重建。Markdown 图片不进入多模态/OCR 流程，只保留图片 URL 作为来源元数据；视觉检索、多模态输入与输出移至第三期。每个 chunk 必存 sourcePath、headingPath、chunkIndex，并保留 headingIndex 与确定性 headingAnchor 以支持定位、更新和引用。

**Facts**：

- docs/docx 是唯一知识源
- 使用增量对账
- 图片仅保留 URL 元数据
- 多模态推迟到第三期

**Files**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`

### 1.6 #5505 Node 与独立 Nitro v3 API 边界（运行时与 API 实体）

- **类型**：DECISION（decision）
- **创建时间**：2026-07-31T12:15:10.142Z
- **Topic**：ai-transition-phase2-runtime

二期运行时固定为 Node.js + 独立 Nitro v3 API，不引入 Bun，也不把服务端设计为 Nuxt 项目。Nitro 代码遵循 nitro、server/、nitro/h3 与 nitro/runtime-config 的边界；AI SDK 流式结果直接返回 Web Response。现有 packages/ai-vue 是 mock Chat，应演进为真实对话和 RAG 来源展示的复用组件，不能重新建设一套 Chat UI。

**Facts**：

- Node.js 运行时
- 独立 Nitro v3 API
- 不使用 Bun
- 不使用 Nuxt API
- ai-vue 演进复用

**Files**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`、`packages/ai-vue`、Node.js

> 注：#5505 与 #5503 结论与事实完全一致，仅 memorix 实体不同（「AI 转型二期任务执行」与「AI 转型二期任务执行：运行时与 API」），属重复记录，保留备查。

### 1.7 #5506 Neon 数据库资源与 pgvector 连接约束

- **类型**：DECISION（decision）
- **创建时间**：2026-07-31T12:15:26.704Z
- **Topic**：ai-transition-phase2-neon

项目 Vercel 已关联 Neon 数据库 neon-smallalice-ai-rag；Neon 组织 ID 为 org-super-fog-48541962，项目 ID 为 patient-cloud-43432277。这些标识符可记录，连接串、密码和 token 不可记录。连接前先用 vercel env pull .env.local --environment=development 获取云端环境变量；CLI 统一使用 neon（用户已安装新版并自行认证），neonctl 只是旧别名，不再出现在后续命令或文档中。首个 migration 执行 CREATE EXTENSION IF NOT EXISTS vector；chunks.embedding 使用 vector(1536)，以 <=> 和 HNSW vector_cosine_ops 做余弦向量检索。API 使用 pooled URL，migration 只使用 non-pooled URL。

**Facts**：

- 数据库 neon-smallalice-ai-rag
- 组织 org-super-fog-48541962
- 项目 patient-cloud-43432277
- CLI 使用 neon
- 启用 pgvector

**Files**：`README.md`、`reports/2026-07-31-ai-rag-phase2-technical-decisions.md`、`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`

## 2. GOTCHA 事故陷阱（4 条）

> **对 ChatGPT 的意义**：这些是二期执行中**真实踩过并已纠正的坑**，可复发性高。遇到同类问题（Windows 命令卡死、Vercel 部署失败、术语误用、权限边界）时先查本组，避免重蹈覆辙。

### 2.1 #5502 全局技能不得承载未授权事故修复

- **类型**：GOTCHA（gotcha）
- **创建时间**：2026-07-31T11:46:09.129Z
- **Topic**：gotcha/global-skill-unauthorized-incident-fix

本次事件的关键教训是区分「诊断/建议」和「获授权的全局实现」。在排查 neonctl Windows 路径循环时，曾把针对卡死一次性 Node CLI 的候选恢复逻辑直接写入全局 cleanup-agent-team-node-processes 技能，并把报告错误写成已升级与已验收。这违反了用户对全局实体文件的明确边界。纠错时已恢复全局技能的 1.2.0 行为，仅将具体升级方案保留在事故报告第 6.3 节，明确其尚未实施。后续遇到相同情况：先将方案写入报告或补丁提案，清楚标记授权状态；只有用户明确授权后，才可修改全局技能；实施后还需独立验证并更新报告口径。

**Facts**：

- 排查 neonctl@2.30.1 时确认，Windows 非系统盘中不存在 .neon 标记目录会触发同步路径上行循环；--help、--version 和空命令均可高 CPU 且无输出。
- 根因不是 Neon API 长连接，而是 CLI 在参数解析前计算 context-file 默认值时的 Windows 根目录终止条件错误。
- 全局 cleanup-agent-team-node-processes 误被直接改为 1.3.0 并加入一次性命令恢复逻辑，随后已回退到 1.2.0；全局技能实体不能在事故处理中被直接修改，除非用户另行明确授权。
- 升级建议必须写入事故报告并标注待评审、未实施；不得用已验证原型或受控实验表述为全局技能已升级或端到端验收完成。
- 若未来获授权实施一次性 CLI 恢复路径，必须保留默认 dry-run，并要求 -Apply、精确 Include/OneShot 命令匹配、输出台账、最小年龄、无监听端口、CPU 二次采样、只停止 Node 子进程和清理后重采样。

**Files**：`D:\store\WorkBuddy\2026-6-30-common\2026-7-31-why-neonctl-not-end\2026-07-31-neonctl-windows-path-loop-incident-report.md`

### 2.2 #5507 二期 RAG 的术语与 Vercel 部署陷阱

- **类型**：GOTCHA（gotcha）
- **创建时间**：2026-07-31T12:15:42.769Z
- **Topic**：ai-transition-phase2-gotchas

二期已纠正的可复发误区：不能把 PostgreSQL tsvector、tsquery 和 ts_rank_cd 称为 BM25；二期检索应表述为「词法全文检索 + pgvector + RRF 融合」。Nitro 错误响应必须用 setResponseStatus 设置真实 HTTP 状态，JSON 中的 code: 500 不能替代 HTTP 状态。Vercel Serverless 不能依赖进程内同步锁，应使用 PostgreSQL advisory lock。Vercel 部署必须确保 docs/docx 被包含在函数可读的部署输入中，不能假设生产环境 process.cwd() 有 Git 工作区；Cron 接口通过 CRON_SECRET 鉴权。

**Facts**：

- PostgreSQL FTS 不是 BM25
- Nitro 设置真实 HTTP 状态
- Vercel 使用 advisory lock
- 部署需包含 docs/docx
- Cron 使用 CRON_SECRET

**Files**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`、`reports/2026-07-31-ai-rag-phase2-technical-decisions.md`

### 2.3 #5508 Windows neonctl 一次性命令 CPU 自旋与官方 neon 替代规范

- **类型**：GOTCHA（gotcha）
- **创建时间**：2026-07-31T14:25:54.580Z
- **Topic**：discovery/windows-neonctl-一次性命令-cpu-自旋与官方-neon-替代规范 | Rev: 3

Windows 上 neonctl@2.30.1 的一次性命令（包括 dist/cli.js --help）可形成 cmd.exe -> node.exe 的无端口 CPU 自旋，不能作为可重试的普通超时。项目不修复或回退到 neonctl，而是严格禁止其进入可执行入口；需操作 Neon 时仅使用用户已安装、认证且明确授权的官方 neon CLI。最终守卫实现为 TypeScript：scripts/guard-neon-cli.ts 使用 std-env 的 isWindows；Windows 扫描可执行配置并阻断 neonctl，非 Windows 平台快速退出。Turbo 将 //#neon:guard 设为根文档构建和类型检查任务的依赖，因此不再以根 package.json 的 && 串联调度。

**Facts**：

- Windows 上禁止直接运行、安装后调用或在脚本/工作流中引入 neonctl。
- 异常 CPU 采样证据：Node PID 22320 在 5 秒内增加 5.66 秒 CPU，累计 7891.41 秒。
- 守卫入口：scripts/guard-neon-cli.ts；执行器为根本地 tsx；平台判断使用 std-env.isWindows。
- Windows 命中 neonctl 时失败；Linux/macOS/Vercel 快速跳过。
- Turbo 任务 //#docs:build:run 与 //#typecheck:run 依赖 //#neon:guard。
- 验证已通过：pnpm run neon:guard、pnpm exec tsx --check scripts/guard-neon-cli.ts、Turbo docs dry-run。
- 真实云端 Neon 验证、迁移、同步与 RAG 集成仍需外部授权和逐项证据，不能因守卫完成而宣称二期 RAG 已完成。

**Files**：`scripts/guard-neon-cli.ts`、`turbo.json`、`package.json`、`CLAUDE.md`、`AGENTS.md`、`.agents/skills/fix-bug/record-bug-fix-memory/SKILL.md`、`.agents/skills/fix-bug/record-bug-fix-memory/2026-07-31-windows-neonctl-cpu-spin.md`、`dist/cli.js`

### 2.4 #5514 Vercel git-push 远程构建 ERR_PNPM_META_FETCH_FAIL

- **类型**：GOTCHA（gotcha）
- **创建时间**：2026-08-07T12:49:07.156Z
- **Topic**：gotcha/vercel-pnpm-meta-fetch

Vercel git-push 触发的远程构建两次均失败，错误码 ERR_PNPM_META_FETCH_FAIL（pnpm 无法拉取包元数据）。云端 Project Settings 已验证正确（Build/Output/Install/Node 全对）。prebuilt 部署正常。可能是 Vercel 构建环境 pnpm 与 npm registry 之间的网络/兼容性问题，或 pnpm-lock.yaml 中的某些包版本在远程环境无法解析。需排查 Vercel Dashboard 构建日志、Status Page 或尝试 corepack enable。

**Facts**：

- 错误码: ERR_PNPM_META_FETCH_FAIL
- 两次 git-push 触发均失败
- 云端 Project Settings 已验证正确
- prebuilt 部署正常
- 可能是 Vercel 构建环境 pnpm 与 npm registry 之间的网络问题

**Files**：`pnpm-lock.yaml`

> 后续进展（见 #5569 与会话）：该问题根因经 Corepack 修复（三环境 ENABLE_EXPERIMENTAL_COREPACK=1），git-push 构建链路已恢复。

## 3. CHANGE 变更（5 条）

> **对 ChatGPT 的意义**：这些是已经完成的关键变更节点（文档产物、部署、体系迁移），记录了「什么变了、改了什么、当前状态」，用于对齐现状与排查历史。

### 3.1 #5461 grill-me 技能已记录到 AGENTS.md

- **类型**：CHANGE（what-changed）
- **创建时间**：2026-07-21T13:28:02.774Z
- **Topic**：skills/grill-me

Matt Pocom Skills 系列核心技能，已添加到 AGENTS.md 技能表。通过追问引导用户思考代码问题，而非直接给出答案。衍生技能包括 grilling、grill-with-docs、domain-modeling、wayfinder、to-spec、ask-matt。

**Files**：`AGENTS.md`

### 3.2 #5495 二期 RAG 设计文档已完成

- **类型**：CHANGE（what-changed）
- **创建时间**：2026-07-29T15:49:19.562Z

2026-07-29 为用户 ruancat 完成二期 AI 化任务设计文档（spec），文件路径：docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md

设计文档核心内容：

1. 技术栈选型：Vue3 + Element Plus X + Nuxt/Nitro + Neon/pgvector + drizzle + zod
2. 向量数据库策略：本地 Chroma 学习 → Neon/pgvector 落地
3. 检索策略：BM25 + 向量 Hybrid Search + ReRank（可选）
4. 学习路径：4 周时间线，每周明确里程碑
5. 验收标准：技术验收 + 简历展示验收 + 学习理解验收

核心模块：文档管理、Embedding 与向量存储、Hybrid Search、ReRank（可选）、问答模块、前端交互

禁止清单：禁止引入 Python/FastAPI、Spring/RabbitMQ、多个向量数据库混用、第一阶段引入 MCP

**Files**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`

### 3.3 #5496 二期 RAG 实施计划文档已完成

- **类型**：CHANGE（what-changed）
- **创建时间**：2026-07-29T15:49:22.239Z

2026-07-29 为用户 ruancat 完成二期 AI 化任务实施计划（plan），文件路径：docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md

计划文档任务拆分（4 周）：

第一周：RAG 基础与本地实验

- 任务 1.1：搭建本地 RAG 开发环境（Chroma + OpenAI）
- 任务 1.2：实现 Chunk 切分策略（固定大小、overlap、separators）
- 任务 1.3：生成第一个 RAG 检索 demo

第二周：检索质量与 Hybrid Search

- 任务 2.1：实现 PostgreSQL Full-Text Search（BM25）
- 任务 2.2：实现 Hybrid Search（RRF 融合）
- 任务 2.3：设计与运行评估集

第三周：工程落地与产品化

- 任务 3.1：搭建 Nuxt/Nitro API 项目
- 任务 3.2：实现前端 Chat UI（Element Plus X）
- 任务 3.3：集成来源高亮与溯源

第四周：优化与展示准备

- 任务 4.1：检索参数调优
- 任务 4.2：完善 README 与演示

每个任务都包含具体的文件结构、代码示例和验证步骤。

**Files**：`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`

### 3.4 #5513 Nitro API 独立 Vercel 部署完成

- **类型**：CHANGE（what-changed）
- **创建时间**：2026-08-07T12:48:59.013Z
- **Topic**：deployment/nitro-vercel

2026-08-07 完成 Nitro API 独立 Vercel 部署。创建 smallalice-docs-ai-nitro-api 项目，补齐云端 Build/Output/Install/Node 配置（REST API PATCH）。删除根 vercel.json（破坏性变更），配置迁移到 small-alice-web-odse 云端 Project Settings。新增 server/plugins/rag.ts 装配插件（六项配置门禁、模块级单例、request 钩子挂载 event.context.rag）。执行 Neon migration 0000*ai_rag.sql（vector 0.8.0、documents/chunks/knowledge_sync_runs 三表、HNSW 余弦索引）。7 个 NITRO*\* 环境变量跨 production/preview/development 三环境接线。生产域名 https://smallalice-docs-ai-nitro-api.vercel.app 已上线。sync-runs GET 200, sync POST 鉴权 401/200 正确。search/chat POST 返回 500（空库/网关运行时问题）。git-push 远程构建两次失败（ERR_PNPM_META_FETCH_FAIL）。

**Facts**：

- Vercel 项目: smallalice-docs-ai-nitro-api
- 生产域名: https://smallalice-docs-ai-nitro-api.vercel.app
- 根 vercel.json 已删除（破坏性变更）
- Neon migration 0000_ai_rag.sql 已执行: vector 0.8.0, 3 表, HNSW 余弦索引
- 7 个 NITRO\_\* 环境变量跨 3 环境接线
- server/plugins/rag.ts 装配插件上线（六项门禁）
- prebuilt 部署成功; git-push 远程构建 ERR_PNPM_META_FETCH_FAIL 失败
- 6 个分类提交已 push 到 dev 分支

**Files**：`packages/ai-rag-api/src/runtime-config.ts`、`packages/ai-rag-api/server/services/openai-chat.ts`、`packages/ai-rag-api/server/plugins/rag.ts`、`packages/ai-rag-api/package.json`、`vercel.json`、`.vercelignore`、`README.md`、`CLAUDE.md`、`AGENTS.md`、`docs/superpowers/specs/2026-08-07-nitro-api-vercel-deploy-design.md`、`server/plugins/rag.ts`、`0000_ai_rag.sql`

### 3.5 #5569 二期 AI RAG 任务体系迁移至 OpenSpec

- **类型**：CHANGE（what-changed）
- **创建时间**：2026-08-16T03:36:24.007Z

二期 AI RAG 长任务于 2026-08-16 从 superpowers 台账（docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md 与 plans/2026-07-29-ai-rag-phase2-plan.md，停更于 08-07）迁移到 OpenSpec change ai-rag-phase2。新体系：tasks.md 是唯一任务源（22 条：6 条已完成基线 [x] + 10 条待办 [ ] + 2 条历史学习 + 4 条里程碑）；design.md 含 17 项技术决策（3.1-3.17）；6 个能力规格（knowledge-sync/hybrid-search/chat-api/chat-ui/source-citation/deployment，33 需求 88 场景）；agent-progress.md 与 agent-findings.md 固定在 change 根目录。旧文件保留并标注「已被取代」。任务真实状态核实：ai-rag-api 15 测试文件 49 用例、ai-rag-core 4/15、ai-vue 4/15、ai-vitepress-plugins 3/8 均通过；sync provider 仍是离线 fake（createSync 硬编码 accepted）；生产 search/chat 500 待真实装配后重验；Corepack 事故已修复（三环境 ENABLE_EXPERIMENTAL_COREPACK=1，git-push 链路恢复）。待办 2.1.1-2.1.3 等待外部授权（数据库操作/embedding 凭据/部署）。

**Facts**：

- 唯一任务源: openspec/changes/ai-rag-phase2/tasks.md
- 6 能力规格 33 需求 88 场景
- 22 条任务: 6 完成基线 + 10 待办 + 2 历史学习 + 4 里程碑
- 旧台账保留并标注取代, 停更于 2026-08-07
- sync provider 为离线 fake, 真实链路待外部授权
- ENABLE_EXPERIMENTAL_COREPACK=1，git-push 链路恢复

**Files**：`openspec/changes/ai-rag-phase2/`、`openspec/project.md`、`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`、`agent-findings.md`、`openspec/changes/ai-rag-phase2/tasks.md`

## 4. DISCOVERY 发现（3 条）

> **对 ChatGPT 的意义**：这些是调研或排查中得到的客观事实（参考资源、命名澄清、工具安装），直接引用即可，无需重新调研。

### 4.1 #5460 安装 Matt Pocom grill-me 系列技能

- **类型**：DISCOVERY（discovery）
- **创建时间**：2026-07-21T13:22:50.475Z
- **Topic**：skills/grill-me-family

2026-07-21 从 mattpocock/skills 仓库安装的 Matt Pocom Skills 系列技能包。这是一组以 grill-me 为核心的技能集合，用于引导式代码审查、追问、澄清和重构指导。技能已安装到 .agents/skills/ 目录，兼容 Claude Code、Codex、Cursor。

**Facts**：

- grill-me — 主技能，引导式代码审查与重构追问
- grilling — 深入追问和澄清的技能
- grill-with-docs — 结合文档的审查技能
- domain-modeling — 领域建模技能
- wayfinder — 路径指引与探索技能
- to-spec — 规格化写作技能
- setup-matt-pocock-skills — 技能安装引导
- ask-matt — Matt 问答助手

**Files**：`.agents/skills/grill-me`、`.agents/skills/grilling`、`.agents/skills/grill-with-docs`、`.agents/skills/domain-modeling`、`.agents/skills/wayfinder`、`.agents/skills/to-spec`、`.agents/skills/setup-matt-pocock-skills`、`.agents/skills/ask-matt`

### 4.2 #5501 RAG 学习参考项目与资料

- **类型**：DISCOVERY（discovery）
- **创建时间**：2026-07-29T15:49:35.094Z

RAG 学习参考项目与资料推荐。

推荐参考项目（学习价值）：

- zhilv-yuntu：RAG 产品化思路，重点模块 retriever.py、vector_db.py
- ai-sdk-rag-starter：技术栈对齐，Drizzle + pgvector + RAG
- agents-from-scratch-ts：Agent 原理，TypeScript 从零理解 Agent

关键文档：

- AI SDK RAG Guide：Vercel AI SDK RAG 完整指南
- LangChain.js PGVectorStore：pgvector 集成
- Neon LangChain：Neon 向量存储接入
- Chroma Getting Started：本地向量库入门

禁止参考项目（干扰项）：

- AgentX：Java/Spring 体系，不适合 TypeScript 主线
- Dify：平台复杂度高，不适合入门学习
- 自研 Agent 平台：过早引入大架构

**Files**：LangChain.js

### 4.3 #5515 Neon 资源命名澄清：neon-smallalice-ai-rag 是项目名，neondb 是数据库名

- **类型**：DISCOVERY（discovery）
- **创建时间**：2026-08-07T12:49:14.018Z
- **Topic**：discovery/neon-resource-naming

Neon 资源命名澄清：AGENTS.md 和 README 中记录的 'Vercel 已关联的 Neon 数据库名称 neon-smallalice-ai-rag' 实际上是 Neon 项目名称（project name），不是数据库名称。通过 Neon MCP describe_branch 确认，项目 patient-cloud-43432277 内的实际数据库名称为 neondb（和 postgres）。Vercel 集成注入的 POSTGRES_URL 等环境变量指向的是 neondb。

**Facts**：

- Neon 项目名: neon-smallalice-ai-rag (patient-cloud-43432277)
- 项目内实际数据库名: neondb
- AGENTS.md/README 中 'Vercel 已关联的 Neon 数据库名称 neon-smallalice-ai-rag' 实际是项目名
- 由 Neon MCP describe_branch 确认

**Files**：无

## 5. INFO 信息（1 条）

> **对 ChatGPT 的意义**：调研型背景信息，帮助理解「为什么主线这样选」。引用结论即可，原文在 Files 指向的外部文档。

### 5.1 #5497 LangGraph TypeScript 入门调研报告核心结论

- **类型**：INFO（how-it-works）
- **创建时间**：2026-07-29T15:49:24.872Z

用户提供的核心参考文档，包含 LangGraph TypeScript 入门调研的完整分析。

关键结论：

1. 推荐主线：Vue3/Element Plus 做对话产品壳，Vercel AI SDK 或 LangChain.js 做模型与流式输出，Neon/Postgres/pgvector 与 drizzle 做持久化和检索，LangGraph.js 做 Agent 状态机

2. 不适合作为主线的项目：
   - zhilv-yuntu：后端是 Python，不是 TypeScript；没有 AI Chat + SSE 主链路
   - AgentX：Java/Spring 体系，不适合 TypeScript 主线

3. 组件选型：
   - Element Plus X：Vue3 + Element Plus 主 UI
   - @ai-sdk/vue：前端状态与流式聊天
   - x-markdown-vue：Markdown 渲染
   - @shikijs/stream：代码块流式高亮

4. 学习路线：
   - 第一阶段（1-2 周）：AI Chat 基础
   - 第二阶段（2-4 周）：RAG 与检索质量
   - 第三阶段（4-6 周）：LangGraph.js Agent
   - 第四阶段：部署与工程化

5. BM25 + 向量混合检索的重要性：
   - 代码文档、报错、API 名称强烈建议做 hybrid search
   - 只做向量检索会漏掉「字符串必须精确命中」的问题

**Files**：`D:/store/WorkBuddy/2026-6-30-common/2026-7-8-learn-use-LangGraph-with-typescript/2026-07-11-langgraph-typescript-entry-research.md`、LangChain.js

## 6. SESSION 会话请求（1 条）

> **对 ChatGPT 的意义**：二期任务的「最初需求」记录——用户是谁、目标是什么、为什么做二期。用于理解任务动机，不应被当作任务清单。

### 6.1 #5494 AI 转型二期任务设计上下文

- **类型**：SESSION（session-request）
- **创建时间**：2026-07-29T15:49:10.223Z

用户 ruancat 正在从传统 Vue3 前端开发者转型到 AI 应用工程方向。目标定位：AI 应用前端、AI Agent 全栈偏前端、TypeScript AI 应用工程师。

核心目标：以拓展简历能力为核心，逐步增加核心 AI 能力。当前处于第二阶段（RAG 与检索质量），需要完成二期 AI 化任务设计。

涉及技术栈关键词：Chatbot、RAG、Agent 平台、SSE 流式输出、LangGraph、pgvector、Qdrant、Vercel AI SDK、LangChain.js、Mastra、Vue Flow、Dify、RAG graph 等。

**Files**：无

## 7. 观测总索引表

| 观测编号 |                 实体                  |   类型    |                                 主题                                  |
| :------: | :-----------------------------------: | :-------: | :-------------------------------------------------------------------: |
|  #5460   |            grill-me-skills            | DISCOVERY |                   安装 Matt Pocom grill-me 系列技能                   |
|  #5461   |               grill-me                |  CHANGE   |                    grill-me 技能已记录到 AGENTS.md                    |
|  #5494   |             ai-rag-phase2             |  SESSION  |                       AI 转型二期任务设计上下文                       |
|  #5495   |         ai-rag-phase2-design          |  CHANGE   |                        二期 RAG 设计文档已完成                        |
|  #5496   |          ai-rag-phase2-plan           |  CHANGE   |                      二期 RAG 实施计划文档已完成                      |
|  #5497   |      langgraph-research-context       |   INFO    |               LangGraph TypeScript 入门调研报告核心结论               |
|  #5498   |          resume-ai-direction          | DECISION  |                    用户 AI 转型简历定位与作品方向                     |
|  #5499   |           ai-rag-tech-stack           | DECISION  |                        RAG 项目技术栈选型决策                         |
|  #5500   |         ai-rag-learning-path          | DECISION  |                       RAG 学习路径与里程碑规划                        |
|  #5501   |       ai-rag-reference-projects       | DISCOVERY |                        RAG 学习参考项目与资料                         |
|  #5502   |   cleanup-agent-team-node-processes   |  GOTCHA   |                    全局技能不得承载未授权事故修复                     |
|  #5503   |          AI 转型二期任务执行          | DECISION  |                     Node 与独立 Nitro v3 API 边界                     |
|  #5504   |   AI 转型二期任务执行：RAG 文档同步   | DECISION  |                     二期 RAG 知识源与动态同步边界                     |
|  #5505   |   AI 转型二期任务执行：运行时与 API   | DECISION  |           Node 与独立 Nitro v3 API 边界（与 #5503 同结论）            |
|  #5506   | AI 转型二期任务执行：Neon 与 pgvector | DECISION  |                  Neon 数据库资源与 pgvector 连接约束                  |
|  #5507   |     AI 转型二期任务执行：工程误区     |  GOTCHA   |                   二期 RAG 的术语与 Vercel 部署陷阱                   |
|  #5508   |       Windows Neon CLI 执行治理       |  GOTCHA   |        Windows neonctl 一次性命令 CPU 自旋与官方 neon 替代规范        |
|  #5513   |       ai-rag-phase2-deployment        |  CHANGE   |                    Nitro API 独立 Vercel 部署完成                     |
|  #5514   |     vercel-git-push-build-failure     |  GOTCHA   |           Vercel git-push 远程构建 ERR_PNPM_META_FETCH_FAIL           |
|  #5515   |         neon-resource-naming          | DISCOVERY | Neon 资源命名澄清：neon-smallalice-ai-rag 是项目名，neondb 是数据库名 |
|  #5569   | phase7-openspec-task-system-migration |  CHANGE   |                  二期 AI RAG 任务体系迁移至 OpenSpec                  |

共 21 条：DECISION 7 / GOTCHA 4 / CHANGE 5 / DISCOVERY 3 / INFO 1 / SESSION 1。

## 附：Files 引用勘误（源自 memorix 原始记录，忠实复制后补充真实路径）

| 观测  |      原记录 Files       |                             仓库真实路径                              |
| :---: | :---------------------: | :-------------------------------------------------------------------: |
| #5508 |      `dist/cli.js`      | 仓库中不存在（memorix 记录时引用的是 neonctl 包内产物，非本仓库文件） |
| #5513 | `server/plugins/rag.ts` |              `packages/ai-rag-api/server/plugins/rag.ts`              |
| #5513 |    `0000_ai_rag.sql`    |             `packages/ai-rag-api/drizzle/0000_ai_rag.sql`             |
