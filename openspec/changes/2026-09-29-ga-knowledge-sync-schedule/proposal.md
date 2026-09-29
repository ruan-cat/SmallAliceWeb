# 变更提案：knowledge-sync GA 调度触发路径规格修订（SY-0）

## 1. Why

> **⚠️ 2026-09-30 00:36 状态更新：用户决策知识源分发选方案 C（本地 CLI 为主、手动低频更新），GA 调度路线正式搁置。** 本变更包的 SY-1（workflow 文件）已合入但当前空转（CI 无知识源），SY-3 4.3 次日 schedule 核对失去实际意义（由 automation 代执行记录）。本变更包规格保留为知识源分发方案落地后的重启蓝本。

本变更是 learn-agents-ui 计划第十八章 SY 组任务（SY-1..SY-3）的**规格前置**（openspec 纪律：knowledge-sync spec 修订先行合入，才允许合入 workflow 文件）：

1. **GA 触发路径缺位**：现状 Requirement 5 只定义了 CLI 一次性命令、`POST /v1/knowledge/sync` 与「Vercel Cron 调用」三种触发方式，而 2026-08-07 拍板「不配置 Cron」否决的是 **Vercel Cron**（vercel.json 配置污染 + 套餐限制）；知识库同步的实际调度责任（push 增量 + 每日兜底 + 手动首跑）需要由 GitHub Actions workflow 承接（spec 11.9 / plan 18.2），该行为 MUST 先在 spec 固化。
2. **表述校准**：Requirement 5 现行「供 Vercel Cron 调用」的表述会让后续 agent 误以为 Vercel Cron 仍是活跃触发方式；需校准为「HTTP Cron 风格端点保留，但不在 Vercel 侧配置 Cron，调度由 GitHub Actions 承担」。
3. **Secrets 前提固化**：GA runner 依赖 8 类 `NITRO_` 前缀环境变量与 non-pooled `NITRO_SYNC_DATABASE_URL` 连接串（advisory lock 正确性要求），属于触发路径成立的前置契约，必须随行为一并入 spec。

本变更包**只修订规格与任务清单，不改任何代码**。

## 2. What Changes

### 2.1 Requirement 5（同步触发与鉴权）修订要点

- 触发方式枚举由「一次性命令、POST 与 Cron」校准为「一次性命令、POST、HTTP Cron 风格 GET 与 GitHub Actions workflow」四种，全部 MUST 复用同一同步服务（切分、哈希与删除语义不变）。
- 「Vercel Cron 触发」场景更名为「HTTP Cron 风格触发」，保留 `Authorization: Bearer $CRON_SECRET` 鉴权契约不变；显式声明**不在 Vercel 侧配置 Cron**（vercel.json 已删除且 MUST NOT 重建，2026-08-07 决策），定时与事件调度由 GitHub Actions 承担（Requirement 8）。
- 并发纪律既有条款（advisory lock + non-pooled `NITRO_SYNC_DATABASE_URL`）保持不变。

### 2.2 新增 Requirement 8：GitHub Actions 调度触发路径

- **双触发 + 手动**：workflow MUST 支持 push main（`paths: docs/**`，增量同步）、schedule 每日兜底（UTC 低峰时刻）与 `workflow_dispatch` 手动触发三种进入方式。
- **管线复用**：GA job MUST 复用现有 `rag:sync` 一次性命令管线（先构建 `ai-rag-core`，再执行同步脚本），MUST NOT 为 GA 路径新增第二套同步实现，MUST NOT 修改同步管线代码。
- **Secrets 前提**：workflow 所需 8 类 `NITRO_` 前缀环境变量 MUST 全部经 GitHub Actions Secrets 注入（清单见探索笔记 E 核查表）；其中 `NITRO_SYNC_DATABASE_URL` MUST 为 non-pooled 直连串——pooled URL 会使 advisory lock 失效，属于配置错误；`NITRO_KNOWLEDGE_SYNC_TOKEN` 与 `NITRO_CRON_SECRET` 为门禁变量（CLI 不消费但装配门禁要求非空）。
- **并发纪律**：workflow MUST 配置 `concurrency` 组（`cancel-in-progress: false`），与 Requirement 5 的 advisory lock 共同兜底「同步不可并发」。
- **凭据纪律**：Secrets 值 MUST NOT 出现在 workflow 日志、代码、文档与本仓库任何文件。
- **部署边界**：GA 路径 MUST NOT 触碰 `vercel.json`（该文件已删除且禁止重建），MUST NOT 与 Vercel 部署链路产生耦合。

## 3. Capabilities

### Modified Capabilities

- `ai-rag/knowledge-sync`：Requirement 5（同步触发与鉴权）修订——触发方式枚举扩展 + Vercel Cron 表述校准。

### New Capabilities

- 无新 capability；Requirement 8 归入 `ai-rag/knowledge-sync`（ADDED）。

## 4. Impact

- **本变更包交付物**：delta spec（`specs/ai-rag/knowledge-sync/spec.md`）与任务清单（`tasks.md`），不修改主规格、不改任何代码。
- **后续任务影响面**（SY-1..SY-3，见 tasks.md）：
  - `.github/workflows/rag-sync-schedule.yaml`：唯一新增文件（SY-1）。
  - GitHub 仓库 Settings → Secrets and variables → Actions：8 类 Secrets 配置（SY-2）。
  - workflow_dispatch 首跑 + 增量验证 + 次日 schedule 核对（SY-3）。
  - `packages/*`：零代码改动——管线全复用现有 `rag:sync` 脚本。
- **契约兼容性**：同步服务行为零变化（Requirement 1..7 不动）；`GET /v1/knowledge/sync` 鉴权契约零变化；GA 为纯外部调度层。
- **风险与回滚**：workflow 合入后若同步失败，不影响线上检索（旧 chunks 仍在）；删除 workflow 文件即完全回滚，无数据迁移负担。
