# deployment Specification

## Purpose

定义二期 AI RAG 的部署与资源契约：Cloudflare Workers 现行生产架构、Neon 固定资源复用、环境变量接线、官方 neon CLI 强制、GitHub Actions 同步调度与固定生产域名，保证云端部署行为可复核、可回滚且不泄露密钥；Vercel 双项目仅作应急回滚附录。

## Requirements

### Requirement: 1. Cloudflare Workers 生产架构

自 2026-11-11 起，正式 Production MUST 由 GitHub Actions 构建后经 wrangler 部署到 Cloudflare Workers，MUST NOT 将 Vercel Git Integration 作为常规生产入口。

文档站 Worker 名称 MUST 为 `small-alice-web-docs`，自定义域名 MUST 包含 https://drill.ruan-cat.com/ 与 https://small-alice-web.ruan-cat.com/；生产部署 MUST 经 workflow `.github/workflows/docs-cloudflare-worker.yaml` 构建 VitePress 并 `wrangler deploy`（配置 `wrangler.docs.jsonc`）。

Nitro API Worker 名称 MUST 为 `small-alice-web-api`，生产自定义域名 MUST 为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/；生产构建命令 MUST 为 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:cloudflare`，部署 MUST 经 workflow `.github/workflows/api-cloudflare-worker.yaml` 执行 wrangler 上传（配置 `wrangler.json`）。

`build:vercel` 已于 2026-11-11 删除。附录里的 Vercel 双项目只作为已删除项目的历史记录，MUST NOT 再当作可执行的回滚路径。

仓库根 `vercel.json` MUST NOT 存在（已删除的破坏性变更）。仅当用户授权进行 Vercel 遗留诊断或应急回滚时，MAY 执行 `vercel link --project <name> --yes` 切换单槽绑定；该操作 MUST NOT 被记录为常规 Production 发布步骤。

#### Scenario: 文档站 Worker 生产部署

- **WHEN** remote `main` 触发文档站生产部署
- **THEN** MUST 经 `.github/workflows/docs-cloudflare-worker.yaml` 完成构建与 wrangler 部署
- **AND** Worker 名称 MUST 为 `small-alice-web-docs`
- **AND** 生产域名 MUST 包含 https://drill.ruan-cat.com/ 与 https://small-alice-web.ruan-cat.com/

#### Scenario: Nitro API Worker 生产部署

- **WHEN** remote `main` 触发 API 生产部署
- **THEN** MUST 经 `.github/workflows/api-cloudflare-worker.yaml` 完成部署
- **AND** Build MUST 为 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:cloudflare`
- **AND** Worker 名称 MUST 为 `small-alice-web-api`
- **AND** 生产域名 MUST 为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/

#### Scenario: 根 vercel.json 不得存在于仓库

- **WHEN** 检查部署配置
- **THEN** 仓库根 vercel.json MUST NOT 存在

#### Scenario: vercel link 仅限遗留诊断或回滚

- **WHEN** 需要 Vercel 遗留诊断或用户授权的应急回滚
- **THEN** MAY 执行 `vercel link --project <name> --yes` 切换绑定
- **AND** .vercel/project.json 是单槽绑定，不得假定其仍指向上一项目
- **AND** MUST NOT 将上述操作记为常规 Production 发布验收证据

### Requirement: 2. Neon 固定资源

系统 MUST 复用既有 Neon 资源：组织 org-super-fog-48541962、项目 patient-cloud-43432277、Vercel 关联数据库 neon-smallalice-ai-rag（项目内实际数据库名为 neondb）；MUST NOT 创建第二个同用途 Neon project 或 database；连接串、密码与 token MUST NOT 写入仓库、报告、测试快照或终端记录。

#### Scenario: 复用既有资源标识

- **WHEN** 连接数据库或核对云端资源
- **THEN** MUST 使用组织 org-super-fog-48541962 与项目 patient-cloud-43432277
- **AND** MUST 使用 Vercel 关联数据库 neon-smallalice-ai-rag（项目内实际数据库名为 neondb）

#### Scenario: 禁止创建第二个同用途资源

- **WHEN** 需要 Neon 数据库资源
- **THEN** MUST NOT 创建第二个同用途的 Neon project 或 database

#### Scenario: 密钥不落地

- **WHEN** 处理连接串、密码或 token
- **THEN** MUST NOT 写入仓库、报告、测试快照或终端记录

### Requirement: 3. 环境变量接线

