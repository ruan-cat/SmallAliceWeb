# 二期 AI RAG 发现与风险

## 1. 当前有效发现

- **resolved**：先前把 `/v1/chat/completions` 的无 token/error 误判为上游不支持 streaming。当前 `@ai-sdk/openai@1.3.22` 已内置 Responses provider 与 SSE 解析；本轮受控真实 SDK fetch 证明 `provider.responses()` 请求 `/v1/responses` 并处理 `response.output_text.delta`。禁止恢复 Chat Completions 探测或手写重复 parser。
- **active**：§2.1.4 的本地 Responses/abort 实现已验证并进入本轮授权的提交/部署流程，但尚无生产浏览器 Network、首段、停止、已收内容保留、状态收敛与来源跳转截图；这些外部证据前不得勾选任务。
- **resolved**：最新 API Git deployment 可能尚未接管自定义域名 alias，且 deployment URL 启用 Vercel Protection。2026-08-25 `vercel inspect` 确认 Production deployment Ready，正式自定义域名 alias 已指向该 deployment；后续验收仍先核对 SHA、Ready 与 alias。
- **resolved**：首轮 SHA `412e553` 已部署正确 Responses 代码，但 Production runtime 仍解析旧 `NITRO_CHAT_MODEL=gpt-4o-mini`，日志报该模型不受当前账户组支持。已在正确 Nitro 项目对齐 Production `NITRO_BASE_URL` 与 `NITRO_CHAT_MODEL=gpt-5.6-luna`，保留 API key；必须通过新 Git deployment 验证环境变更生效。
- **resolved**：独立 API 域名的 JSON POST preflight 曾为 404；CORS middleware 后 Production `OPTIONS /v1/chat` 为 204，`Access-Control-Allow-Origin: *`。
- **resolved**：真实 PostgreSQL 驱动把 JSON 数组列作为字符串返回；仅解析合法 JSON 字符串数组后，Development search/chat 恢复真实 200。
- **resolved**：pooled PostgreSQL session 会使 advisory lock 可重入；同步改用 `NITRO_SYNC_DATABASE_URL` 的独立 non-pooled client，并已有真实 409 证据。
- **resolved**：`markstream-vue@1.0.8` 的内置 Shiki renderer 即使补齐 optional peers 仍回退安全 `<pre>`；维持单一 markstream 默认渲染，不安装独立 Shiki stream。
- **resolved**：本地 CLI 直接 import Nitro plugin 会触发 Nitro stub 警告；runtime builder 已迁至 `server/runtime/rag-runtime.ts`，HTTP plugin 与 `rag:sync` / `rag:watch` 共用该模块，CLI 无配置时仅返回 JSON 配置错误。
- **active**：固定题集真实基线使用当前 partial corpus（20 documents / 231 chunks）时，lexical 10 题全空，vector/hybrid 均为 8/10、平均关键词覆盖率 0.70；hybrid 未获得词法增益。必须在完整 corpus 与 300/500/800 三组独立重嵌入结果上复测后才能完成 §2.2.3。

## 2. 固定约束

- `tasks.md` 是唯一任务源；未验证不能勾选；外部生产/browser 证据不能由本地 test/build 代替。
- 禁止 `neonctl` 与任何包装器；数据库操作先 `pnpm run neon:guard`；禁止输出连接串、密码或 token。
- 正式数据资源固定为 Neon `patient-cloud-43432277` / `neondb`，不得创建第二个同用途资源。
- 文档站 Production 只由 `main` Git Integration 触发；禁止用本地 Vercel 上传替代。保留用户的 `prompts/index.md` 改动。
- 禁止恢复旧 superpowers 任务台账、独立 Markdown parser/打字机、第二聊天 UI 或第二 Shiki 流渲染链。
