# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-27；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：16 / 26 已完成；`2.1.3a` 双协议代码、三环境 Non-sensitive 接线、真实上游事件时间线与 `2.1.4` 生产浏览器回归已完成；`2.2.3` 已取得真实索引基线，但独立重切分参数对照仍未完成；`2.2.4` 本地完整构建已通过，生产部署仍在排队监听。
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
- agent-browser 生产证据：`https://drill.ruan-cat.com/` 页面加载成功；真实 `/v1/chat` 返回流式回答，停止按钮出现并可点击，点击后已收内容保留、状态收敛；网络记录包含 API `OPTIONS` 204 与 `POST` 200。来源以内联 `reference-node` 呈现，但点击未产生导航或来源链接，2.1.4 仍未完成。

## 3. 当前阻塞与边界

- 本地代码已接入 `@ai-sdk/anthropic@1.2.12`；真实上游事件时间线已完成，生产浏览器验收仍未完成。
- Vercel 变量备份已完成；旧 `NITRO_BASE_URL/NITRO_CHAT_MODEL` 已删除，Anthropic key 已写入三个环境。按用户明确授权，`NITRO_ANTHROPIC_API_KEY` 已在 Production、Preview、Development 重新接线为统一 Non-sensitive 类型；其他数据库/平台密钥未降级。
- `openspec` CLI 不在 PATH；已用 `pnpm dlx @fission-ai/openspec@1.10.0` 完成当前工件 strict validate。
- 旧 `gpt-5.6-luna` Responses SSE 三次无事件记录仅是历史证据，不能推断 Anthropic Messages 可用或不可用。
- 本轮外部核对：Vercel 项目 `smallalice-docs-ai-nitro-api` 最新 Production deployment `dpl_8YYreC2s6RCTUV4UKb1CCsCxUWs4` 为 READY，checkout SHA 为 `1160f204207dc49ff93c0f194549194eaddd6751`；运行日志显示 `/v1/search` 与 `/v1/chat` 均 HTTP 200。Vercel MCP 不提供环境变量值读取接口。
- 阻塞解释：三环境类型策略已统一，Development 普通变量可安全拉取；首次 401 根因是 `.env.local` 引号解析错误，修正后 Anthropic 直连 PASS。生产浏览器停止与内容保留已通过；当前剩余门禁是来源跳转，以及最新文档站 Git deployment 的正式 Production alias 验证。
- 本轮修复尝试：新增 `toSources()` 展开嵌套 AI SDK data 帧，并以 HTTP data-stream 回归覆盖，`ai-vitepress-plugins` 测试 31/31、typecheck、build 均通过。Chrome 生产页在修复部署前仍观察到 `reference-node` 存在但 `.ai-chat__source` 为 0；不能将本地 GREEN 外推为生产修复完成。
- 最新 Git Integration Production deployment `dpl_6beFTJ9U1e3MR2AH4QwqoyaEDyxb` 已由 `main` SHA `e30bb8f731c16dd3462a866c3bf49114b12aac4e` 触发，但当前仍为 `QUEUED` 且无 build log，需 READY 后重新用 Google Chrome 复测。
- 最终收口：Nitro v3 `vercel.functions.supportsCancellation=true` 已生成并回读 `.vc-config.json`；API Production `dpl_7ZY4vduHngqgvmMauKgLmwrsHXfh` READY。Chrome 生产 `/v1/chat` 来源链接与真实 `sourceUrl#headingAnchor` 跳转通过，停止后文本/来源保留通过。Vercel runtime logs 取得 `/v1/messages` 成功流 `response 200`、`message_start`、`content_block_delta`、`message_stop`，以及停止流 `abort` + `AbortError`；生产上游证据闭环完成。
- 2026-08-27 真实评测：数据库只读计数为 248 documents / 4034 chunks / 248 sources，模型标识 `@cf/baai/bge-m3`。固定 10 题在现有索引上运行 lexical/vector/hybrid，topK 5/10/15 的 vector 与 hybrid 命中率均为 0.8，关键词覆盖率分别为 0.6333/0.6333/0.7；lexical 为 0。HNSW 与 exact Top-5 一致 8/10，q1/q5 存在排序差异。原始 JSON 与可读报告见 `evidence/2026-08-27-real-evaluation.{json,md}`。
- 2026-08-27 生产部署监听：`dpl_EMX9s3AZthx4MveQdgaT8gn8rq7L` 从 Queued → Building → Ready，checkout SHA `4b066da`；Vercel build log 含 Nitro `nodejs22.x`、`.vercel/output` 搬运和 `Deployment completed`。
- 2026-08-27 兼容性修复：根 `package.json` 增加 `pnpm.overrides.nuxt-og-image=5.1.9`，撤销 `ai-vue-doc` 中临时的 `prerender.ignore`/`ogImage.enabled=false`；`pnpm why` 验证 Nuxt 3 线 h3 为 1.15.11，targeted build 与根级 `pnpm run docs:build` 均退出码 0，9/9 tasks successful。证据见 `evidence/2026-08-27-build.md`。

## 4. 下一步

1. 继续 `2.2.3`：为 300/30/5、500/50/10、800/100/15 建立独立重切分/重嵌入的可复核对照，不能用仅改变 topK 的结果替代。
2. 完成 `2.2.4`：fresh docs build、Git 集成部署回归，并在最新 Production alias 上用 Google Chrome 复测 search/chat、来源跳转与停止保留。
