## MODIFIED Requirements

### Requirement: 1. 流式问答接口

系统 MUST 提供 `POST /v1/chat` 接口，接收 `{message, conversationId?, pageContext?}` 请求体，其中 `message` 非空、`conversationId` 与 `pageContext` 可选；`pageContext` MUST 进入请求 schema 校验，非法值 MUST 返回 400。系统 MUST 由类型化上下文容器与函数式模板模块组装 system prompt：检索到的上下文（Top-5）作为参考资料，页面上下文作为可选注入段；任一上下文来源缺失、非法或装配失败时，系统 MUST 跳过该来源并回退基础模板，问答 MUST NOT 因上下文问题而失败。响应 MUST 为 AI SDK 标准流式 Response（含 data-stream content-type），MUST NOT 包装为 JSON，也 MUST NOT 在返回该 Response 后改写状态码；回答 MUST 为每个观点标注来源 `[来源N]`，资料不足时 MUST 说明「根据现有资料无法回答」。system prompt 文本 MUST 集中由模板模块维护，contracts 路由的请求处理逻辑 MUST NOT 内联提示词文本；提示词内容变更 SHALL 仅需修改模板模块。

#### Scenario: 有效请求返回流式响应

- **GIVEN** 客户端向 `POST /v1/chat` 提交非空 `message` 的请求
- **WHEN** 系统处理该请求
- **THEN** 系统 MUST 由类型化上下文与模板模块组装 system prompt，参考资料为检索 Top-5 结果
- **AND** 响应 SHALL 为 AI SDK 标准流式 Response，content-type 为 data-stream
- **AND** 系统 MUST NOT 将流式响应包装为 JSON，也 MUST NOT 在返回后改写状态码

#### Scenario: 无效输入返回 400

- **GIVEN** 请求体不满足校验规则（`message` 为空、缺失或类型非法，或 `pageContext` 未通过 schema 校验）
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400
- **AND** 错误响应体 SHALL 为统一错误体 `{success, code, message, data}`（Requirement 3 行为不变）

#### Scenario: 回答标注来源与资料不足说明

- **GIVEN** 检索返回参考资料片段
- **WHEN** 模型生成回答
- **THEN** 回答文本 MUST 以 `[来源N]` 标注对应来源
- **AND** 当检索上下文不足以回答问题时，回答 MUST 说明「根据现有资料无法回答」

#### Scenario: 页面上下文缺失或非法时降级

- **GIVEN** `pageContext` 字段缺失、未通过 schema 校验或上下文来源装配失败
- **WHEN** 客户端提交问答请求
- **THEN** 系统 MUST 跳过页面上下文来源并使用基础模板正常回答，无报错、无重试
- **AND** 问答 MUST NOT 因任何上下文来源问题而失败

#### Scenario: 页面上下文条件注入与防误引

- **GIVEN** 请求携带合法 `pageContext`
- **WHEN** 系统组装 system prompt
- **THEN** 页面上下文 MUST 以独立注入段渲染（含 `pagePath` 与可选 `title`），并 SHALL 附带防误引声明
- **AND** 页面上下文信息 MUST NOT 计入 `[来源N]` 来源编号体系
- **AND** 回答 SHALL 能结合页面上下文对「这个怎么配」类指代问题给出针对当前页面的回答

#### Scenario: 提示词组装集中于模板模块

- **GIVEN** 需要修改 system prompt 文本
- **WHEN** 实施提示词变更
- **THEN** 变更 SHALL 仅需修改模板模块
- **AND** contracts 路由的请求处理逻辑（schema 校验、检索调用、来源帧推送、abort 传播、错误映射）MUST 保持不变

### Requirement: 8. 双协议聊天模型注册表

