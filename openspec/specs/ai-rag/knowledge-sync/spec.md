# knowledge-sync Specification

## Purpose

知识源同步与文档管理能力：以 `docs/docx` 目录下的 Markdown 文件为唯一知识源，负责目录扫描、结构化 chunk 生成、增量对账与幂等、单文档事务替换、同步记录持久化与受控触发，保证知识库内容与上游语料实时一致且可追溯。

## Requirements

### Requirement: 1. 知识源与扫描范围

系统 MUST 以 `docs/docx` 目录为唯一知识源，SHALL 仅扫描 `docs/docx/**/*.md` 下的 Markdown 文本文件；系统 MUST NOT 读取图片等二进制文件，且 MUST NOT 下载、OCR 图片或把图片内容发送给 embedding 与聊天模型；系统 MUST 将文件路径统一规范化为以 `/` 分隔、相对仓库根目录的 `sourcePath`；每次同步 MUST 以目录实时内容为准重新扫描，SHALL NOT 以首次导入的数据库内容作为事实来源。

#### Scenario: 只扫描 Markdown 文本

- **WHEN** 对 `docs/docx` 目录执行一次同步扫描
- **THEN** 系统 MUST 仅读取 `docs/docx/**/*.md` 后缀的 Markdown 文本文件
- **AND** 系统 MUST NOT 读取 `.png`、`.jpg` 等图片二进制文件
- **AND** 每个文件的 `sourcePath` SHALL 使用 `/` 分隔并相对仓库根目录

#### Scenario: 每次同步以目录实时内容为准

- **WHEN** 知识源目录中的 Markdown 文件在上次导入后被新增、修改或删除
- **THEN** 新一轮同步 MUST 以目录当前实时内容重新扫描
- **AND** 同步结果 SHALL NOT 依赖首次导入时保存的文档内容

#### Scenario: 图片仅保留 URL 元数据

- **WHEN** 扫描的 Markdown 文本中包含图片链接
- **THEN** 系统 MUST 仅将图片 URL 提取为元数据
- **AND** 系统 MUST NOT 下载图片、执行 OCR 或把图片内容发送给 embedding 与聊天模型

### Requirement: 2. 结构化 chunk 契约

系统 MUST 为每个输出 chunk 持久化 `sourcePath`、`headingPath`、`headingIndex`、`headingAnchor`、`chunkIndex`、`imageUrls`、`chunkKind` 与 `contentHash` 字段；父子 chunk 关系启用时，子 chunk MUST 具有稳定的 `parentId`，且父块与子块 SHALL 可通过同一来源和标题路径追溯。embedding 输入 MUST 包含可复现的标题层级上下文，但 MUST NOT 包含图片 URL。连续 prose chunk SHALL 按配置保留跨块 overlap；表格、FAQ 问答对和代码块 SHALL 按结构边界处理，不得产生无法解释的断裂。既有锚点、表格行范围、chunkIndex 连续性和图片元数据合同 MUST 保持不变。

#### Scenario: 有标题 chunk 生成确定性锚点

- **WHEN** 为包含 H1/H2/H3 标题的 Markdown 文件生成 chunk
- **THEN** 每个 chunk 的 `headingAnchor` SHALL 以 `rag-heading-` 开头
- **AND** 锚点摘要 SHALL 由 `sourcePath`、完整 `headingPath` 与 `headingIndex` 以 `"\u0000"` 分隔拼接后计算 SHA-256，并使用完整 base64url 摘要
- **AND** 同一源文件内各 chunk 的 `chunkIndex` SHALL 从 `0` 开始连续递增
- **AND** 每个 chunk SHALL 持久化 `sourcePath`、`headingPath`、`headingIndex`、`chunkIndex`、`imageUrls`、`chunkKind` 与 `contentHash`

#### Scenario: 无标题根块使用文档锚点

- **WHEN** Markdown 内容不归属于任何标题（空标题路径）
- **THEN** 对应 chunk 的 `headingAnchor` SHALL 为 `rag-document-<sourcePath-digest>`
- **AND** 其 `headingIndex` SHALL 为 `-1`

#### Scenario: 超长表格按行组拆分

- **WHEN** 表格行数超过配置的行组上限
- **THEN** 系统 MUST 按连续行组将该表格拆分为多个 chunk
- **AND** 每个行组 chunk SHALL 重复表头、当前标题路径与图片 URL
- **AND** 行数未超限的表格 SHALL 保持为单一原子 chunk

#### Scenario: 图片 URL 不进入文本与向量

