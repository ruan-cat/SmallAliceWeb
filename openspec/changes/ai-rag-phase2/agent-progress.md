# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-24；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：14 / 25 已完成。当前主阻塞是 §2.1.4 生产浏览器流式闭环；§2.2.1 与 §2.2.2 已完成。
- 工作分支：`dev`；`origin/main` 当前为 `2c3d666`；用户既有 `prompts/index.md` 未触碰。

## 2. 已完成的最近 checkpoint

- §2.1.0b：Cloudflare BGE-M3 单条与批量 embedding 均为 1024 维有限数值。
- §2.1.1 / §2.1.2：Development Neon 的 160 chunks、HNSW 对精确检索一致、真实同步/回滚与 advisory-lock 409 已验证。
- §2.1.3：Development Nitro 的真实 search/chat 返回来源 DTO 与 data-stream。
- §2.2.1：`markstream-vue@1.0.8` 的 `codeRenderer="shiki"` 在可见 viewport 挂载测试中仍回退为安全 `<pre>`；不接入 `@shikijs/stream` 或第二渲染链。`ai-vue` 20 tests、typecheck、build 通过。
- §2.2.2：本地 runtime 的 `rag:sync` / `rag:watch` 与 Nitro plugin 共用同一 builder；真实 CLI run 扫描 290 文件、写入 71 chunks，当前数据库 20 documents / 231 chunks。
- §2.2.3 基线：10 题真实评估中 lexical 为 0/10，vector/hybrid 均为 8/10、平均关键词覆盖率 0.70；当前为 partial corpus，尚未完成参数对比与调优。

## 3. 生产证据与阻塞

- `main@05e7887` 的 API CORS 预检为 204，生产 `/v1/chat` 为 200 data-stream，Chrome 文档站已真实渲染 5 个 VitePress 来源链接。
- 同一请求在来源帧之后收到 `An error occurred.`，没有助手内容；因此没有 `stop()`/已收内容保留的生产证据，§2.1.4 不得勾选。
- 同一已授权配置的 `streamText` smoke 15 秒无 token/错误而超时；历史 `generateText` 成功，模型目录请求为 403。根因收敛为当前上游没有可用 streaming。
- `d019749` 已将不泄密的 `streamText.onError` 观测点同步 main；最新 deployment URL 仍受 Vercel Protection，正式自定义域名 alias 必须在下一轮验收前确认指向该 SHA。

## 4. 下一步

- 用户提供或在 Vercel 配置一个支持 OpenAI-compatible SSE streaming 的 `NITRO_BASE_URL`、`NITRO_OPENAI_API_KEY`、`NITRO_CHAT_MODEL` 后：等待 main Git deployment Ready，确认 alias SHA，再用 Chrome 完成 §2.1.4 的首段、停止、保留内容、状态收敛与来源跳转。
- 随后继续 §2.2.2、§2.2.3、§2.2.4 与作品展示任务；禁止用 `generateText` fallback 冒充流式验收。
