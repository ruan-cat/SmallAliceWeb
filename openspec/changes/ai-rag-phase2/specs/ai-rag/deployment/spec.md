## Purpose

定义二期 AI RAG 的部署与资源契约：Vercel 双项目架构、Neon 固定资源复用、环境变量接线、官方 neon CLI 强制、生产同步触发与固定生产域名，保证云端部署行为可复核、可回滚且不泄露密钥。

## ADDED Requirements

### Requirement: 1. Vercel 双项目架构

仓库 MUST 同时绑定两个 Vercel 项目：small-alice-web-odse（VitePress 文档站，Root Directory 为 "."、Framework 为 Other、Build 为 "pnpm run build"、Output Directory 为 "docs/.vitepress/dist"、Install 为 "pnpm install"、Node 22.x）与 smallalice-docs-ai-nitro-api（Nitro API，Root 为 "."、Build 为 "pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel"、Output 为 ".vercel/output"、Install 为 "pnpm install"、Node 22.x）；仓库根 vercel.json MUST NOT 存在（已删除的破坏性变更），双项目配置 MUST 维护在云端 Project Settings；部署任一项目前 MUST 先执行 "vercel link --project <name> --yes" 切换单槽绑定。

#### Scenario: 文档站项目配置

- **WHEN** 构建并部署 VitePress 文档站
- **THEN** MUST 使用 small-alice-web-odse 项目（Root 为 "."、Framework 为 Other、Node 22.x）
- **AND** Build MUST 为 "pnpm run build"
- **AND** Output MUST 为 "docs/.vitepress/dist"
- **AND** Install MUST 为 "pnpm install"

#### Scenario: Nitro API 项目配置

- **WHEN** 构建并部署 Nitro API
- **THEN** MUST 使用 smallalice-docs-ai-nitro-api 项目（Root 为 "."、Node 22.x）
- **AND** Build MUST 为 "pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel"
- **AND** Output MUST 为 ".vercel/output"
- **AND** Install MUST 为 "pnpm install"

#### Scenario: 根 vercel.json 已删除且配置维护在云端

- **WHEN** 检查部署配置
- **THEN** 仓库根 vercel.json MUST NOT 存在
- **AND** 双项目配置 MUST 维护在各自云端 Project Settings

#### Scenario: 部署前切换单槽绑定

- **WHEN** 部署任一项目
- **THEN** MUST 先执行 "vercel link --project <name> --yes" 切换绑定
- **AND** .vercel/project.json 是单槽绑定，不得假定其仍指向上一项目

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

Nitro API MUST 通过 OpenAI-compatible `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings` endpoint 使用 Cloudflare Workers AI `@cf/baai/bge-m3` 作为 embedding 模型；请求 MUST 包含 `model` 与 `input`，MUST NOT 依赖不支持的 dimensions 参数；provider MUST 校验每个返回的 `data[].embedding` 都按输入顺序包含 1024 个有限数值。所有运行真实 RAG 的 Vercel 环境 MUST 以服务端环境变量配置 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN` 与 `NITRO_EMBEDDING_MODEL`；凭据 MUST NOT 暴露到浏览器代码或提交文件。

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

- **WHEN** Vercel 运行 Nitro API
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

生产环境在上游 DOCX 转换写入 Markdown 后 MUST 调用携带 NITRO_KNOWLEDGE_SYNC_TOKEN 的 POST /v1/knowledge/sync；Vercel Cron 调用 GET /v1/knowledge/sync 时由平台注入 Authorization: Bearer $CRON_SECRET；鉴权 MUST 兼容这两种受控凭据；生产 API 构建 MUST 显式把 docs/docx 纳入函数可读的部署输入，MUST NOT 假定 Vercel 运行目录保留完整 Git 工作区；Nitro 的 Vercel 兼容日期 MUST 锁定为 2024-09-19。

#### Scenario: 上游 DOCX 转换后触发同步

- **WHEN** 上游 DOCX 转换写入 Markdown 后
- **THEN** MUST 调用携带 NITRO_KNOWLEDGE_SYNC_TOKEN 的 POST /v1/knowledge/sync

#### Scenario: Vercel Cron 触发同步

- **WHEN** Vercel Cron 调用 GET /v1/knowledge/sync
- **THEN** 平台 MUST 注入 Authorization: Bearer $CRON_SECRET
- **AND** 鉴权 MUST 同时兼容 NITRO_KNOWLEDGE_SYNC_TOKEN 与 CRON_SECRET 两种受控凭据

#### Scenario: docs/docx 纳入部署输入

- **WHEN** 生产 API 构建
- **THEN** MUST 显式将 docs/docx 纳入函数可读的部署输入
- **AND** MUST NOT 假定 Vercel 运行目录保留完整 Git 工作区

#### Scenario: 锁定 Vercel 兼容日期

- **WHEN** 配置 Nitro
- **THEN** compatibilityDate MUST 锁定为 2024-09-19

### Requirement: 7. 生产域名

Nitro API 的生产域名 MUST 固定为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/，其下 MUST 提供 /v1/chat、/v1/search、/v1/knowledge/sync 与 /v1/knowledge/sync-runs 路由前缀。

#### Scenario: 固定生产域名

- **WHEN** 访问生产 Nitro API
- **THEN** 域名 MUST 为 https://smallalice-docs-ai-nitro-api.ruan-cat.com/

#### Scenario: 固定路由前缀

- **WHEN** 调用生产 API
- **THEN** MUST 提供 /v1/chat、/v1/search、/v1/knowledge/sync 与 /v1/knowledge/sync-runs 路由前缀