应用检索与聊天 MUST 使用 Vercel 集成提供的 pooled URL，Drizzle migration MUST 使用非 pooled URL（通常为 POSTGRES*URL*NON_POOLING）；持有 session-level PostgreSQL advisory lock 的同步 MUST 使用私有 `NITRO_SYNC_DATABASE_URL` 注入同一既有数据库的 non-pooled URL，缺少它时 MUST NOT 装配同步能力；既有 NITRO\*\* 私有环境变量与 Cloudflare embedding 所需的 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_EMBEDDING_MODEL` MUST 跨 production、preview 与 development 三环境接线；Nitro API 连接数据库前 MUST 先执行 "vercel env pull .env.local --environment=development"；Vercel Project 使用自定义 pnpm install 时，三环境 MUST 维护 ENABLE_EXPERIMENTAL_COREPACK=1。

#### Scenario: pooled、同步与非 pooled URL 分工

- **WHEN** 应用检索或聊天
- **THEN** MUST 使用 Vercel 集成提供的 pooled URL
- **AND** 执行 Drizzle migration 时 MUST 使用非 pooled URL（通常为 POSTGRES_URL_NON_POOLING）
- **AND** 同步服务 MUST 通过私有 `NITRO_SYNC_DATABASE_URL` 使用同一既有数据库的 non-pooled URL 持有 advisory lock
- **AND** 缺少 non-pooled URL 时 MUST NOT 执行 migration 或装配同步服务

#### Scenario: RAG 环境变量三环境接线

- **WHEN** 配置 Nitro API 环境变量
- **THEN** 既有 NITRO\_\* 私有变量与 Cloudflare embedding 的 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_EMBEDDING_MODEL` MUST 在 production、preview 与 development 三环境全部接线

#### Scenario: 先拉取环境变量再连接数据库

- **WHEN** 本地 Nitro API 连接数据库
- **THEN** MUST 先执行 "vercel env pull .env.local --environment=development"
- **AND** 只在本地受 .gitignore 保护的文件中读取连接变量

#### Scenario: Corepack 实验开关

- **WHEN** Vercel Project 使用自定义 pnpm install 命令
- **THEN** production、preview 与 development 三环境 MUST 维护 ENABLE_EXPERIMENTAL_COREPACK=1
- **AND** 缺失该开关导致 ERR_PNPM_META_FETCH_FAIL 或 ERR_INVALID_THIS 时，不得将远程构建记录为成功

### Requirement: 4. Cloudflare embedding provider 接线