聊天运行时 MUST 从 `packages/ai-rag-api` 内的类型化公开注册表读取 provider 的 `protocol`、`baseUrl` 与 `model`，并 MUST 维护一个 `activeProvider` 作为默认 provider；注册表 MUST 同时描述 OpenAI Responses 与 Anthropic Messages 两种协议，MUST NOT 从环境变量读取模型、base URL 或默认 provider 选择。当前默认激活 provider MUST 为 Anthropic，模型 MUST 为 `claude-sonnet-5[1m]`，地址 MUST 为 `https://api.code-tab.com/v1`。OpenAI provider MUST 保留 `gpt-5.6-luna` 与 Responses 协议作为可切换配置。

`/v1/chat` 请求体 MAY 携带可选 `provider` 字段进行请求级覆盖：覆盖值 MUST 属于注册表 provider key 白名单（当前 `anthropic` | `openai`），非法值 MUST 返回 HTTP 400，字段缺失 MUST 回退 `activeProvider`；系统 MUST NOT 接受注册表白名单之外的自由 model 字符串，模型与 baseUrl MUST 由服务端注册表唯一决定。回答 SHALL 复用既有 `response-metadata` 事件回显实际使用的 provider 与 model，MUST NOT 新增第二套元数据通道。切换仅影响单次请求，MUST NOT 绑定会话语义。

#### Scenario: 激活 Anthropic provider

- **GIVEN** 请求未携带 `provider` 字段
- **WHEN** 装配层选择聊天模型
- **THEN** 系统 MUST 回退注册表默认激活项 `activeProvider: "anthropic"`
- **AND** MUST 使用 `POST https://api.code-tab.com/v1/messages`
- **AND** 请求 MUST 包含 Anthropic Messages 所需的 `model`、`system`、`messages`、`stream: true` 与 `max_tokens`

#### Scenario: 请求级覆盖切换 provider

- **GIVEN** 请求携带属于注册表白名单的 `provider` 字段（如 `openai`）
- **WHEN** 装配层处理该次请求
- **THEN** 系统 MUST 使用注册表中该 provider 的配置（`gpt-5.6-luna` 与 Responses 协议 adapter）生成本次回答
- **AND** 本次回答 SHALL 通过 `response-metadata` 事件回显实际使用的 provider 与 model，MUST NOT 新增第二套元数据通道
- **AND** 切换仅影响本次请求，MUST NOT 绑定会话语义

#### Scenario: 非法 provider 返回 400

- **GIVEN** 请求携带的 `provider` 值不属于注册表 provider key 白名单
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400 与统一错误体 `{success, code, message, data}`（Requirement 3 错误映射纪律）
- **AND** 系统 MUST NOT 将非法值静默回退为 `activeProvider`

#### Scenario: 白名单外的自由 model 字符串被拒绝

- **GIVEN** 请求试图携带注册表白名单之外的自由 model 字符串
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400
- **AND** 请求 schema MUST NOT 提供接受自由 model 字符串的字段，模型与 baseUrl MUST 由服务端注册表唯一决定

#### Scenario: 选择未配置凭据的 provider 返回 500

- **GIVEN** 请求选择的 provider 其 API key 未配置，该 provider 未进入装配分发表
- **WHEN** 装配层分发本次请求
- **THEN** 系统 MUST 返回 HTTP 500 与可识别的 `RAG provider not configured` 错误
- **AND** 系统 MUST NOT 静默回退到其他 provider，也 MUST NOT 伪造成功

#### Scenario: 下游流格式保持稳定

- **GIVEN** OpenAI Responses 或 Anthropic Messages 任一 adapter 产生上游流
- **WHEN** 系统处理该上游流
- **THEN** 系统 MUST 将其规范化为现有 AI SDK Data Stream Response
- **AND** MUST 保留来源数据帧、客户端 abortSignal 与错误状态
- **AND** 路由和前端 MUST NOT 依赖某一上游 SSE 事件名称

#### Scenario: 仅校验激活 provider 密钥

