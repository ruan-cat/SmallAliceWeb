# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-25；Change：`ai-rag-phase2`；唯一任务源：`tasks.md`。
- 进度：14 / 25 已完成。§2.1.4 的 Responses 代码、Production deployment、停止状态与来源锚点均已验证；上游三次无 SSE 事件达到硬暂停门槛，等待供应商恢复或提供可流式同协议模型。§2.2.1 与 §2.2.2 已完成。
- 工作分支：`dev`；本轮保留用户既有 `prompts/index.md` 改动，不纳入 Responses 提交。

## 2. 已完成的最近 checkpoint

- §2.1.0b：Cloudflare BGE-M3 单条与批量 embedding 均为 1024 维有限数值。
- §2.1.1 / §2.1.2：Development Neon 的 160 chunks、HNSW 对精确检索一致、真实同步/回滚与 advisory-lock 409 已验证。
- §2.1.3：Development Nitro 的真实 search/chat 返回来源 DTO 与 data-stream。
- §2.2.1：`markstream-vue@1.0.8` 的 `codeRenderer="shiki"` 在可见 viewport 挂载测试中仍回退为安全 `<pre>`；不接入 `@shikijs/stream` 或第二渲染链。`ai-vue` 20 tests、typecheck、build 通过。
- §2.2.2：本地 runtime 的 `rag:sync` / `rag:watch` 与 Nitro plugin 共用同一 builder；真实 CLI run 扫描 290 文件、写入 71 chunks，当前数据库 20 documents / 231 chunks。
- §2.2.3 基线：10 题真实评估中 lexical 为 0/10，vector/hybrid 均为 8/10、平均关键词覆盖率 0.70；当前为 partial corpus，尚未完成参数对比与调优。

## 3. §2.1.4 本地实现与剩余门禁

- 根因已纠正：旧实现使用 `provider(model)` 走 `/v1/chat/completions`；当前依赖本身支持 `provider.responses(model)`，无需升级或手写 SSE parser。
- 本轮实现：Nitro chat 改用 Responses provider；H3 `event.req.signal` 通过 `ChatStreamRequest.abortSignal` 传入 `streamText`，使浏览器 `stop()` 具备上游取消链路。
- 受控 SDK 证据：实际 fetch URL 为 `https://api.code-tab.com/v1/responses`；body 含 `model: gpt-5.6-luna`、`input`、`stream: true`；两个 `response.output_text.delta` 转为 data-stream，来源帧与 `x-vercel-ai-data-stream: v1` 保留。
- 验证：API 22 文件 / 82 用例通过；typecheck、`build:vercel`、`openspec validate ai-rag-phase2 --strict` 通过。
- Production 首轮证据：SHA `412e553` 的文档站与 Nitro deployment 均 Ready 且正式 alias 正确；`/v1/chat` 仍返回 error frame，runtime 日志证明 Nitro Production 使用旧模型 `gpt-4o-mini`。
- 配置与重部署：已在正确 Nitro Production 对齐 `NITRO_BASE_URL=https://api.code-tab.com/v1`、`NITRO_CHAT_MODEL=gpt-5.6-luna`，保留 API key；`main@0abcd39` deployment `dpl_FucQX1HR6F3uWLNw2qcg6B48a2dt` Ready，正式 alias 指向正确。
- 浏览器证据：真实页面显示 5 个来源和停止入口；停止后约 52.5 秒的请求结束，Loading 消失、输入恢复、来源保留；来源 hash 对应 DOM id 存在并滚动到目标。
- 当前阻塞：Production 60 秒、直接上游 45 秒、真实浏览器约 52.5 秒三次均无 Responses SSE 文本增量或终止事件，已按硬暂停规则停止。§2.1.4 保持未勾选。

## 4. 下一步

- 等待 `api.code-tab.com` 供应商恢复 `gpt-5.6-luna` Responses SSE，或提供可返回事件的同协议模型；新外部条件出现后只复验一次首段与终止事件。
- 阻塞解除后勾选 §2.1.4，再继续 §2.2.3 的完整 corpus 与 300/500/800 参数组真实评估。
