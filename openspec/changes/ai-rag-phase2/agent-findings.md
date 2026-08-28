# 二期 AI RAG 发现与风险

## 1. 当前有效发现

- **resolved**：先前把 `/v1/chat/completions` 的无 token/error 误判为上游不支持 streaming。当前 `@ai-sdk/openai@1.3.22` 已内置 Responses provider 与 SSE 解析；本轮受控真实 SDK fetch 证明 `provider.responses()` 请求 `/v1/responses` 并处理 `response.output_text.delta`。禁止恢复 Chat Completions 探测或手写重复 parser。
- **resolved**：环境纠偏后的 Production、直接上游最小请求、真实浏览器三条路径曾复现 `api.code-tab.com /v1/responses + gpt-5.6-luna + stream:true` 无 HTTP/SSE 事件直至客户端 abort（60 秒 / 45 秒 / 约 52.5 秒）。该结论只属于旧 Responses 历史证据，不得外推到 Anthropic Messages，也不得恢复同类重复探测。
- **resolved**：最新 API Git deployment 可能尚未接管自定义域名 alias，且 deployment URL 启用 Vercel Protection。2026-08-25 `vercel inspect` 确认 Production deployment Ready，正式自定义域名 alias 已指向该 deployment；后续验收仍先核对 SHA、Ready 与 alias。
- **resolved**：首轮 SHA `412e553` 已部署正确 Responses 代码，但 Production runtime 仍解析旧 `NITRO_CHAT_MODEL=gpt-4o-mini`，日志报该模型不受当前账户组支持。已在正确 Nitro 项目对齐 Production `NITRO_BASE_URL` 与 `NITRO_CHAT_MODEL=gpt-5.6-luna`，保留 API key；必须通过新 Git deployment 验证环境变更生效。
- **resolved**：独立 API 域名的 JSON POST preflight 曾为 404；CORS middleware 后 Production `OPTIONS /v1/chat` 为 204，`Access-Control-Allow-Origin: *`。
- **resolved**：真实 PostgreSQL 驱动把 JSON 数组列作为字符串返回；仅解析合法 JSON 字符串数组后，Development search/chat 恢复真实 200。
- **resolved**：pooled PostgreSQL session 会使 advisory lock 可重入；同步改用 `NITRO_SYNC_DATABASE_URL` 的独立 non-pooled client，并已有真实 409 证据。
- **resolved**：`markstream-vue@1.0.8` 的内置 Shiki renderer 即使补齐 optional peers 仍回退安全 `<pre>`；维持单一 markstream 默认渲染，不安装独立 Shiki stream。
- **resolved**：本地 CLI 直接 import Nitro plugin 会触发 Nitro stub 警告；runtime builder 已迁至 `server/runtime/rag-runtime.ts`，HTTP plugin 与 `rag:sync` / `rag:watch` 共用该模块，CLI 无配置时仅返回 JSON 配置错误。
- **active**：固定题集真实基线使用当前 partial corpus（20 documents / 231 chunks）时，lexical 10 题全空，vector/hybrid 均为 8/10、平均关键词覆盖率 0.70；hybrid 未获得词法增益。必须在完整 corpus 与 300/500/800 三组独立重嵌入结果上复测后才能完成 §2.2.3。
- **active**：双协议设计已获用户确认。公开配置进入类型化注册表，激活 provider 为 Anthropic；密钥只来自 `NITRO_OPENAI_API_KEY` 与 `NITRO_ANTHROPIC_API_KEY`。
- **resolved**：此前缺少 `NITRO_ANTHROPIC_API_KEY` 的阻塞已解除；key 已通过 stdin 写入目标 Vercel 项目，未回显到仓库文件。
- **resolved**：用户已明确授权统一安全降级；`NITRO_ANTHROPIC_API_KEY` 已在 Vercel Production、Preview、Development 三环境重接为 Non-sensitive，`vercel env ls` 已逐环境回读确认。其他数据库/平台密钥未降级；该变更不改变真实 Anthropic 上游事件时间线门禁。
- **resolved**：真实直连验证已完成。Luna Responses 在 119.063s 收到首个文本 delta、119.098s `response.completed`；Anthropic Messages 在 3.790s 收到 `message_start`、5.100s 首个文本 delta、5.211s `message_stop`，请求均 HTTP 200，未触发 420s 硬上限。
- **resolved**：当前 `openspec` CLI 不在 PATH；已用 `pnpm dlx @fission-ai/openspec@1.10.0 validate ai-rag-phase2 --strict` 对当前工件复核通过。
- **resolved**：生产 `/v1/chat` 已返回 AI SDK Data Stream 文本帧并以 `finishReason: stop` 收敛；真实上游 Anthropic 事件时间线已通过本地直接请求取得。剩余门禁转入 `2.1.4` 的生产浏览器停止与来源跳转。
- **resolved**：三环境 `NITRO_ANTHROPIC_API_KEY` 已统一为 Non-sensitive 并逐环境回读；首次 401 由本地 `.env.local` 引号解析错误导致，修正解析后直连请求 HTTP 200 且事件完整，不得将初次 401 解释为上游协议失败。
- **active**：agent-browser 生产页面已验证 `/v1/chat` 流式回答、停止按钮和停止后内容保留；来源以内联 `reference-node` 呈现，但点击无导航且 DOM 没有 `.ai-chat__source`，来源跳转失败。需修复来源帧到 UI 链接的桥接后再重跑 2.1.4。
- **active**：Google Chrome 扩展已连接并复现同一来源问题：`.reference-node` 数量为 1、`.ai-chat__source` 数量为 0，点击后 URL 仍为 `https://drill.ruan-cat.com/`。本地 HTTP 回归 31/31 通过，只证明嵌套帧兼容逻辑，尚未证明真实浏览器消息状态桥接修复。
- **active**：Production Git deployment `dpl_6beFTJ9U1e3MR2AH4QwqoyaEDyxb` 对应 main SHA `e30bb8f731c16dd3462a866c3bf49114b12aac4e`，状态长时间为 `QUEUED` 且无 build log；未 READY 前禁止把 Production alias 或浏览器修复状态标记为完成。
- **active**：2026-08-28 `agent_browser_open` headed/headless 两次均无响应并在约 60 秒后终止；这是本机浏览器自动化启动门禁失败，不是生产页面通过或失败的功能结论。后续仍需使用可用的 headed Chrome/CDP 重新取得来源跳转、停止保留与网络证据。
- **active**：2026-08-28 单条 `bge-m3` 中文 embedding 诊断返回 1024 维成功；Cloudflare 额度并非完全耗尽。50 chunks/12 题对照中 qwen3 vector Hit@5=9/12、bge-m3=8/12，但 hybrid 无提升，样本不足以触发全量迁移。后续应扩大代表性题集，并继续保留正式表隔离。
- **active**：批量评测原先固定 100 条请求，可能触发接口 400。现已改为默认 25 条串行批次，并对 400/413 自动二分；该策略通过 96 个 API 测试与 typecheck，但真实全量评测尚未证明不再触发错误。
- **resolved**：2026-08-28 三档全量参数评测均完成且无 400/413；已在 TEMP TABLE 建 HNSW 并完成 exact Top-5 对照，一致率为 8/10、9/10、9/10，`2.2.3` 验收证据齐全。
- **resolved**：生产部署已按全局 `vercel ls --prod --json` 按 main SHA 定位，并由 `vercel inspect --wait --json` 监听至 READY；`485655d` 对应 `dpl_5xAkUYwZYae94cFCAoVRbL7bjwbH` 已完成 Chrome/CDP 生产验收。
- **resolved**：2026-08-28 新 Production 浏览器证据通过：页面加载、`/v1/search` HTTP 200、`/v1/chat` 流式回答、停止后内容/来源保留、来源锚点跳转均通过；截图与细节见 `evidence/2026-08-28-production-browser.md`。

## 2. 固定约束

- `tasks.md` 是唯一任务源；未验证不能勾选；外部生产/browser 证据不能由本地 test/build 代替。
- 禁止 `neonctl` 与任何包装器；数据库操作先 `pnpm run neon:guard`；禁止输出连接串、密码或 token。
- 正式数据资源固定为 Neon `patient-cloud-43432277` / `neondb`，不得创建第二个同用途资源。
- 文档站 Production 只由 `main` Git Integration 触发；禁止用本地 Vercel 上传替代。保留用户的 `prompts/index.md` 改动。
- 禁止恢复旧 superpowers 任务台账、独立 Markdown parser/打字机、第二聊天 UI 或第二 Shiki 流渲染链。
