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
