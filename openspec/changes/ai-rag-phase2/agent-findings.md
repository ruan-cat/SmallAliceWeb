# 二期 AI RAG 发现与风险

## 1. 当前有效发现

- **active**：当前 chat 上游 `streamText` 无可用 streaming。证据为 Production 来源帧后 error frame、同配置 smoke 15 秒超时、历史 `generateText` 成功、`GET /v1/models` 403。后续动作：用户选择并配置支持 SSE 的模型；不得降级伪造流式或 abort。
- **active**：最新 API Git deployment 可能尚未接管自定义域名 alias，且 deployment URL 启用 Vercel Protection。后续动作：每轮生产验收先用 `vercel inspect` 确认 SHA、Ready 与 alias，再调用正式域名。
- **resolved**：独立 API 域名的 JSON POST preflight 曾为 404；CORS middleware 后 Production `OPTIONS /v1/chat` 为 204，`Access-Control-Allow-Origin: *`。
- **resolved**：真实 PostgreSQL 驱动把 JSON 数组列作为字符串返回；仅解析合法 JSON 字符串数组后，Development search/chat 恢复真实 200。
- **resolved**：pooled PostgreSQL session 会使 advisory lock 可重入；同步改用 `NITRO_SYNC_DATABASE_URL` 的独立 non-pooled client，并已有真实 409 证据。
- **resolved**：`markstream-vue@1.0.8` 的内置 Shiki renderer 即使补齐 optional peers 仍回退安全 `<pre>`；维持单一 markstream 默认渲染，不安装独立 Shiki stream。

## 2. 固定约束

- `tasks.md` 是唯一任务源；未验证不能勾选；外部生产/browser 证据不能由本地 test/build 代替。
- 禁止 `neonctl` 与任何包装器；数据库操作先 `pnpm run neon:guard`；禁止输出连接串、密码或 token。
- 正式数据资源固定为 Neon `patient-cloud-43432277` / `neondb`，不得创建第二个同用途资源。
- 文档站 Production 只由 `main` Git Integration 触发；禁止用本地 Vercel 上传替代。保留用户的 `prompts/index.md` 改动。
- 禁止恢复旧 superpowers 任务台账、独立 Markdown parser/打字机、第二聊天 UI 或第二 Shiki 流渲染链。
