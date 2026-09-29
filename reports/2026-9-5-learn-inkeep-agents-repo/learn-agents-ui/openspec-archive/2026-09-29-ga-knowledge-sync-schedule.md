# openspec 变更包归档：2026-09-29-ga-knowledge-sync-schedule

> **⚠️ 2026-09-30 迁移说明（用户决策）**：本内容原为 openspec 任务工件 `openspec/changes/2026-09-29-ga-knowledge-sync-schedule/`（创建于 fbb80b5），现按用户决策从 openspec 体系清退——learn-agents-ui 任务的进度记录**统一以本目录的 plan.md 与 spec.md 为唯一载体**。以下为原工件全文归档（proposal + tasks + delta spec，内容零删改）；其中 delta spec 的 Requirement 5 修订与 Requirement 8（GA 调度触发路径）为 knowledge-sync spec 对应章节的修订蓝本——Requirement 8 已按 2026-09-30 方案 C 决策标注搁置（见 plan 十八章决策块与 19.6 总表）。

---

## 归档第一部分：原 proposal.md 全文

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

---

## 归档第二部分：原 tasks.md 全文

# 任务清单：knowledge-sync GA 调度触发路径（SY-0 变更包）

> 实施顺序遵循 plan 18.7：本变更包 spec 修订先行合入（openspec validate 通过）→ SY-2（Secrets，可与 spec 并行准备）→ SY-1（workflow 文件）→ SY-3（首跑与增量验证）。spec 纪律：spec 修订合入后才允许合入 workflow 文件。`packages/*` 零代码改动——管线全复用现有 `rag:sync` 脚本。

## 1. 规格门禁（SY-0，本变更包自身）

- [x] 1.1 [验证] `openspec/changes/2026-09-29-ga-knowledge-sync-schedule/` - proposal.md 与 delta spec（`specs/ai-rag/knowledge-sync/spec.md`）已就位：Requirement 5 的 MODIFIED 版本（触发方式四路枚举 + Vercel Cron 表述校准）与 Requirement 8 的 ADDED 版本（GA 双触发 + 手动、Secrets 前提、并发纪律、部署边界）。
- [x] 1.2 [验证] `openspec validate 2026-09-29-ga-knowledge-sync-schedule --strict` - 输出 `Change '2026-09-29-ga-knowledge-sync-schedule' is valid`（exit 0），workflow 合入门禁已开。

## 2. SY-1 workflow 文件（plan 18.3，spec 门禁开后执行）

