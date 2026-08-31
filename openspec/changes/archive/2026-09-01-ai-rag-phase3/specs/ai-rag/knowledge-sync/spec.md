## MODIFIED Requirements

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