Nitro API MUST 通过 OpenAI-compatible `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings` endpoint 使用 Cloudflare Workers AI `@cf/baai/bge-m3` 作为 embedding 模型；请求 MUST 包含 `model` 与 `input`，MUST NOT 依赖不支持的 dimensions 参数；provider MUST 校验每个返回的 `data[].embedding` 都按输入顺序包含 1024 个有限数值。所有运行真实 RAG 的生产 Worker 与授权预览环境 MUST 以服务端环境变量配置 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN` 与 `NITRO_EMBEDDING_MODEL`；凭据 MUST NOT 暴露到浏览器代码或提交文件。

#### Scenario: Cloudflare embedding 请求形态

- **WHEN** Nitro 创建文档向量或查询向量
- **THEN** 系统 MUST 调用 Cloudflare OpenAI-compatible embeddings endpoint
- **AND** 请求 MUST 使用 `@cf/baai/bge-m3`（或显式配置的等价模型）与 `input` 文本
- **AND** 请求 MUST NOT 发送 `dimensions` 或 `output_dimensionality` 来尝试改变 BGE-M3 输出

#### Scenario: Cloudflare embedding 响应校验

- **WHEN** Cloudflare 返回 embedding 数据
- **THEN** Nitro MUST 保持输入顺序
- **AND** 每个向量 MUST 正好包含 1024 个有限数值
- **AND** 维度、数量或非有限数值不匹配 MUST 使同步或查询失败，MUST NOT 写入部分数据

#### Scenario: Cloudflare 凭据保持服务端私有

- **WHEN** 生产 Worker 运行 Nitro API
- **THEN** API token MUST 仅由服务端 provider 装配读取
- **AND** token MUST NOT 出现在浏览器响应、bundle、日志、报告或仓库文件中

### Requirement: 5. 官方 neon CLI 强制

项目执行入口 MUST 只调用官方 neon CLI，MUST NOT 使用 neonctl、其包装器或以 npx 临时安装的同名替代命令（Windows 已复现 neonctl@2.30.1 的 CPU 自旋事故，包括 --help 与 --version 等只读检查均属禁止路径）；scripts/guard-neon-cli.ts MUST 作为后续数据库脚本的前置步骤，仅 Windows 扫描仓库可执行文件并排除依赖目录、构建产物与守卫自身，Linux、macOS 与 Vercel 构建环境直接成功；每次实际云端操作 MUST 留下不含密钥的执行记录。

#### Scenario: 仅允许官方 neon CLI

- **WHEN** 执行 Neon 云端操作
- **THEN** MUST 调用官方 neon CLI
- **AND** MUST NOT 使用 neonctl、其包装器或以 npx 临时安装的同名替代命令
- **AND** 不得以"只读检查"为由执行 neonctl --help 或 --version

#### Scenario: 守卫作为数据库脚本前置步骤

- **WHEN** 执行后续数据库脚本
- **THEN** MUST 先运行 scripts/guard-neon-cli.ts
- **AND** Windows 下 MUST 扫描仓库可执行文件并排除依赖目录、构建产物与守卫自身
- **AND** Linux、macOS 与 Vercel 构建环境 MUST 直接成功退出

#### Scenario: 云端操作执行记录

- **WHEN** 每次实际云端操作
- **THEN** MUST 留下执行记录（执行时间、已确认认证状态、工作目录、脱敏命令模板、目标 project/branch/database、退出码与验证结果）
- **AND** 记录 MUST NOT 包含连接串、密码或 token

### Requirement: 6. 生产同步触发与构建输入

生产环境在上游 DOCX 转换写入 Markdown 后 MUST 调用携带 NITRO_KNOWLEDGE_SYNC_TOKEN 的 POST /v1/knowledge/sync；知识库定时同步调度 MUST 由 GitHub Actions workflow `.github/workflows/rag-sync-schedule.yaml` 承担，MUST NOT 将 Vercel Cron 作为生产调度源；对 GET /v1/knowledge/sync 的受控调用鉴权 MUST 兼容 `NITRO_KNOWLEDGE_SYNC_TOKEN` 与 `CRON_SECRET`（或等效 `NITRO_CRON_SECRET`）；生产 API 构建 MUST 显式把 `docs/docx` 纳入 Worker 可读的部署输入，MUST NOT 假定云端运行目录保留完整 Git 工作区；应急回滚至 Vercel 时 Nitro 的 Vercel 兼容日期 MUST 锁定为 2024-09-19。

#### Scenario: 上游 DOCX 转换后触发同步

- **WHEN** 上游 DOCX 转换写入 Markdown 后
- **THEN** MUST 调用携带 NITRO_KNOWLEDGE_SYNC_TOKEN 的 POST /v1/knowledge/sync

#### Scenario: GitHub Actions 定时同步调度

- **WHEN** 核对生产知识库同步调度来源
- **THEN** MUST 以 `.github/workflows/rag-sync-schedule.yaml` 为权威调度入口
- **AND** MUST NOT 依赖 Vercel Cron 触发生产同步
- **AND** workflow 运行所需密钥 MUST 经 GitHub Actions Secrets 注入

#### Scenario: GET 同步端点鉴权兼容

- **WHEN** 受控主体调用 GET /v1/knowledge/sync
- **THEN** 鉴权 MUST 同时兼容 NITRO_KNOWLEDGE_SYNC_TOKEN 与 CRON_SECRET（或等效 NITRO_CRON_SECRET）

#### Scenario: docs/docx 纳入部署输入

- **WHEN** 生产 API Worker 构建
- **THEN** MUST 显式将 docs/docx 纳入 Worker 可读的部署输入
- **AND** MUST NOT 假定云端运行目录保留完整 Git 工作区

#### Scenario: 已删除的 Vercel 构建不再作为回滚入口

- **WHEN** 查找 `build:vercel`
- **THEN** 该脚本 MUST NOT 存在。`nitro.config.ts` 里的 `vercel.functions.supportsCancellation` 只保留作退役参考

### Requirement: 7. 生产域名

VitePress 文档站生产域名 MUST 包含 https://drill.ruan-cat.com/ 与 https://small-alice-web.ruan-cat.com/（Worker `small-alice-web-docs`）。Nitro API 的生产域名 MUST 固定为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/（Worker `small-alice-web-api`），其下 MUST 提供 /v1/chat、/v1/search、/v1/knowledge/sync 与 /v1/knowledge/sync-runs 路由前缀。

#### Scenario: 固定文档站生产域名

- **WHEN** 访问生产文档站
- **THEN** 域名 MUST 包含 https://drill.ruan-cat.com/ 与 https://small-alice-web.ruan-cat.com/

#### Scenario: 固定 API 生产域名

- **WHEN** 访问生产 Nitro API
- **THEN** 域名 MUST 为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/

#### Scenario: 固定路由前缀

- **WHEN** 调用生产 API
- **THEN** MUST 提供 /v1/chat、/v1/search、/v1/knowledge/sync 与 /v1/knowledge/sync-runs 路由前缀

### Requirement: 8. 双协议模型与环境变量迁移

Nitro API MUST 在代码内保存类型化聊天 provider 注册表，注册 OpenAI Responses 与 Anthropic Messages 两种公开配置，并固定 `activeProvider: "anthropic"`。注册表 MUST 保存 provider 的 `protocol`、`baseUrl` 与 `model`，MUST NOT 保存 API key；模型、base URL 与 provider 选择 MUST NOT 通过 `NITRO_CHAT_MODEL`、`NITRO_BASE_URL` 或新的非敏感 provider 环境变量注入。当前 Anthropic 配置 MUST 使用 `https://api.code-tab.com/v1` 与 `claude-sonnet-5[1m]`，OpenAI 配置 MUST 保留 `https://api.code-tab.com/v1`、`gpt-5.6-luna` 与 Responses 协议。

