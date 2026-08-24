# AI 对话组件三包一期技术设计

## 1. Context

当前仓库 `@ruan-cat/drill-doc` 已经是 `pnpm` workspace，但 `pnpm-workspace.yaml` 目前只注册 `scripts/*`。根站点是 VitePress 文档项目，主题入口在 `docs/.vitepress/theme/index.ts`，配置入口在 `docs/.vitepress/config.mts`。

用户要求参考 `D:\code\ruan-cat\eams-component-lib` 的组件库和 Nuxt 文档站体系，特别是 `vue-element-cui-nuxt` 的 `nuxt.config.ts`、`app.config.ts`、`tailwind.config.js`、`workspace-aliases.ts` 和 Nuxt plugin 写法。该参考项目的核心经验是：Nuxt 文档站直接 alias 到组件库源码和样式入口，并通过 `vite.ssr.noExternal` 与 `nitro.externals.inline` 处理 Element Plus、workspace 包和 `@vueuse` 依赖树的 SSR 外部化问题。

本变更只建立三包基础架构，不进入真实 AI 后端能力。用户已经确认一期接受 client-only 策略，`ai-vue` 一期只做 mock AI 对话前端壳。

## 2. Goals / Non-Goals

**Goals:**

- 新增 `@ruan-cat-drill-doc/ai-vue`，提供可在 Vue、Nuxt、VitePress 中复用的 AI 对话组件和 mock 交互状态。
- 新增 `@ruan-cat-drill-doc/ai-vue-doc`，用 Nuxt 与 `shadcn-docs-nuxt` 展示组件库，并证明 SSR shell 能构建、preview 能访问。
- 新增 `@ruan-cat-drill-doc/ai-vitepress-plugins`，提供 VitePress theme/client 插件，让根文档右下角出现 AI 圆形入口按钮。
- 在根 VitePress 项目导入该插件，并通过浏览器验证按钮打开、输入、mock 回复链路。
- 保持 OpenSpec 长任务可恢复：后续执行只以 `tasks.md` 为唯一任务源，并持续维护 `agent-progress.md` 与 `agent-findings.md`。

**Non-Goals:**

- 不实现真实 LLM 请求、RAG 检索、Nitro API、LangGraph、向量库、Embedding、`baseUrl`、API key 或模型选择配置。
- 不把 `@ai-sdk/vue`、`markstream-vue`、`@shikijs/stream`、`ai-elements-vue` 同时接入一期实现。
- 不把 VitePress 插件设计成 Vite 构建期插件；一期定位为 VitePress theme/client 侧 Vue 插件。
- 不重写根 VitePress 主题系统，只在现有 preset theme 外层做最小兼容包装。

## 3. Decisions

### 3.1. 三包而不是两个子包

用户原始描述同时出现“两个子包”和三个明确包名。以明确包名为准，落地三个包：`ai-vue`、`ai-vue-doc`、`ai-vitepress-plugins`。

替代方案是把 VitePress 插件放进 `ai-vue` 或文档站包内，但这会混淆组件能力源、Nuxt 文档职责和 VitePress 集成职责，不利于后续单独演进插件能力。

### 3.2. `ai-vue` 是唯一组件能力源

`@ruan-cat-drill-doc/ai-vue` 暴露 `AiChat`、`AiChatFloatingButton`、`useMockAiChat`、类型、样式入口和默认 Vue plugin。Nuxt 文档站与 VitePress 插件只能消费它，不复制对话组件实现。

替代方案是在 VitePress 插件包中再写一套悬浮对话组件，但这会产生双实现和双样式维护成本，后续接入真实 AI 能力时容易分裂。

### 3.3. 一期 mock AI 对话前端壳

一期 mock responder 只做本地延迟回复和 loading 状态，不发起网络请求。消息 ID、输入状态、消息追加和发送禁用状态由 composable 管理。

替代方案是预留 `baseUrl`、provider、model 等配置，但用户已明确这些属于下一阶段。提前设计真实请求配置会扩大范围，并让当前 SSR 验收混入后端不确定性。

### 3.4. SSR shell 加 client-only 对话主体

Nuxt 与 VitePress 必须能完成 SSR 构建，但 AI 对话主体允许 client-only。组件顶层模块不得访问 `window`、`document`、`localStorage`、`navigator`；浏览器状态放到 `onMounted` 后处理。

Nuxt demo 使用 `<ClientOnly>` 包裹 `AiChat`。VitePress 插件 shell 在客户端 mounted 后再显示 `AiChatFloatingButton`。

### 3.5. Nuxt 文档站大幅复用 eams 配置

