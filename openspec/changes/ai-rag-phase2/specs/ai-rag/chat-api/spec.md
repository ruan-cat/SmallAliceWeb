## Purpose

流式问答 API 与运行时装配能力：提供 `/v1/chat` 检索增强流式问答接口，基于检索上下文组装提示词并返回 AI SDK 标准流式响应与来源数据帧，同时定义输入校验、鉴权与错误映射契约，以及未装配运行时上下文时的 503 行为与装配工厂约束。

## ADDED Requirements

### Requirement: 1. 流式问答接口

系统 MUST 提供 `POST /v1/chat` 接口，接收 `{message, conversationId?}` 请求体，其中 `message` 非空、`conversationId` 可选；无效输入 MUST 返回 400；系统 MUST 基于检索到的上下文（Top-5）组装 system prompt 并流式生成回答；响应 MUST 为 AI SDK 标准流式 Response（含 data-stream content-type），MUST NOT 包装为 JSON，也 MUST NOT 在返回该 Response 后改写状态码；回答 MUST 为每个观点标注来源 `[来源N]`，资料不足时 MUST 说明「根据现有资料无法回答」。

#### Scenario: 有效请求返回流式响应

- **WHEN** 客户端向 `POST /v1/chat` 提交非空 `message`
- **THEN** 系统 MUST 检索 Top-5 相关上下文并据此组装 system prompt
- **AND** 响应 SHALL 为 AI SDK 标准流式 Response，content-type 为 data-stream
- **AND** 系统 MUST NOT 将流式响应包装为 JSON，也 MUST NOT 在返回后改写状态码

#### Scenario: 无效输入返回 400

- **WHEN** `message` 为空、缺失或类型非法
- **THEN** 系统 MUST 返回 HTTP 400

#### Scenario: 回答标注来源与资料不足说明

- **WHEN** 模型生成回答时引用了检索片段
- **THEN** 回答文本 MUST 以 `[来源N]` 标注对应来源
- **AND** 当检索上下文不足以回答问题时，回答 MUST 说明「根据现有资料无法回答」

### Requirement: 2. 来源数据帧

流式响应 MUST 携带来源数据帧，每帧字段 SHALL 包含 `id`、`content`（截取前 200 字符）、`score`、`sourcePath`、`sourceUrl`、`headingPath`、`headingIndex`、`chunkIndex`、`headingAnchor`、`imageUrls`；`sourceUrl` MUST 由 `sourcePath` 派生（移除 `docs/` 前缀、将 `.md` 替换为 `.html`、逐段 `encodeURIComponent`），且 SHALL NOT 作为数据库持久化字段。

#### Scenario: 来源帧字段完整

- **WHEN** 流式响应中推送来源数据帧
- **THEN** 每帧 SHALL 包含 id、content、score、sourcePath、sourceUrl、headingPath、headingIndex、chunkIndex、headingAnchor 与 imageUrls
- **AND** `content` SHALL 为原内容前 200 字符的截取

#### Scenario: sourceUrl 由 sourcePath 派生且不入库

- **WHEN** 计算某 chunk 的 `sourceUrl`
- **THEN** 系统 MUST 移除 `sourcePath` 的 `docs/` 前缀、将 `.md` 替换为 `.html` 并对每个路径段执行 `encodeURIComponent`
- **AND** `sourceUrl` SHALL NOT 作为数据库持久化字段

### Requirement: 3. 鉴权与错误映射

系统 MUST 在错误时同时体现真实 HTTP 状态码：zod 校验失败为 400、鉴权失败保留 401/403、并发同步冲突为 409、其他未预期错误为 500；错误响应体 MUST 统一为 `{success, code, message, data}`；MUST NOT 只在 JSON 中写 `code` 而让 HTTP 状态码仍为 200。

#### Scenario: 错误状态码与响应体一致

- **WHEN** 请求触发输入校验、鉴权或并发冲突错误
- **THEN** HTTP 状态码 MUST 分别为 400、401/403 或 409
- **AND** 响应体 SHALL 为 `{success, code, message, data}`，且 `code` 与 HTTP 状态码一致

#### Scenario: 未预期错误映射为 500

- **WHEN** 处理请求时发生未预期错误
- **THEN** 系统 MUST 返回 HTTP 500
- **AND** MUST NOT 以 HTTP 200 承载错误

### Requirement: 4. 未装配契约

当 `event.context.rag` 未装配时，`chat`、`search`、`sync`、`sync-runs` 四个路由 MUST 返回 HTTP 503 与 `RAG_NOT_CONFIGURED`，MUST NOT 以空结果或 accepted 状态伪造成功。

#### Scenario: 未装配时四个路由返回 503

- **WHEN** 请求到达 chat、search、sync 或 sync-runs 路由，且 `event.context.rag` 未装配
- **THEN** 每个路由 MUST 返回 HTTP 503 与 `RAG_NOT_CONFIGURED`
- **AND** 各路由 MUST NOT 以空结果或 accepted 响应伪造成功

### Requirement: 5. 检索接口

系统 MUST 提供 `POST /v1/search` 接口，接收非空查询文本，并 MUST 返回 Top-K 检索结果；每个结果 SHALL 包含内容片段、相似度分值与来源元数据（`sourcePath`、`headingPath`、`headingAnchor`、`sourceUrl` 等）；无效输入 MUST 返回 400。

#### Scenario: 有效查询返回 Top-K 结果

- **WHEN** 客户端向 `POST /v1/search` 提交非空查询文本
- **THEN** 系统 MUST 执行检索并返回 Top-K 结果
- **AND** 每个结果 SHALL 包含内容片段、相似度分值与来源元数据

#### Scenario: 无效查询返回 400

- **WHEN** 查询文本为空、缺失或类型非法
- **THEN** 系统 MUST 返回 HTTP 400

### Requirement: 6. 运行时装配

运行时装配工厂 MUST 由显式注入的 provider（database/embedding/model/sync）构建运行时上下文；MUST NOT 读取裸 `process.env`，MUST NOT 在 import 时建立数据库连接；缺少 database、embedding 或 model 配置时 MUST NOT 生成半成品 context；provider 初始化失败 MUST 映射为 HTTP 500，MUST NOT 转换为假成功。

#### Scenario: 装配只接受注入的 provider

- **WHEN** 构建运行时上下文
- **THEN** 工厂 MUST 通过显式注入的 database/embedding/model/sync provider 构建
- **AND** MUST NOT 读取裸 `process.env`，也 MUST NOT 在 import 时建立数据库连接

#### Scenario: 缺少配置不生成半成品

- **WHEN** database、embedding 或 model 配置缺失
- **THEN** 系统 MUST NOT 生成半成品 context
- **AND** 相关路由 SHALL 保持 503 RAG_NOT_CONFIGURED 行为

#### Scenario: provider 初始化失败映射 500

- **WHEN** provider 初始化抛出错误
- **THEN** 系统 MUST 将该错误映射为 HTTP 500
- **AND** MUST NOT 将其转换为 HTTP 200 假成功