在 Vercel 项目 `smallalice-docs-ai-nitro-api` 的 development、preview、production 环境中，`NITRO_BASE_URL` 与 `NITRO_CHAT_MODEL` MUST 删除，原 `NITRO_OPENAI_API_KEY` MUST 原值保留且不得读取/打印/修改；用户提供的 `NITRO_ANTHROPIC_API_KEY` MUST 在三个环境接线，并且三个环境均 MUST 使用 Vercel `Non-sensitive` 类型。该类型是用户明确接受的安全降级，不得据此放宽仓库、报告、测试快照和终端输出的密钥保护。变更前 MUST 完成只记录变量名和环境的盘点，并将必要的敏感值备份保存到受 `.gitignore` 保护的本地文件；仓库、报告、测试快照和终端输出 MUST NOT 包含任何 key 值。

#### Scenario: 三环境变量迁移

- **WHEN** 更新 `smallalice-docs-ai-nitro-api` 的 Vercel 环境变量
- **THEN** development、preview、production MUST 均不存在 `NITRO_BASE_URL` 与 `NITRO_CHAT_MODEL`
- **AND** `NITRO_OPENAI_API_KEY` MUST 继续存在且值不变
- **AND** `NITRO_ANTHROPIC_API_KEY` MUST 在三个环境均存在
- **AND** `NITRO_ANTHROPIC_API_KEY` 在三个环境的类型 MUST 均为 `Non-sensitive`

#### Scenario: 激活 provider 的凭据门禁

- **WHEN** Nitro runtime 使用 Anthropic provider 启动
- **THEN** 缺少 `NITRO_ANTHROPIC_API_KEY` MUST 阻止模型装配并返回真实配置错误
- **AND** 未激活 OpenAI provider 的 key 缺失不得阻塞 Anthropic 运行

#### Scenario: 真实 Anthropic Messages 端点验证

- **WHEN** 执行模型 smoke 或生产验收
- **THEN** MUST 直接验证 `POST https://api.code-tab.com/v1/messages`
- **AND** MUST 记录 headers、`message_start`、首个文本 delta、`message_stop` 或错误事件
- **AND** 120 秒为慢响应观察点，420 秒为单次请求硬上限
- **AND** HTTP 200、来源帧或仅 headers 到达均不得单独证明模型请求成功

#### Scenario: main 合并后 Workers 生产部署验收

- **WHEN** 用户将变更合并入 remote `main` 并触发 GitHub Actions 生产部署工作流（`.github/workflows/docs-cloudflare-worker.yaml` 与 `.github/workflows/api-cloudflare-worker.yaml`）
- **THEN** 验收 MUST 核对 workflow run 成功、checkout SHA 与 `main` 一致、wrangler 部署步骤完成
- **AND** 验收 MUST 对 Requirement 7 固定生产域名执行 smoke（文档站首屏与 API 路由前缀）
- **AND** 进行中或未成功的 workflow run MUST NOT 被记录为 Production Ready

## 附录：Vercel 双项目回滚路径（非现行 Production）

> 历史记录：切流前 Production 曾由 Vercel Git Integration 承担。2026-11-11 自定义域名已指向 Cloudflare Workers，并且 Vercel 项目 `small-alice-web-odse` 与 `smallalice-docs-ai-nitro-api` 已删除。不要再 `vercel link` 这两个名字。

删除前的构建参数只留在 `reports/2026-11-10-vercel-to-cloudflare/`。`build:vercel` 与根脚本 `deploy-vercel` 已删除。
