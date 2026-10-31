## MODIFIED Requirements

### Requirement: 2. 结构化 chunk 契约

系统 MUST 为每个输出 chunk 持久化 `sourcePath`、`headingPath`、`headingIndex`、`headingAnchor`、`chunkIndex`、`imageUrls`、`chunkKind` 与 `contentHash` 字段；父子 chunk 关系启用时，子 chunk MUST 具有稳定的 `parentId`，且父块与子块 SHALL 可通过同一来源和标题路径追溯。embedding 输入 MUST 包含可复现的标题层级上下文，但 MUST NOT 包含图片 URL。连续 prose chunk SHALL 按配置保留跨块 overlap；表格、FAQ 问答对和代码块 SHALL 按结构边界处理，不得产生无法解释的断裂。既有锚点、表格行范围、chunkIndex 连续性和图片元数据合同 MUST 保持不变。对切分策略的任何修改（包括表格拆分策略与分句边界字符集）MUST 以只读核实结论为前置：修改前 MUST 先核实大表格是否被行组拆分拦腰切断、分句边界是否覆盖中文句读（如「。」「！」「？」「；」），并逐项留存证据；无核实结论时 MUST NOT 修改切分参数，MUST NOT 触发全量重同步；核实流程 MUST 保持只读，MUST NOT 生成 embedding、写入数据库或触发同步。

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

#### Scenario: 切分策略修改前核实先行

- **WHEN** 计划修改表格拆分策略、分句边界字符集或 chunk 尺寸等切分参数
- **THEN** 系统 MUST 先以只读方式完成适性核实并逐项留存证据
- **AND** 核实 MUST 覆盖大表格是否被行组拆分拦腰切断与分句边界是否覆盖中文句读（「。」「！」「？」「；」）
- **AND** 无核实结论时 MUST NOT 修改切分参数，MUST NOT 触发全量重同步

## ADDED Requirements

### Requirement: 8. 全量重同步触发边界

全量重同步 MUST 满足以下边界：触发前 MUST 获得用户明确授权；执行 MUST 串行进行，同步期间 MUST NOT 并发执行其他同步，并发请求 SHALL 由 PostgreSQL advisory lock 拒绝；连接 MUST 使用 non-pooled 的 `NITRO_SYNC_DATABASE_URL`（advisory lock 依赖独占连接）；执行 MUST 经既有本地 CLI `rag:sync` 同步链路直连 Neon（方案 C：本地 CLI 是唯一同步事实源），MUST NOT 引入 CI/GitHub Actions 侧同步；同步中断后 SHALL 依赖 sha256 四元组增量机制幂等修复。

#### Scenario: 未授权不执行全量重同步

- **WHEN** 计划执行全量重同步
- **THEN** 用户明确授权 MUST 先于执行获得
- **AND** 未获授权时系统 MUST NOT 启动全量重同步

#### Scenario: 串行执行且连接 non-pooled

- **WHEN** 执行全量重同步
- **THEN** 执行 MUST 串行进行，同步期间 MUST NOT 存在并发同步
- **AND** 连接 MUST 使用 non-pooled 的 `NITRO_SYNC_DATABASE_URL`
- **AND** 并发同步请求 SHALL 由 PostgreSQL advisory lock 拒绝

#### Scenario: 走方案 C 本地 CLI

- **WHEN** 执行全量重同步
- **THEN** 执行 MUST 经既有本地 `rag:sync` 同步链路直连 Neon
- **AND** 系统 MUST NOT 引入 CI/GitHub Actions 侧同步

#### Scenario: 中断后幂等恢复

- **WHEN** 全量重同步在执行中被中断
- **THEN** 恢复执行 SHALL 依赖 sha256 四元组增量机制跳过已完成文件
- **AND** 已写入的文档版本 MUST 继续保持可检索
