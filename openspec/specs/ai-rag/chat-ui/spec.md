# chat-ui Specification

## Purpose

定义二期 AI RAG 前端 Chat UI 集成的行为契约：以 vue-element-plus-x 的 Bubble、BubbleList、Sender 为唯一对话 UI 主线，以 markstream-vue 为唯一流式 Markdown 主线，并约束 transport 状态边界、动态效果偏好、停止生成与代码高亮受控接入，保证验收可逐条测试。

## Requirements

### Requirement: 1. 唯一对话 UI 主线

系统 MUST 真实使用 vue-element-plus-x 的 Bubble、BubbleList 与 Sender 实现消息气泡、消息列表、输入发送与停止交互，作为唯一的对话 UI 主线；系统 MUST NOT 导出或维护与它们同职责的本地组件（如 AiChatMessage、AiChatComposer、AiChatMarkdown），也不得以本地实现替代这些第三方组件。

#### Scenario: 对话界面由第三方组件构成

- **WHEN** 对话界面渲染消息气泡、消息列表与输入区域
- **THEN** 消息气泡与列表 MUST 由 Bubble 与 BubbleList 渲染
- **AND** 输入发送与停止交互 MUST 由 Sender 提供

#### Scenario: 禁止导出或维护同职责本地组件

- **WHEN** 评审 ai-vue 通用展示包与业务 Chat 页面的组件实现
- **THEN** 不得导出或维护与 Bubble、BubbleList、Sender 同职责的本地组件（如 AiChatMessage、AiChatComposer、AiChatMarkdown）
- **AND** 助手消息渲染不得由本地 Markdown 组件替代 markstream-vue

### Requirement: 2. 唯一流式 Markdown 主线

助手消息 MUST 由 markstream-vue 的 MarkdownRender 直接渲染（mode="chat"）：流式期间内容持续追加且 final=false，收到流结束信号后 final=true；系统 MUST NOT 手写 Markdown parser、不得整段替换已渲染内容、不得以纯文本动画模拟流式回答，也不得新增自研 Markdown 打字机。

#### Scenario: 助手消息由 markstream-vue 直接渲染

- **WHEN** 助手流式响应返回新的文本增量
- **THEN** 增量 MUST 持续追加到响应式 content 并由 markstream-vue 直接渲染
- **AND** 渲染 MUST 使用 mode="chat"
- **AND** 流式期间 final MUST 保持为 false，收到流结束信号后 MUST 更新为 true

#### Scenario: 禁止整段替换与纯文本动画模拟流式

- **WHEN** 流式内容增量到达
- **THEN** 不得整段替换已渲染内容
- **AND** 不得以外层纯文本动画拆分或模拟流式回答

#### Scenario: 禁止手写 parser 与自研打字机

- **WHEN** 评审 Markdown 渲染实现
- **THEN** 不得手写 Markdown parser
- **AND** 不得新增自研 Markdown 打字机

### Requirement: 3. 动态效果与减少动态偏好

系统 MUST 默认使用 smoothStreaming="auto" 并启用 markstream-vue 的 typewriter，同时固定 fade=false；检测到 prefers-reduced-motion: reduce 时 MUST 关闭正文 typewriter 与淡入动画，但 MUST NOT 停止内容流、Markdown 解析与 final 收敛；Element Plus X 的 Typewriter MUST 仅允许用于非 Markdown 的短文案，MUST NOT 包裹助手 Markdown 正文，且同样遵守该减少动态偏好。

#### Scenario: 默认流式呈现策略

- **WHEN** 未检测到减少动态效果偏好
- **THEN** 助手正文 MUST 使用 smoothStreaming="auto"
- **AND** typewriter MUST 处于启用状态
- **AND** fade MUST 固定为 false

#### Scenario: 减少动态偏好下保留内容流

- **WHEN** 检测到 prefers-reduced-motion: reduce
- **THEN** 正文 typewriter 与淡入动画 MUST 被关闭
- **AND** 内容流、Markdown 解析与 final 收敛 MUST NOT 被停止

#### Scenario: Typewriter 仅限非 Markdown 短文案

- **WHEN** 使用 Element Plus X 的 Typewriter
- **THEN** 仅允许用于 Welcome 标题等非 Markdown 的简短文案
- **AND** MUST NOT 包裹助手 Markdown 正文
- **AND** 同样必须遵守减少动态效果偏好

### Requirement: 4. 停止生成

流式响应期间系统 MUST 提供可见、可访问的"停止生成"入口；用户触发停止时 MUST 触发 abort，且已接收内容 MUST 被保留。

#### Scenario: 流式期间提供停止生成入口

- **WHEN** 流式响应正在进行
- **THEN** MUST 显示可见且可访问的"停止生成"入口

#### Scenario: 停止触发 abort 并保留已接收内容

- **WHEN** 用户触发"停止生成"
- **THEN** 必须触发 abort 信号
- **AND** 已接收的助手内容 MUST 保留在消息中
- **AND** "停止生成"入口 MUST 消失

### Requirement: 5. transport 与状态边界

@ai-sdk/vue MUST 仅由业务使用方的 useKnowledgeChat 调用，由其管理消息、transport、流式状态与 abort；通用展示包 MUST NOT 导入 @ai-sdk/vue，也不得包含 Nitro 请求逻辑；来源数据帧 DTO MUST 至少包含 id、label 与 sourceHref（snippet 可选）；503 RAG_NOT_CONFIGURED 响应 MUST 可展示且可关闭。

#### Scenario: @ai-sdk/vue 仅由业务使用方调用

- **WHEN** 业务 Chat 页面建立真实会话
- **THEN** useKnowledgeChat MUST 通过 @ai-sdk/vue 管理消息、transport、流式状态与 abort
- **AND** 通用展示包 MUST NOT 导入 @ai-sdk/vue
- **AND** 通用展示包 MUST NOT 包含 Nitro 请求逻辑

#### Scenario: 来源数据帧 DTO 契约

- **WHEN** 流式响应携带来源数据帧
- **THEN** DTO MUST 至少包含 id、label 与 sourceHref
- **AND** snippet 为可选字段

#### Scenario: 503 RAG_NOT_CONFIGURED 可展示可关闭

- **WHEN** API 返回 503 RAG_NOT_CONFIGURED
- **THEN** 界面 MUST 展示该未装配状态
- **AND** 该状态提示 MUST 可被用户关闭

### Requirement: 6. 代码高亮受控集成

@shikijs/stream MUST 仅在锁定版本并以真实组件 API 验证代码块、未闭合代码块、表格、长回复与 XSS 防护之后才允许接入；验证失败时系统 MUST 保留 markstream-vue 的安全默认渲染，MUST NOT 假定两者兼容。

#### Scenario: 未验证前禁止接入

- **WHEN** @shikijs/stream 未锁定版本或未通过真实组件 API 验证
- **THEN** MUST NOT 接入代码块高亮
- **AND** MUST 保留 markstream-vue 的安全默认渲染

#### Scenario: 接入前的验证覆盖清单

- **WHEN** 评估 @shikijs/stream 的接入
- **THEN** MUST 以真实组件 API 验证代码块、未闭合代码块、表格、长回复与 XSS 防护
- **AND** 缺任一项验证证据时不得宣称兼容或接入
