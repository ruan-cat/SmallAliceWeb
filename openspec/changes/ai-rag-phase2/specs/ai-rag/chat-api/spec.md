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

### Requirement: 7. Cloudflare embedding provider

Nitro runtime MUST 为 `/v1/search` 查询向量与知识同步暴露同一个显式 embedding provider。provider MUST 使用 Cloudflare Workers AI 的 OpenAI-compatible `/v1/embeddings` endpoint 与 `@cf/baai/bge-m3`；MUST 按输入顺序映射 `data[].embedding`；当任一返回向量不是 1024 维有限数值时 MUST 拒绝响应。provider MUST 通过注入配置初始化，MUST NOT 在模块 import 时读取凭据。

#### Scenario: 检索与同步共享同一 embedding 契约

- **WHEN** `/v1/search` 创建查询向量，或同步流程创建 chunk 向量
- **THEN** 两类操作 MUST 使用同一个已配置 Cloudflare 模型与 1024 维校验
- **AND** provider 失败 MUST 作为真实错误暴露，MUST NOT 产生空结果或 accepted 假成功

### Requirement: 8. 双协议聊天模型注册表

聊天运行时 MUST 从 `packages/ai-rag-api` 内的类型化公开注册表读取 provider 的 `protocol`、`baseUrl` 与 `model`，并固定一个 `activeProvider`；注册表 MUST 同时描述 OpenAI Responses 与 Anthropic Messages 两种协议，MUST NOT 从环境变量读取模型、base URL 或 provider 选择。当前激活 provider MUST 为 Anthropic，模型 MUST 为 `claude-sonnet-5[1m]`，地址 MUST 为 `https://api.code-tab.com/v1`。OpenAI provider MUST 保留 `gpt-5.6-luna` 与 Responses 协议作为可切换配置。

#### Scenario: 激活 Anthropic provider

- **WHEN** runtime 初始化聊天模型
- **THEN** 系统 MUST 选择注册表中的 `activeProvider: "anthropic"`
- **AND** MUST 使用 `POST https://api.code-tab.com/v1/messages`
- **AND** 请求 MUST 包含 Anthropic Messages 所需的 `model`、`system`、`messages`、`stream: true` 与 `max_tokens`

#### Scenario: 下游流格式保持稳定

- **WHEN** OpenAI Responses 或 Anthropic Messages 任一 adapter 产生上游流
- **THEN** 系统 MUST 将其规范化为现有 AI SDK Data Stream Response
- **AND** MUST 保留来源数据帧、客户端 abortSignal 与错误状态
- **AND** 路由和前端 MUST NOT 依赖某一上游 SSE 事件名称

#### Scenario: 仅校验激活 provider 密钥

- **WHEN** runtime 检查聊天模型凭据
- **THEN** 激活 provider 对应的 `NITRO_ANTHROPIC_API_KEY` 缺失 MUST 阻止模型装配
- **AND** 未激活的 `NITRO_OPENAI_API_KEY` 缺失不得阻塞 Anthropic provider 装配
- **AND** 两个 API key MUST NOT 出现在注册表、浏览器响应、日志、报告或测试快照

### Requirement: 9. Anthropic Messages 流式验证

真实验证 MUST 直接请求 `POST https://api.code-tab.com/v1/messages` 并记录 HTTP headers、`message_start`、首个文本 delta、`message_stop` 或错误事件的时间线。120 秒 MUST 作为慢响应观察点，420 秒 MUST 作为单次请求硬上限；只有出现有效 SSE、首个文本 delta 与正常终止事件时，才能认定上游模型请求可用。

#### Scenario: 120 秒内首段响应

- **WHEN** Anthropic 请求在 120 秒内产生首个文本 delta
- **THEN** 验证记录 MUST 标记首段耗时并继续读取到终止事件

#### Scenario: 慢响应但在硬上限内完成

- **WHEN** 请求超过 120 秒才产生首段但在 420 秒内产生 `message_stop`
- **THEN** 验证 MUST 标记为“慢但完成”，不得伪报为首段及时

#### Scenario: 超过 420 秒仍未完成

- **WHEN** 请求在 420 秒内未出现正常终止事件
- **THEN** 测试 MUST 主动 abort 并记录未完成原因
- **AND** 结果 MUST NOT 被标记为 LLM 请求成功
