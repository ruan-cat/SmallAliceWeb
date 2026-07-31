# 你好

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ruan-cat/SmallAliceWeb)

你好，这是钻头文档。

## 1. 错误占位图片

![2025-04-11-16-41-34](https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-04-11-16-41-34.png)

## 2. AI RAG 的 Neon 资源标识

二期 AI RAG 复用本仓库关联 Vercel 项目中的既有 Neon 资源，不创建同用途的第二套云数据库。

- Neon 组织 ID：`org-super-fog-48541962`
- Neon 项目 ID：`patient-cloud-43432277`
- Vercel 已关联的 Neon 数据库名称：`neon-smallalice-ai-rag`

数据库连接前，先从 Vercel 拉取当前环境变量；连接串和其他凭据不得提交到仓库。所有 Neon CLI 操作统一使用 `neon`，其安装与认证由用户完成。

## 3. 二期 AI RAG Chat 技术选型

- 聊天 UI 唯一采用 `vue-element-plus-x`，直接使用 `Bubble`、`BubbleList` 和 `Sender`；不得重复实现同职责的消息气泡、输入框或停止按钮。
- 流式 Markdown 唯一采用 `markstream-vue`，负责不完整 AI 输出、表格、代码块和安全 HTML 策略；不得手写 Markdown parser。
- `@shikijs/stream` 只用于生成中的代码块高亮。必须在完成 `markstream-vue` 集成并锁定版本后，以真实 API spike 和测试确认，当前不能声称已经集成。
- 业务使用方通过 `useKnowledgeChat` 中的 `@ai-sdk/vue` 管理 transport、会话状态与 abort；该依赖不得进入通用展示包 `ai-vue`。
- AI Elements Vue 是 Tailwind/shadcn 栈的替代方案，当前 Element Plus X 栈不得混用。
- `ai-vue` 仅负责 DTO 到第三方 props 的薄适配、`sourceHref` 和 mock 文档演示，不耦合 Nitro、检索或模型服务。

`ai-vue` 已接入 `vue-element-plus-x@1.3.98` 的 `BubbleList`、其内部 `Bubble` 渲染和 `Sender`，并接入 `markstream-vue@1.0.8` 渲染助手消息。`@ai-sdk/vue` 与 `@shikijs/stream` 仍未安装或接入。本地文档不表示 Neon、Vercel、数据库或模型服务已经完成云端验收。