- [ ] 2.1 [新增] `.github/workflows/rag-sync-schedule.yaml` - 双触发 + 手动 workflow：push main `paths: ["docs/**"]` + schedule（UTC 18:30，北京 02:30 低峰）+ `workflow_dispatch`；concurrency group `rag-sync` 且 `cancel-in-progress: false`；job 步骤为 checkout → pnpm 安装 → 构建 `@ruan-cat-drill-doc/ai-rag-core` → 执行 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync`，并注入 8 类 `NITRO_` Secrets 环境变量。
  - 验收：yaml 语法合法；变量清单与探索笔记 E 第 84-93 行核查表一致（8 类必填 + `NITRO_REPOSITORY_ROOT`/`NITRO_KNOWLEDGE_SOURCE_ROOT` 可省略）；无任何 Secret 明文。

## 3. SY-2 Secrets 配置（plan 18.4，可与本变更包 spec 并行准备）

- [ ] 3.1 [配置] GitHub 仓库 Settings → Secrets and variables → Actions 逐项配置 8 类：`NITRO_DATABASE_URL`（pooled 即可）、`NITRO_SYNC_DATABASE_URL`（**必须 non-pooled 直连串**，从 Neon 控制台获取）、`NITRO_EMBEDDING_MODEL`、`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_KNOWLEDGE_SYNC_TOKEN`（门禁变量，非空即可）、`NITRO_CRON_SECRET`（门禁变量，非空即可）、按激活 provider 配置 `NITRO_ANTHROPIC_API_KEY`（切 OpenAI 时换 `NITRO_OPENAI_API_KEY`）。
  - 凭据纪律：全部走 GitHub 加密 Secrets；禁止出现在 workflow 日志、代码、文档与本仓库任何文件（AGENTS.md 既有红线）。
  - 验收：`gh secret list` 可见 8 个条目。

## 4. SY-3 首跑与增量验证（plan 18.5）

- [ ] 4.1 [验证] `workflow_dispatch` 手动首跑：未变更轮快速通过（读 290 文件 + 哈希对比，预期分钟级），Actions 页面运行记录 success。
- [x] ~~4.2 [验证] 人为修改一个 `docs/**` 下 md → push main → 触发增量~~（2026-09-29 22:10 用户决策取消：docs/docx 整目录 gitignored、origin/main 不含知识源，push 路径前提不成立；详见 browser-evidence/EV/2026-09-29-remaining-items-plan.md 第 2.3 节）。知识源分发机制为独立开放决策。
- [x] 4.3 [验证] 次日核对 schedule 自动运行成功（Actions 运行历史）。**（2026-09-30 00:36 随方案 C 决策失去实际意义：CI 无知识源，schedule 轮为空转；由 automation f0b99da9 代执行记录后关闭。）**
- [ ] 4.4 [验证] 检查 workflow 日志无任何 Secret 值泄漏（GitHub 自动 `::add-mask::` 之外人工复核）。

## 5. 决策记录（2026-09-30 00:36）

- **知识源分发选方案 C：本地 CLI 为主、手动低频更新**——知识库更新 = 维护者本地执行 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync`（直连 Neon 写入），这是唯一事实源。
- GA workflow（rag-sync-schedule.yaml，已合入 main）当前空转（CI 无知识源），调度路线搁置；workflow 文件处置（删除/保留留档）为后续待确认项，当前保留不动。
- 非功能遗留不变：单文件增量断言已取消（用户决策）；schedule 核对由 automation 代执行。

---

## 归档第三部分：原 delta spec 全文（能力修订蓝本）

## MODIFIED Requirements

### Requirement: 5. 同步触发与鉴权

系统 MUST 提供 `POST /v1/knowledge/sync` 供上游 DOCX 转换完成后调用，并 MUST 校验 `NITRO_KNOWLEDGE_SYNC_TOKEN`；`GET /v1/knowledge/sync` 供 Cron 风格 HTTP 触发调用，鉴权 MUST 兼容平台以 Bearer 方式注入的 `CRON_SECRET`；一次性命令、POST、HTTP Cron 风格 GET 与 GitHub Actions workflow（Requirement 8）四种触发方式 MUST 复用同一同步服务；系统 MUST 使用 PostgreSQL advisory lock 拒绝并发同步；同步入口 SHALL 只扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录，MUST NOT 接收客户端传入的 Markdown 内容或文件路径。定时与事件调度由 GitHub Actions 承担（Requirement 8）；系统 MUST NOT 在 Vercel 侧配置 Cron——`vercel.json` 已于 2026-08-07 删除且 MUST NOT 重建，HTTP Cron 风格端点仅为保留的外部触发契约。

#### Scenario: 上游 POST 触发

- **WHEN** 上游 DOCX 转换完成后携带 `NITRO_KNOWLEDGE_SYNC_TOKEN` 调用 `POST /v1/knowledge/sync`
- **THEN** 系统 SHALL 执行同步服务
- **AND** 未携带有效凭据的请求 SHALL 返回 401 或 403

#### Scenario: Vercel Cron 触发

- **WHEN** 外部调度方以 `Authorization: Bearer $CRON_SECRET` 调用 `GET /v1/knowledge/sync`
- **THEN** 系统 SHALL 接受该凭据并执行与 POST 相同的同步服务
- **AND** 一次性命令、POST、HTTP Cron 风格 GET 与 GitHub Actions workflow 四种触发方式 SHALL 复用同一套切分、哈希与删除语义
- **AND** 系统 MUST NOT 在 Vercel 侧配置 Cron（2026-08-07 决策否决的是 Vercel Cron 配置而非 HTTP 端点本身），Vercel 部署链路 MUST NOT 承担同步调度职责，定时与事件调度由 GitHub Actions 承担（Requirement 8）

#### Scenario: 并发同步被拒绝

- **WHEN** 两个同步请求同时到达
- **THEN** 系统 MUST 通过 PostgreSQL advisory lock 只允许一个同步执行
- **AND** 该 session-level lock MUST 由 non-pooled `NITRO_SYNC_DATABASE_URL` 连接持有，不得使用会复用 PostgreSQL backend 的 pooled URL
- **AND** 被拒绝的请求 SHALL 返回 409 冲突

#### Scenario: 同步入口不接受外部内容

- **WHEN** 客户端向同步接口提交 Markdown 内容或文件路径
- **THEN** 系统 MUST 忽略这些输入，仅扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录

## ADDED Requirements

### Requirement: 8. GitHub Actions 调度触发路径

> **⚠️ 2026-09-30 00:36 用户决策：本 GA 调度路径正式搁置（知识源分发选方案 C：本地 CLI 为主、手动低频更新）。** 理由：docs/docx 整目录 gitignored，CI checkout 内无知识源（首跑实测 scannedFileCount=0），push/schedule 触发均为空转。以下规格保留为知识源分发方案（进 git / CI 生成）未来落地时的重启蓝本；当前生效的同步事实源是本地 CLI（rag:sync 直连 Neon）。

系统 MUST 支持 GitHub Actions workflow 作为知识库同步的调度承担方，workflow MUST 提供三种触发进入方式：push main（仅当 `docs/**` 路径文件变更，执行增量同步）、schedule 每日兜底（UTC 低峰时刻）与 `workflow_dispatch` 手动触发。GA job MUST 复用现有 `rag:sync` 一次性命令管线（先构建 `ai-rag-core`，再执行同步脚本），MUST NOT 为 GA 路径新增第二套同步实现，MUST NOT 修改同步管线代码。workflow 所需的 8 类 `NITRO_` 前缀环境变量（`NITRO_DATABASE_URL`、`NITRO_SYNC_DATABASE_URL`、`NITRO_EMBEDDING_MODEL`、`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET`，以及按激活 provider 选择的 `NITRO_ANTHROPIC_API_KEY` 或 `NITRO_OPENAI_API_KEY`）MUST 全部经 GitHub Actions Secrets 注入；`NITRO_SYNC_DATABASE_URL` MUST 为 non-pooled 直连连接串（pooled URL 使 advisory lock 失效，属配置错误）；`NITRO_KNOWLEDGE_SYNC_TOKEN` 与 `NITRO_CRON_SECRET` 为装配门禁变量，MUST 非空。workflow MUST 配置 concurrency 组且 `cancel-in-progress: false`，与 advisory lock 共同保证同步不可并发。Secrets 值 MUST NOT 出现在 workflow 日志、代码、文档与本仓库任何文件。GA 路径 MUST NOT 触碰或重建 `vercel.json`，MUST NOT 与 Vercel 部署链路耦合。

#### Scenario: push main 增量触发

- **WHEN** `docs/**` 路径下的文件变更被合入 main 分支
- **THEN** workflow SHALL 自动触发并执行一轮同步
- **AND** 未变更文件 SHALL 依据内容哈希与 profile/model 身份被跳过（Requirement 3 幂等语义）
- **AND** 仅变更文件 SHALL 重新生成 chunk 与 embedding 并写入 `knowledge_sync_runs` 审计记录

#### Scenario: schedule 每日兜底触发

- **WHEN** 到达 workflow 配置的 UTC 定时时刻
- **THEN** workflow SHALL 自动触发并执行一轮同步
- **AND** 无变更轮 SHALL 以哈希对比快速通过，MUST NOT 产生重复 embedding 成本

#### Scenario: 手动首跑触发

- **WHEN** 维护者通过 `workflow_dispatch` 手动触发 workflow
- **THEN** workflow SHALL 完整跑通同步管线并在 Actions 页面产出运行记录

#### Scenario: Secrets 缺失时显式失败

- **GIVEN** workflow 所需 8 类 Secrets 中任一项未配置或为空
- **WHEN** 同步 job 启动装配门禁校验
- **THEN** job SHALL 以失败退出并在日志中明示缺失的环境变量名
- **AND** 失败日志 MUST NOT 泄漏任何 Secret 值

#### Scenario: non-pooled 连接串校验

- **GIVEN** `NITRO_SYNC_DATABASE_URL` 被配置为 pooled 连接串
- **WHEN** 同步 job 持有 advisory lock
- **THEN** 该配置 SHALL 被视为配置错误——pooled 连接复用 PostgreSQL backend 会使 session-level lock 语义失效
- **AND** 修复方式 MUST 为在 Neon 控制台获取 non-pooled（直连）连接串并更新对应 Secret

#### Scenario: 同步不可并发

- **WHEN** 上一轮同步尚未结束而新一轮触发到达
- **THEN** workflow 的 concurrency 组 SHALL 使新触发排队等待（`cancel-in-progress: false`）
- **AND** 即使排队失效，同步服务内的 advisory lock 仍 SHALL 拒绝并发执行（Requirement 5）

#### Scenario: 部署链路零耦合

- **WHEN** GA 同步 workflow 合入或执行
- **THEN** 本仓库 MUST NOT 恢复或新增 `vercel.json`
- **AND** 同步管线代码（chunk、embedding、事务替换与删除语义）MUST 保持零改动
