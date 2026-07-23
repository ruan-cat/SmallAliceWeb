# AI 对话组件三包一期发现与风险

## 1. 已确认决策

- 包数量按三个明确包名落地：`@ruan-cat-drill-doc/ai-vue`、`@ruan-cat-drill-doc/ai-vue-doc`、`@ruan-cat-drill-doc/ai-vitepress-plugins`。
- 一期只做 mock AI 对话前端壳，不接真实 LLM、RAG、Nitro 后端、LangGraph、向量库、`baseUrl`、API key 或模型配置。
- Nuxt 与 VitePress 要求 SSR shell 正常；AI 对话主体接受 client-only。
- VitePress 集成定位是 theme/client Vue plugin，不是 Vite 构建期插件。
- `tasks.md` 是后续唯一可执行任务源，superpowers plan 只能作为历史参考，不能作为第二任务源。

## 2. 已知风险

- 当前工作区已有用户 dirty 文件 `prompts/index.md`，本 change 不应修改、暂存或回滚该文件。
- Nuxt 与 VitePress SSR 构建可能遇到 workspace 包、Element Plus、`vue-element-plus-x`、`@vueuse`、`vue-demi`、`entities` 外部化问题；优先参考 eams Nuxt 配置收敛 `noExternal` 与 `externals.inline`。
- 如果在实现阶段提前加入 `@ai-sdk/vue`、RAG、Nitro route、模型配置或真实请求，会违反一期边界。
- `AiChatFloatingButton` 和 VitePress shell 必须避免顶层读取浏览器 API，否则 SSR 构建会失败。
- 根 VitePress preset theme 的 Layout 包装方式需要读实际类型和构建错误后再最小修改，不能重写整套主题。

## 3. 禁止重复路径

- 不要再只保留 `.openspec.yaml` 或单个干瘪文件后声明 OpenSpec 长任务已建立。
- 不要把 `docs/superpowers/plans/2026-07-22-ai-chat-packages.md` 当作后续执行的主任务源。
- 不要在 change 根目录新增日期化过程报告或临时 markdown；根目录只保留 OpenSpec 核心工件、`.openspec.yaml`、`agent-progress.md`、`agent-findings.md`。
- 不要在没有验证证据时把 `tasks.md` 中任意任务改成 `[x]`。
- 不要触碰 `prompts/index.md`，除非用户另行明确要求。

## 4. 待复核项

- OpenSpec strict validate 是否通过。
- `proposal.md` 中 `ai-chat-packages` capability 是否与 `specs/ai-chat-packages/spec.md` 对齐。
- `tasks.md` 是否满足文件级任务粒度、试点批次、主体任务和验证任务要求。
- 后续实施阶段是否持续维护 `agent-progress.md` 和 `agent-findings.md`。
