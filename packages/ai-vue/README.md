# @smallalice/ai-vue

## 1. 包职责

`ai-vue` 是二期 AI RAG Chat 的通用展示包，只保留 DTO 到第三方组件 props 的薄适配、`sourceHref` 和 mock 文档演示。不耦合 Nitro、检索或模型服务，也不承载 transport、会话状态或 abort。

## 2. 聊天 UI 与 Markdown 主线

- `vue-element-plus-x` 是唯一聊天 UI 主线，`AiChat` 已直接使用 `BubbleList` 和 `Sender`；`BubbleList@1.3.98` 按条目创建 `Bubble`。禁止实现同职责的消息气泡、输入框或停止按钮。
- `markstream-vue@1.0.8` 是唯一流式 Markdown 主线，已用于助手消息的 `mode="chat"` 渲染，并采用 `html-policy="escape"` 处理不可信 HTML；禁止手写 Markdown parser。
- `@shikijs/stream` 仅处理生成中的代码块高亮。需在 `markstream-vue` 集成和版本锁定后，通过真实 API spike 与测试确认；当前尚未集成。

## 3. 业务边界

业务使用方的 `useKnowledgeChat` 使用 `@ai-sdk/vue` 管理 transport、会话状态与 abort，`@ai-sdk/vue` 不得进入本包。AI Elements Vue 是 Tailwind/shadcn 栈的替代方案，当前 Element Plus X 栈不得混用。

当前尚未安装或接入 `@ai-sdk/vue`。本文档仅记录本地技术选型，未访问 Neon、Vercel、数据库或模型服务，不表示云端验收已经完成。
