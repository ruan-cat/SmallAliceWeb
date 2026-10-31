## MODIFIED Requirements

### Requirement: 1. 流式问答接口

系统 MUST 提供 `POST /v1/chat` 接口，接收 `{message, conversationId?}` 请求体，其中 `message` 非空、`conversationId` 可选；无效输入 MUST 返回 400；系统 MUST 基于检索到的上下文组装 system prompt 并流式生成回答；检索条数与分数阈值 MUST 支持请求级覆盖：接口 SHALL 接受可选的 `body.topK` 与 `body.scoreThreshold`，服务端 MUST 对其执行 clamp（`topK` 收敛到 [1,20]、`scoreThreshold` 收敛到 [0,1]）；env 缺省行为 MUST 保持旧行为（top_k=5、threshold 关闭）；当阈值已开启且全部检索结果分数低于阈值时，系统 MUST 走显式拒答文案路径，流式响应下同样成立；响应 MUST 为 AI SDK 标准流式 Response（含 data-stream content-type），MUST NOT 包装为 JSON，也 MUST NOT 在返回该 Response 后改写状态码；回答 MUST 为每个观点标注来源 `[来源N]`，资料不足时 MUST 说明「根据现有资料无法回答」。

#### Scenario: 有效请求返回流式响应

- **WHEN** 客户端向 `POST /v1/chat` 提交非空 `message`
- **THEN** 系统 MUST 按生效的 top_k（缺省 5）检索相关上下文并据此组装 system prompt
- **AND** 响应 SHALL 为 AI SDK 标准流式 Response，content-type 为 data-stream
- **AND** 系统 MUST NOT 将流式响应包装为 JSON，也 MUST NOT 在返回后改写状态码

#### Scenario: 无效输入返回 400

- **WHEN** `message` 为空、缺失或类型非法
- **THEN** 系统 MUST 返回 HTTP 400

#### Scenario: 回答标注来源与资料不足说明

- **WHEN** 模型生成回答时引用了检索片段
- **THEN** 回答文本 MUST 以 `[来源N]` 标注对应来源
- **AND** 当检索上下文不足以回答问题时，回答 MUST 说明「根据现有资料无法回答」

#### Scenario: 请求级参数覆盖与 clamp

- **WHEN** 请求体携带 `body.topK` 或 `body.scoreThreshold`
- **THEN** 系统 SHALL 以请求级参数覆盖 env 缺省值
- **AND** 服务端 MUST 将 topK 收敛到 [1,20]、将 scoreThreshold 收敛到 [0,1]
- **AND** 越界值（如 topK=100）SHALL 被收敛到对应边界后生效

#### Scenario: env 缺省保持旧行为

- **WHEN** 请求未携带 topK 与 scoreThreshold 且 env 未配置对应项
- **THEN** 检索条数 MUST 为 5，分数阈值过滤 MUST 保持关闭
- **AND** 合并后的生产行为 MUST 与参数化改造之前一致

#### Scenario: 全低于阈值触发显式拒答

- **WHEN** 阈值已开启且全部检索结果分数低于阈值
- **THEN** 系统 MUST 走显式拒答文案路径，说明根据现有资料无法回答
- **AND** 流式响应下该拒答路径 MUST 同样成立，MUST NOT 以空流或伪成功代替

### Requirement: 5. 检索接口

系统 MUST 提供 `POST /v1/search` 接口，接收非空查询文本，并 MUST 返回 Top-K 检索结果；接口 SHALL 接受可选的 `body.topK` 与 `body.scoreThreshold` 请求级覆盖，服务端 MUST 对其执行 clamp（`topK` 收敛到 [1,20]、`scoreThreshold` 收敛到 [0,1]）；env 缺省行为 MUST 保持旧行为（top_k=5、threshold 关闭）；每个结果 SHALL 包含内容片段、相似度分值与来源元数据（`sourcePath`、`headingPath`、`headingAnchor`、`sourceUrl` 等）；无效输入 MUST 返回 400。

#### Scenario: 有效查询返回 Top-K 结果

- **WHEN** 客户端向 `POST /v1/search` 提交非空查询文本
- **THEN** 系统 MUST 执行检索并返回 Top-K 结果
- **AND** 每个结果 SHALL 包含内容片段、相似度分值与来源元数据

#### Scenario: 无效查询返回 400

- **WHEN** 查询文本为空、缺失或类型非法
- **THEN** 系统 MUST 返回 HTTP 400

#### Scenario: search 请求级参数覆盖与 clamp

- **WHEN** 客户端提交查询并携带 `body.topK` 或 `body.scoreThreshold`
- **THEN** 系统 SHALL 以请求级参数覆盖 env 缺省值
- **AND** 服务端 MUST 将 topK 收敛到 [1,20]、将 scoreThreshold 收敛到 [0,1]
- **AND** 未携带参数时 MUST 保持旧行为（top_k=5、threshold 关闭）
