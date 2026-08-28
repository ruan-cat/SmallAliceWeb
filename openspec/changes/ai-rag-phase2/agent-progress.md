# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-28；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：18 / 26 已完成；`2.2.3` 与 `2.2.4` 均已完成并勾选，最新 main SHA `485655d` 的 Vercel Production 与 Chrome/CDP 验收均有证据。
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
- 2026-08-27 最新 Production deployment：docs `dpl_B1V1BPQX9Ks4XY3JvubPenrFV8Uc`（alias `https://drill.ruan-cat.com`）与 Nitro `dpl_Hyo28XnojzmAwGP4CszBPss7KEfY` 均 READY，Vercel 日志显示 checkout `06772c7`、构建完成与 `Deployment completed`；`vercel@59.5.0` 可读取状态。agent-browser headed/auto-connect 仍因本机 Chrome 未暴露 CDP 且启动 exit code 3 失败，故 `2.2.4` 浏览器门禁保持未完成。
- 2026-08-27 参数评测暂停点：新增 `scripts/run-parameter-evaluation.ts`，使用 PostgreSQL TEMP TABLE 隔离三档参数；本地预检为 300/30/5=6303 chunks、500/50/10=6034、800/100/15=5960。真实运行在 300/30 档处理约 2500/6289 个非空 chunks 后收到 Cloudflare embedding HTTP 400；已确认 14 个空白 chunk 并跳过，正式 `documents/chunks` 表未写入。因用户额度原因暂停，不勾选 `2.2.3`。

## 4. 下一步

1. 继续 `2.2.3`：为 300/30/5、500/50/10、800/100/15 建立独立重切分/重嵌入的可复核对照，不能用仅改变 topK 的结果替代。
2. 完成 `2.2.4`：fresh docs build、Git 集成部署回归，并在最新 Production alias 上用 Google Chrome 复测 search/chat、来源跳转与停止保留。

## 5. 暂停与恢复

- 暂停原因：用户因 Cloudflare embedding 额度暂时不足，主动暂停真实参数评测；本次暂停不代表 `2.2.3` 或 `2.2.4` 完成。
- 恢复入口：先读取本节、`tasks.md` 和 `scripts/run-parameter-evaluation.ts`，确认额度后再继续；不要重做已通过的本地完整构建和 Vercel READY 核验。
- 评测恢复前置：先为 Cloudflare HTTP 400 增加/取得脱敏错误体或确认单批输入大小限制，再决定批次大小；继续使用 PostgreSQL TEMP TABLE，禁止写入正式 `documents`/`chunks`。
- 部署工具纪律：使用本机全局 `vercel --version`（当前已验证 `58.7.1`）和 `vercel inspect`；禁止为状态监听执行 `pnpm dlx vercel@latest`。

## 6. 2026-08-28 继续执行 checkpoint

- 重新绑定 Memorix 会话 `sess-mtcu3pli-cmhk4j`，恢复卡确认当前唯一未完成执行项仍为 `2.2.3` 与 `2.2.4`。
- `vercel inspect https://drill.ruan-cat.com --json` 新鲜回读：docs Production deployment `dpl_BnWrgimowR8U7oYKP9aNPsZiAy7T` 为 `READY`，alias 含 `drill.ruan-cat.com`，构建命令为 `pnpm run build`、Node `22.x`、输出目录 `docs/.vitepress/dist`。
- 两次 `agent_browser_open`（headed 与 headless）均在约 60 秒内无响应，已终止；本轮没有新增真实浏览器证据，故不得勾选 `2.2.4`。
- 新鲜工件校验：`pnpm dlx @fission-ai/openspec@1.10.0 validate ai-rag-phase2 --strict` 通过，输出 `Change 'ai-rag-phase2' is valid`。
- 2026-08-28 embedding 诊断：`bge-m3` 单条中文请求返回 `ok=true`、1024 维；此前 400 不是账户完全不可用的证据。
- 2026-08-28 小样本对照：固定 50 chunks/12 题，bge-m3 与 qwen3 均成功；qwen3 vector Hit@5 为 9/12、bge-m3 为 8/12，hybrid 指标相同。证据见 `evidence/2026-08-28-embedding-{diagnosis,model-smoke}.{md,json}`；该结果作为模型候选参考，不触发全量迁移。
- 2026-08-28 批量传参改进：新增 `createAdaptiveEmbeddings`，评测默认 25 条串行批次；遇 HTTP 400/413 且批次大于 1 时自动二分，单条错误原样抛出并保留脱敏码/message。自适应分批测试与后续三档全量评测均通过。
- 2026-08-28 三档真实评测与 HNSW/exact 对照完成：300/30/5、500/50/10、800/100/15 分别处理 6289、6034、5946 个非空 chunks，均无 400/413；HNSW/exact Top-5 一致率为 8/10、9/10、9/10，`2.2.3` 已按证据勾选完成。证据见 `evidence/2026-08-28-real-parameter-evaluation.md` 与 JSON。

## 7. 生产部署监听 SOP（必须执行到底）

- `git push origin main` 后，先用全局 `vercel ls small-alice-web-odse --prod --json` 找到 `meta.githubCommitSha` 等于当前 main HEAD 的 deployment，再用 `vercel inspect <deployment-url> --json` 或 `vercel inspect <deployment-url> --wait --json` 监听状态。
- `QUEUED`/`BUILDING` 期间只记录状态和时间，不打开旧 alias 做验收；只有同 SHA deployment 变为 `READY` 且 alias 已更新，才进入 agent-browser Chrome/CDP 测试。
- agent-browser Windows 启动必须带 `--args "--no-sandbox"`；浏览器验证顺序固定为页面加载 → `/v1/search` → `/v1/chat` 流式响应 → 停止后内容保留 → 来源链接跳转。每一步都要保存输出或截图证据。
- 本次恢复点已闭环：main SHA `a62f896` 对应 deployment `dpl_2svy5ahawCbShRYtsrswuKU7xzH5` 已 READY，Chrome/CDP 生产验收已完成。