- **WHEN** chunk 所属文档包含图片 URL
- **THEN** 这些 URL SHALL 被持久化到 `imageUrls`
- **AND** chunk 文本内容与 embedding 输入 SHALL NOT 包含图片 URL

#### Scenario: 标题上下文进入 embedding 输入

- **WHEN** chunk 归属于一个或多个 H1/H2/H3 标题
- **THEN** embedding 输入 MUST 包含完整标题路径与正文
- **AND** 对同一正文和标题路径重复生成时输入 SHALL 保持确定性
- **AND** 图片 URL MUST NOT 出现在 embedding 输入

#### Scenario: 跨块 overlap 可观察且不破坏身份

- **WHEN** prose 被拆分为相邻 chunk 且 overlap 配置大于 0
- **THEN** 相邻 chunk SHALL 在句子边界保留配置范围内的重叠文本
- **AND** 每个 chunk 的 `chunkIndex` SHALL 仍从 0 开始连续递增
- **AND** overlap 配置版本 MUST 参与 profile 身份

#### Scenario: 父子 chunk 可追溯

- **WHEN** 启用父子 chunk 策略
- **THEN** 每个子 chunk MUST 指向稳定 `parentId`
- **AND** 检索命中子 chunk 后 SHALL 能定位其父块或允许扩展的相邻上下文
- **AND** 父子关系变更 MUST 触发对应文档的增量重建

#### Scenario: 结构化内容保持完整

- **WHEN** 处理表格、FAQ 问答对或代码块
- **THEN** 表格 chunk SHALL 保留表头与连续行范围
- **AND** FAQ 的问题与答案 SHALL 不得被拆成互不关联的孤立 chunk
- **AND** 代码块 SHALL 不得从语法结构中间截断

### Requirement: 3. 增量对账与幂等

同步 MUST 按 `sourcePath` 与内容哈希幂等执行；源文件未变化且 `profileVersion`、embedding 模型版本与 embedding 预处理版本未变化时 MUST 跳过该文件；文件新增或变化时 MUST 先完成新 chunk 与 embedding 的生成，再以单文档事务替换旧版本；单个文件重建失败时旧版本 MUST 继续保持可检索；仅当扫描完整成功时系统 SHALL 删除本轮未出现的 `sourcePath` 及其 chunk；扫描不完整或读取失败时 MUST NOT 据此删除旧数据。

#### Scenario: 未变化文件跳过处理

- **WHEN** 某文件的内容哈希、chunk profile、embedding 预处理版本与 embedding 模型版本均未变化
- **THEN** 系统 MUST 跳过该文件的切分与 embedding 生成
- **AND** 该文件 SHALL 计入同步记录的未变化数

#### Scenario: profile 或模型变化触发重建

- **WHEN** overlap、父子策略、embedding 预处理或 embedding 模型发生变化
- **THEN** 系统 MUST 重新生成该文件的 chunk 与 embedding
- **AND** 新旧版本 SHALL NOT 混写为同一 profile/model 身份

#### Scenario: 单文档事务替换旧版本

- **WHEN** 某文件内容或 profile/model 身份发生变化
- **THEN** 系统 MUST 先完成新 chunk 与 embedding 的全部生成
- **AND** 再以单文档事务原子替换旧版本
- **AND** 若重建失败，旧版本 chunk SHALL 继续保持可检索

#### Scenario: 删除仅发生在完整扫描之后

- **WHEN** 一轮扫描完整成功且某 `sourcePath` 未再出现
- **THEN** 系统 SHALL 删除该 `sourcePath` 及其全部 chunk
- **AND** 当扫描不完整或存在读取失败时，系统 MUST NOT 删除任何旧数据

### Requirement: 4. 同步记录

每轮同步 MUST 持久化同步记录，包含扫描文件数、未变化数、新增数、更新数、删除数、写入 chunk 数、失败文件列表与同步状态；系统 MUST 提供 `GET /v1/knowledge/sync-runs` 接口供前端展示同步记录。

#### Scenario: 同步结果可查询

- **WHEN** 前端请求 `GET /v1/knowledge/sync-runs`
- **THEN** 响应 SHALL 包含每轮同步的扫描文件数、未变化数、新增数、更新数、删除数与写入 chunk 数
- **AND** 响应 SHALL 包含失败文件列表与同步状态

#### Scenario: 失败文件被记录

- **WHEN** 某文件在本轮同步中处理失败
- **THEN** 其路径 MUST 被记入该轮同步记录的失败文件列表
- **AND** 该轮同步状态 SHALL 反映存在失败，不得记为成功

### Requirement: 5. 同步触发与鉴权

