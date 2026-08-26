# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-26；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：14 / 26 已完成；`2.1.3a` 代码与本地合同、环境变量写入已完成，真实上游事件时间线、OpenSpec strict 复核和生产验收仍未完成，因此保持未勾选。
- 设计已获用户确认：类型化 provider 注册表、`activeProvider: "anthropic"`、OpenAI Responses + Anthropic Messages 双 adapter。
- 工作分支：`dev`；保留用户既有 `prompts/index.md` 改动，不纳入本轮范围。

## 2. 本 checkpoint 已完成

- `design.md` 增加双协议注册表、密钥边界、adapter 责任与 120/420 秒验证门禁。
- `specs/ai-rag/chat-api/spec.md` 增加双协议、激活 provider 密钥和 Anthropic SSE 验收合同。
- `specs/ai-rag/deployment/spec.md` 增加三环境变量迁移、备份和真实 `/v1/messages` 证据要求。
- `tasks.md` 新增 `2.1.3a`，并将 `2.1.4` 的生产门禁切换为 Anthropic Messages；旧 Luna Responses 证据保留为历史。
- `packages/ai-rag-api`：25 个测试文件 / 89 个用例通过，typecheck 通过，`build:vercel` 通过；真实 SDK 受控 fetch 已验证 `/v1/messages`、Anthropic headers、请求体和 SSE → Data Stream 转换。
- `nitro.config.ts` 已改为直接 `defineConfig`；`src/runtime-config.ts` 只保留 `RagNitroConfig` 类型合同。

## 3. 当前阻塞与边界

- 本地代码已接入 `@ai-sdk/anthropic@1.2.12`；真实上游事件时间线和生产部署验收仍未完成。
- Vercel 变量备份已完成；旧 `NITRO_BASE_URL/NITRO_CHAT_MODEL` 已删除，Anthropic key 已写入三个环境。Production/Preview 为 Sensitive，Development 被 CLI 明确限制为 Non-sensitive，三环境 Sensitive 要求尚未闭环。
- 当前 `openspec` CLI 不在 PATH，最近一次 strict validate 发生在本轮 Nitro 配置重构之前；不能把旧结果外推到当前工件。
- 旧 `gpt-5.6-luna` Responses SSE 三次无事件记录仅是历史证据，不能推断 Anthropic Messages 可用或不可用。

## 4. 下一步

1. 恢复或定位 OpenSpec CLI，运行当前工件的 strict validate。
2. 使用已写入的开发环境凭据执行真实 `/v1/messages` 事件时间线（120 秒观察点 / 420 秒硬上限）。
3. 触发并核验 Nitro Git deployment，再完成生产 API 与可见浏览器验收；Development Non-sensitive 限制需在最终状态中单独披露。