- **GIVEN** runtime 检查聊天模型凭据
- **WHEN** 校验各 provider 的 API key
- **THEN** 激活 provider 对应的 `NITRO_ANTHROPIC_API_KEY` 缺失 MUST 阻止模型装配
- **AND** 未激活的 `NITRO_OPENAI_API_KEY` 缺失不得阻塞默认 provider 装配，该 provider 仅不进入装配分发表
- **AND** 两个 API key MUST NOT 出现在注册表、浏览器响应、日志、报告或测试快照

## ADDED Requirements

### Requirement: 10. 模型列表下发接口

系统 MUST 提供 `GET /v1/models` 接口，返回模型选择元数据 `{models: [{id, label, model}]}`；数据 MUST 全部来自编译期注册表，注册表 SHALL 为每个 provider 维护 `label` 展示字段（如 `Claude Sonnet 5` / `GPT-5.6 Luna`）。该端点不触碰 provider 运行时，MUST NOT 依赖 503 装配守卫，即使聊天运行时未装配也 SHALL 正常返回静态注册表数据；响应 MUST NOT 包含 `baseUrl` 与任何 API key 凭据。该端点 SHALL 作为模型列表的唯一事实源，前端 MUST NOT 硬编码第二份模型清单。

#### Scenario: 下发公开模型元数据

- **GIVEN** 编译期注册表包含全部 provider 配置
- **WHEN** 客户端请求 `GET /v1/models`
- **THEN** 系统 MUST 返回注册表全部 provider 的 `id`、`label` 与 `model`
- **AND** 响应 MUST NOT 包含 `baseUrl` 与任何 API key 凭据

#### Scenario: 不受装配守卫约束

- **GIVEN** 聊天运行时未装配（`event.context.rag` 缺失）
- **WHEN** 客户端请求 `GET /v1/models`
- **THEN** 系统 SHALL 正常返回静态注册表数据
- **AND** 该端点 MUST NOT 返回 503 `RAG_NOT_CONFIGURED`

#### Scenario: 模型列表唯一事实源

- **GIVEN** 前端需要展示模型选择列表
- **WHEN** 前端获取模型列表
- **THEN** 前端 SHALL 从 `GET /v1/models` 端点获取
- **AND** 前端 MUST NOT 硬编码第二份模型清单

### Requirement: 11. 单轮上下文边界约束

动态上下文系统 MUST 保持单轮、无状态、全部可选：系统 MUST NOT 引入多轮会话语义或维护跨请求的历史消息数组；系统 MUST NOT 实现对话历史压缩机制（以 LLM 摘要替代早期轮次）——该机制的压缩对象是多轮历史消息数组，在单轮架构下没有挂载对象，且单轮请求上下文实测有界（system 模板 + Top-5 参考资料片段 + user message，约 1 万 tokens 量级，不足 1M 窗口的 1%）；单轮内上下文若膨胀，SHALL 采用确定性裁剪（按 rerank 分数取 top-k、截断片段前 N 字符、上下文来源降级跳过），MUST NOT 采用 LLM 摘要式压缩；系统 MUST NOT 接入 MCP（Model Context Protocol）。仅当重启多轮会话，或单轮引入全文注入场景且确定性裁剪不足时，才允许重新评估压缩机制。

#### Scenario: 上下文保持单轮无状态

- **GIVEN** 任意一次问答请求
- **WHEN** 系统组装请求上下文
- **THEN** 上下文 MUST 为单轮、无状态、全部可选
- **AND** 系统 MUST NOT 维护跨请求的多轮历史消息数组

#### Scenario: 禁止对话历史压缩

- **GIVEN** 上下文体积评估或上下文扩容场景
- **WHEN** 系统处理单轮上下文
- **THEN** 系统 MUST NOT 实现 LLM 摘要式对话历史压缩
- **AND** 单轮内上下文膨胀 SHALL 采用确定性裁剪（top-k、截断、来源降级跳过）

#### Scenario: 禁止 MCP 接入

- **GIVEN** 上下文来源或工具能力扩展场景
- **WHEN** 系统引入新的上下文来源
- **THEN** 系统 MUST NOT 接入 MCP（Model Context Protocol）