`ai-vue-doc` 的 `package.json`、`nuxt.config.ts`、`app.config.ts`、`tailwind.config.js` 应优先照搬 eams Nuxt 文档站的结构，再替换包名、站点信息和 alias。

必须保留的策略包括：

- `extends: ["shadcn-docs-nuxt"]`。
- `predev`、`prebuild`、`postinstall` 执行 `nuxt prepare`。
- workspace alias 同时映射 `@ruan-cat-drill-doc/ai-vue` 和 `@ruan-cat-drill-doc/ai-vue/styles`。
- `tailwind.config.js` 扫描 `../../node_modules/shadcn-docs-nuxt/**/*.{vue,js,ts,mjs}`。
- `vite.ssr.noExternal` 与 `nitro.externals.inline` 覆盖 workspace 包、Element Plus、`vue-element-plus-x`、`@vueuse`、`vue-demi`、`entities` 等 SSR 风险依赖。

### 3.6. VitePress 插件走 theme/client plugin

`@ruan-cat-drill-doc/ai-vitepress-plugins` 暴露 `.`、`./client`、`./client/style.css` 三类入口。根 VitePress theme 使用 `enhanceApp({ app })` 安装客户端插件，并通过 Layout slot 或 wrapper 在 `layout-bottom` 注入 `AiChatVitePressShell`。

如果现有 `defineRuancatPresetTheme()` 返回的 Layout 不方便直接包装，执行阶段应先读实际类型和构建错误，再选择最小可行方式，不重写整个主题。

## 4. Risks / Trade-offs

- SSR 外部化风险：workspace 包、Element Plus、`vue-element-plus-x`、`@vueuse` 可能在 Nuxt 或 VitePress SSR 构建中被错误 external。缓解方式是在具体构建失败时补充 `vite.ssr.noExternal` 与 `nitro.externals.inline`，优先参考 eams 的已验证名单。
- 依赖膨胀风险：AI 相关库很多，但一期只需要 mock 前端壳。缓解方式是优先使用 Vue、Element Plus 和 `vue-element-plus-x`，不把 `@ai-sdk/vue`、RAG 或流式 Markdown 依赖提前接进来。
- hydration mismatch 风险：时间、随机数、mounted 状态或滚动行为可能造成 SSR 与客户端不一致。缓解方式是对话主体 client-only，顶层模块不读取浏览器 API。
- 根主题接入风险：`@ruan-cat/vitepress-preset-config/theme` 的返回结构可能与默认 VitePress theme 不完全一致。缓解方式是先保留 base theme，再只包装 `enhanceApp` 和必要 Layout slot。
- 用户已有 dirty 文件风险：当前工作区已有 `prompts/index.md` 修改。缓解方式是本变更不读取、不修改、不暂存该文件。

## 5. Migration Plan

### 5.1. 实施步骤

1. 扩展 workspace，让 `packages/*` 可被 pnpm 识别。
2. 先实现 `ai-vue` 的 mock 对话核心、样式、plugin 和测试，跑通包级 test/typecheck/build。
3. 基于 eams Nuxt 文档站创建 `ai-vue-doc`，跑通 build 和 preview。
4. 创建 `ai-vitepress-plugins`，消费 `ai-vue` 并暴露 VitePress client 插件。
5. 在根 VitePress 主题和配置中接入插件，跑通 docs build/dev。
6. 用浏览器完成 Nuxt preview 和 VitePress dev 的交互验收。

### 5.2. 回滚策略

本变更新增包和局部配置为主。若后续实现阶段出现不可控构建风险，可以移除根 VitePress theme 接入代码，同时保留三个包的独立构建验证；再根据 `agent-findings.md` 中的失败记录收缩任务或拆分新的 OpenSpec change。

## 6. Open Questions

- 后续真实 AI 阶段选择哪条链路：`@ai-sdk/vue`、Nuxt/Nitro API、LangGraph.js、RAG 服务或独立后端，需要新 OpenSpec change 决策。
- VitePress 插件是否需要导出构建期 Vite 插件或 Markdown transform 能力，当前阶段不做。
- 对话 UI 是否最终采用 Element Plus X、shadcn-vue AI elements，还是混合策略，当前阶段先不混用。
- 后续是否发布到 npm 或只作为 workspace 包消费，当前阶段不配置发布流程。

## 7. References

- VitePress 官方主题扩展文档：`https://vitepress.dev/guide/extending-default-theme`
- Nolebase integrations 仓库：`https://github.com/nolebase/integrations`
- vitepress-plugin-llms 仓库：`https://github.com/okineadev/vitepress-plugin-llms`
- eams Vue 组件库参考：`D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui`
- eams Nuxt 文档站参考：`D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt`