系统 MUST 提供 `POST /v1/knowledge/sync` 供上游 DOCX 转换完成后调用，并 MUST 校验 `NITRO_KNOWLEDGE_SYNC_TOKEN`；`GET /v1/knowledge/sync` 供 Vercel Cron 调用，鉴权 MUST 兼容平台以 Bearer 方式注入的 `CRON_SECRET`；一次性命令、POST 与 Cron 三种触发方式 MUST 复用同一同步服务；系统 MUST 使用 PostgreSQL advisory lock 拒绝并发同步；同步入口 SHALL 只扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录，MUST NOT 接收客户端传入的 Markdown 内容或文件路径。

#### Scenario: 上游 POST 触发

- **WHEN** 上游 DOCX 转换完成后携带 `NITRO_KNOWLEDGE_SYNC_TOKEN` 调用 `POST /v1/knowledge/sync`
- **THEN** 系统 SHALL 执行同步服务
- **AND** 未携带有效凭据的请求 SHALL 返回 401 或 403

#### Scenario: Vercel Cron 触发

- **WHEN** Vercel Cron 以 `Authorization: Bearer $CRON_SECRET` 调用 `GET /v1/knowledge/sync`
- **THEN** 系统 SHALL 接受该凭据并执行与 POST 相同的同步服务
- **AND** 一次性命令、POST 与 Cron 三种触发方式 SHALL 复用同一套切分、哈希与删除语义

#### Scenario: 并发同步被拒绝

- **WHEN** 两个同步请求同时到达
- **THEN** 系统 MUST 通过 PostgreSQL advisory lock 只允许一个同步执行
- **AND** 该 session-level lock MUST 由 non-pooled `NITRO_SYNC_DATABASE_URL` 连接持有，不得使用会复用 PostgreSQL backend 的 pooled URL
- **AND** 被拒绝的请求 SHALL 返回 409 冲突

#### Scenario: 同步入口不接受外部内容

- **WHEN** 客户端向同步接口提交 Markdown 内容或文件路径
- **THEN** 系统 MUST 忽略这些输入，仅扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录

### Requirement: 6. embedding 生成与维度契约

同步服务 MUST 对文档 chunk 与用户查询使用显式注入的 Cloudflare Workers AI embedding provider；phase3 生产基线为 `@cf/baai/bge-m3` 的 1024 维 dense embedding。每个批次 MUST 保持输入顺序，最多接受 100 条文本，并且在任何文档事务写入前校验每个返回向量正好是 1024 个有限数值。embedding 模型标识与预处理版本 MUST 参与幂等身份；模型或维度变化 MUST 触发 migration 与全量重嵌入，MUST NOT 在同一个 `chunks.embedding` 列中混用新旧向量。当前合同不承诺 BGE-M3 sparse、ColBERT 或 BM25 能力。

#### Scenario: 批量 embedding 保持顺序与上限

- **WHEN** 同步任务向 embedding provider 发送 chunk 内容
- **THEN** 每个请求 SHALL 最多包含 100 条文本
- **AND** 返回向量 SHALL 映射到相同的输入顺序

#### Scenario: embedding 输入包含上下文但不含图片 URL

- **WHEN** 为带标题路径的 chunk 生成 embedding
- **THEN** provider 输入 MUST 包含确定性的标题上下文与正文
- **AND** 图片 URL SHALL NOT 进入 provider 输入

#### Scenario: 无效 Cloudflare embedding 在写入前被拒绝

- **WHEN** provider 响应包含缺失向量、非有限数值、数量不匹配或长度不是 1024 的向量
- **THEN** 文档事务 MUST 在替换旧 chunk 前失败
- **AND** 旧文档版本 SHALL 继续保持可检索

### Requirement: 7. 只读准备 CLI

系统 MUST 提供知识准备命令，并强制要求显式传入 `--dry-run` 才允许执行；该命令 MUST 复用本地扫描与 chunk 合同，SHALL 只输出 JSON 摘要，且 MUST NOT 生成 embedding、写入数据库或构成同步事务。

#### Scenario: 未传 --dry-run 时拒绝执行

- **WHEN** 执行知识准备命令但未提供 `--dry-run`
- **THEN** 命令 MUST 拒绝执行

#### Scenario: dry-run 只输出 JSON 摘要

- **WHEN** 以 `--dry-run` 执行知识准备命令
- **THEN** 命令 SHALL 复用本地扫描与 chunk 合同并输出 JSON 摘要，包含扫描文件数与 chunk 数等统计
- **AND** 命令 MUST NOT 生成 embedding、写入数据库或构成同步事务
