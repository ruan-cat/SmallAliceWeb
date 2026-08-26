# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-26；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：15 / 26 已完成；`2.1.3a` 双协议代码、三环境 Non-sensitive 接线与真实上游事件时间线已完成，当前进入 `2.1.4` 生产浏览器回归。
- 设计已获用户确认：类型化 provider 注册表、`activeProvider: "anthropic"`、OpenAI Responses + Anthropic Messages 双 adapter。
- 工作分支：`dev`；保留用户既有 `prompts/index.md` 改动，不纳入本轮范围。

## 2. 本 checkpoint 已完成

- `design.md` 增加双协议注册表、密钥边界、adapter 责任与 120/420 秒验证门禁。
- `specs/ai-rag/chat-api/spec.md` 增加双协议、激活 provider 密钥和 Anthropic SSE 验收合同。
- `specs/ai-rag/deployment/spec.md` 增加三环境变量迁移、备份和真实 `/v1/messages` 证据要求。
- `tasks.md` 新增 `2.1.3a`，并将 `2.1.4` 的生产门禁切换为 Anthropic Messages；旧 Luna Responses 证据保留为历史。
- `packages/ai-rag-api`：25 个测试文件 / 89 个用例通过，typecheck 通过，`build:vercel` 通过；真实 SDK 受控 fetch 已验证 `/v1/messages`、Anthropic headers、请求体和 SSE → Data Stream 转换。
- `nitro.config.ts` 已改为直接 `defineConfig`；`src/runtime-config.ts` 只保留 `RagNitroConfig` 类型合同。
- 本轮复核：`pnpm dlx @fission-ai/openspec@1.10.0 validate ai-rag-phase2 --strict` 通过；API 测试 25/89、typecheck 与 `build:vercel` 均退出码 0。
- 生产域名只读 smoke：`POST /v1/search` HTTP 200 返回来源 DTO；`POST /v1/chat` HTTP 200、`X-Vercel-Ai-Data-Stream: v1`，收到文本帧与 `finishReason: stop`。该结果不证明上游 Anthropic SSE 事件时间线。
- 本轮真实模型 smoke：Luna `/v1/responses` HTTP 200，首个文本 delta 119.063s、`response.completed` 119.098s；Anthropic `/v1/messages` HTTP 200，`message_start` 3.790s、首个文本 delta 5.100s、`message_stop` 5.211s，420 秒硬上限未触发。

## 3. 当前阻塞与边界

- 本地代码已接入 `@ai-sdk/anthropic@1.2.12`；真实上游事件时间线已完成，生产浏览器验收仍未完成。
- Vercel 变量备份已完成；旧 `NITRO_BASE_URL/NITRO_CHAT_MODEL` 已删除，Anthropic key 已写入三个环境。按用户明确授权，`NITRO_ANTHROPIC_API_KEY` 已在 Production、Preview、Development 重新接线为统一 Non-sensitive 类型；其他数据库/平台密钥未降级。
- `openspec` CLI 不在 PATH；已用 `pnpm dlx @fission-ai/openspec@1.10.0` 完成当前工件 strict validate。
- 旧 `gpt-5.6-luna` Responses SSE 三次无事件记录仅是历史证据，不能推断 Anthropic Messages 可用或不可用。
- 本轮外部核对：Vercel 项目 `smallalice-docs-ai-nitro-api` 最新 Production deployment `dpl_8YYreC2s6RCTUV4UKb1CCsCxUWs4` 为 READY，checkout SHA 为 `1160f204207dc49ff93c0f194549194eaddd6751`；运行日志显示 `/v1/search` 与 `/v1/chat` 均 HTTP 200。Vercel MCP 不提供环境变量值读取接口。
- 阻塞解释：三环境类型策略已统一，Development 普通变量可安全拉取；首次 401 根因是 `.env.local` 引号解析错误，修正后 Anthropic 直连 PASS。当前剩余门禁是生产浏览器停止、内容保留与来源跳转。

## 4. 下一步

1. 执行 `2.1.4`：在真实生产文档站完成 Anthropic 流式问答、停止生成、已收内容保留与来源跳转验收。
2. 触发并核验 Nitro Git deployment 与 checkout SHA，再完成生产 API 与可见浏览器验收。
