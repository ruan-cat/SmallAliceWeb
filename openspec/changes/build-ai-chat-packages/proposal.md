## 1. Why

`@ruan-cat/drill-doc` 需要一个可长期演进的 AI 对话能力入口，先把 Vue 组件库、Nuxt 文档站和 VitePress 客户端插件三条链路跑通，后续再接入真实 LLM、RAG 和后端服务。

当前阶段的重点是建立可恢复、可验证的 monorepo 多包基础架构，让 mock AI 对话壳在 Nuxt 与 VitePress 这两类 SSR 场景中都能安全渲染和交互。

## 2. What Changes

- 新增 `@ruan-cat-drill-doc/ai-vue`：暴露 AI 对话业务 Vue 组件、mock 对话 composable、样式入口和 Vue plugin。
- 新增 `@ruan-cat-drill-doc/ai-vue-doc`：基于 Nuxt 与 `shadcn-docs-nuxt` 建立组件库文档站，用于展示并交互验证 `ai-vue`。
- 新增 `@ruan-cat-drill-doc/ai-vitepress-plugins`：提供 VitePress theme/client 插件，在根文档站右下角注入 AI 悬浮按钮和对话面板。
- 修改根 VitePress 项目配置：在 `docs/.vitepress/theme/index.ts` 中安装客户端插件，必要时在 `docs/.vitepress/config.mts` 补充 SSR 兼容配置。
- 修改 workspace 配置：让 `pnpm` 识别 `packages/*` 下新增三包。
- 一期明确不接入真实 LLM、RAG、Nitro 后端、LangGraph、向量库、`baseUrl`、API key 或模型配置。

## 3. Capabilities

### 3.1. New Capabilities

- `ai-chat-packages`: AI 对话组件三包一期能力，覆盖 mock AI 对话 Vue 组件库、Nuxt 文档站、VitePress client 插件和 SSR client-only 使用边界。

### 3.2. Modified Capabilities

无。

## 4. Impact

- 影响根 workspace：`pnpm-workspace.yaml`、`package.json`、`pnpm-lock.yaml`。
- 影响新增包目录：`packages/ai-vue`、`packages/ai-vue-doc`、`packages/ai-vitepress-plugins`。
- 影响根 VitePress 文档站：`docs/.vitepress/theme/index.ts`、`docs/.vitepress/theme/style.css`、`docs/.vitepress/config.mts`。
- 新增前端依赖边界：Vue 3、Element Plus、`vue-element-plus-x`、Nuxt 3、`shadcn-docs-nuxt`、VitePress theme 插件链路。
- 验收需要覆盖包级 build/test、Nuxt build/preview、VitePress build/dev 与浏览器 mock 对话交互。
