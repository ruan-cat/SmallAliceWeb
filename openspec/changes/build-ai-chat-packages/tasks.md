# AI 对话组件三包一期任务清单

## 1. 试点批次（Pilot Batch）

> 目的：先交付并验证 `ai-vue` 的最小可运行 mock 对话状态闭环，再扩展到组件界面、Nuxt 与 VitePress。
> 完成标准：依次完成运行环境、类型、composable 和单元测试后，`pnpm --filter @ruan-cat-drill-doc/ai-vue test` 与 `pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck` 均通过；试点不得引入真实 LLM、RAG、Nitro 后端、网络请求或浏览器顶层 API。
> 说明：本批次共有八个任务，超过常规 1-3 个任务的建议数量；它们均是运行首个可验证单元所必需的独立文件，不能进一步合并而违反文件级粒度。

### 1.1. 最小运行环境

- [ ] 1.1 [修改] `pnpm-workspace.yaml` - 将 workspace globs 扩展为同时包含 `scripts/*` 和 `packages/*`，保留现有 `onlyBuiltDependencies`，使 `ai-vue` 能被 pnpm 识别。
- [ ] 1.2 [新增] `packages/ai-vue/package.json` - 创建 `@ruan-cat-drill-doc/ai-vue` manifest，声明最小 `test` 与 `typecheck` 脚本及其开发依赖；不在此任务引入组件库构建、真实 AI SDK 或后端依赖。
- [ ] 1.3 [新增] `packages/ai-vue/vitest.config.ts` - 配置 Vitest 与 jsdom 环境，使 mock composable 测试可在 workspace 内执行。
- [ ] 1.4 [新增] `packages/ai-vue/tsconfig.json` - 配置 composable 和测试所需的 TypeScript 编译边界，支持 `vue-tsc --noEmit`。
- [ ] 1.5 [修改] `pnpm-lock.yaml` - 在 `ai-vue` 最小开发依赖声明完成后运行 `pnpm install` 刷新 lockfile，确认无 hard peer dependency error。

### 1.2. 最小可测行为

- [ ] 1.6 [新增] `packages/ai-vue/src/components/ai-chat/types.ts` - 定义 `AiChatRole`、`AiChatMessage`、`AiChatProps`、`AiChatEmits`，确保消息、props 和 emit 类型能被后续组件与测试复用。
- [ ] 1.7 [新增] `packages/ai-vue/src/composables/useMockAiChat.ts` - 实现本地 mock 对话状态、发送禁用、延迟回复和 loading 状态，不访问真实网络或浏览器全局对象。
- [ ] 1.8 [新增] `packages/ai-vue/src/tests/use-mock-ai-chat.test.ts` - 使用 `import { test, describe } from "vitest";` 覆盖初始消息、空输入拒绝、发送后用户消息与 mock assistant 回复追加。

### 1.3. 试点验收门槛

- [ ] 1.9 [修改] `openspec/changes/build-ai-chat-packages/agent-progress.md` - 记录 `1.1-1.8` 的已改文件，以及 `pnpm --filter @ruan-cat-drill-doc/ai-vue test`、`pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck` 的实际输出摘要；两项命令均通过前不得开始主体任务。

## 2. 主体任务（Main Tasks）

> 只有试点验收门槛 `1.9` 具备通过证据后，才能按文件级粒度继续推进。后续执行必须只以本文件作为任务源；发现 SSR 外部化或其他实现遗漏时，先补充具体文件任务、运行 `openspec validate build-ai-chat-packages --strict`，再继续实现。

### 2.1. `ai-vue` 组件库

- [ ] 2.1 [新增] `packages/ai-vue/vite.config.ts` - 配置 Vite library mode、`vite-plugin-dts`、ES/CJS 输出，并 external 掉 Vue、Element Plus、`vue-element-plus-x`。
- [ ] 2.2 [修改] `packages/ai-vue/package.json` - 在试点 manifest 的基础上补充 `build` 脚本、组件构建所需开发依赖和 Element Plus、`vue-element-plus-x` 的 peer dependency 边界，不引入真实 AI SDK 或后端依赖。
- [ ] 2.3 [新增] `packages/ai-vue/src/components/ai-chat/AiChat.vue` - 实现固定尺寸约束的 mock 对话窗口、消息列表、输入框、发送按钮和 responding 状态。
- [ ] 2.4 [新增] `packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue` - 实现右下角圆形入口、打开或关闭 dock 和 client mounted 后渲染策略。
- [ ] 2.5 [新增] `packages/ai-vue/src/components/ai-chat/index.ts` - 导出 `AiChat`、`AiChatFloatingButton` 和类型。
- [ ] 2.6 [新增] `packages/ai-vue/src/components/index.ts` - 汇总导出 AI 对话组件目录。
- [ ] 2.7 [新增] `packages/ai-vue/src/styles/index.scss` - 提供组件库样式入口，定义对话窗口、消息、输入区、悬浮按钮和响应式尺寸。
- [ ] 2.8 [新增] `packages/ai-vue/src/index.ts` - 导出组件、composable、类型、`install(app)` 与默认 Vue plugin，注册 `AiChat` 和 `AiChatFloatingButton`。
- [ ] 2.9 [新增] `packages/ai-vue/src/tests/plugin.test.ts` - 使用 `import { test, describe } from "vitest";` 覆盖默认 plugin 与 `install` 注册组件行为。

### 2.2. Nuxt 组件库文档

- [ ] 2.10 [新增] `packages/ai-vue-doc/package.json` - 创建 `@ruan-cat-drill-doc/ai-vue-doc` manifest，参考 eams Nuxt 文档站保留 `predev`、`prebuild`、`postinstall` 的 `nuxt prepare`。
- [ ] 2.11 [新增] `packages/ai-vue-doc/workspace-aliases.ts` - 建立 `@ruan-cat-drill-doc/ai-vue/styles` 和 `@ruan-cat-drill-doc/ai-vue` 到源码的 alias，样式 alias 放在主入口之前。
- [ ] 2.12 [新增] `packages/ai-vue-doc/nuxt.config.ts` - 参考 eams 配置 `extends: ["shadcn-docs-nuxt"]`、alias、`vite.ssr.noExternal`、`nitro.externals.inline`、i18n、icon 和 Windows trace 兼容项。
- [ ] 2.13 [新增] `packages/ai-vue-doc/app.config.ts` - 配置 `shadcnDocs` 站点名称、说明、导航、GitHub 链接、aside、footer、toc 和 search。
- [ ] 2.14 [新增] `packages/ai-vue-doc/tailwind.config.js` - 参考 eams 配置 Tailwind dark mode、safelist、content 扫描和 `tailwindcss-animate` 插件。
- [ ] 2.15 [新增] `packages/ai-vue-doc/plugins/ai-vue.ts` - 安装 Element Plus、`@ruan-cat-drill-doc/ai-vue` 和组件库样式入口。
- [ ] 2.16 [新增] `packages/ai-vue-doc/assets/css/tailwind.css` - 创建 Nuxt 文档站 Tailwind 样式入口。
- [ ] 2.17 [新增] `packages/ai-vue-doc/assets/css/main.css` - 创建 Nuxt 文档站基础样式入口，避免和组件库样式混写。
- [ ] 2.18 [新增] `packages/ai-vue-doc/content/index.md` - 编写文档站首页，说明一期 mock AI 对话能力和阶段边界。
- [ ] 2.19 [新增] `packages/ai-vue-doc/content/1.getting-started/0.index.md` - 编写快速开始文档，展示安装、样式导入和 `app.use(AiVue)` 使用方式。
- [ ] 2.20 [新增] `packages/ai-vue-doc/content/2.components/1.ai-chat.md` - 编写 `AiChat` 组件文档，包含 props、事件、mock 行为和 client-only 注意事项。
- [ ] 2.21 [新增] `packages/ai-vue-doc/components/content/AiChatBasicDemo.vue` - 使用 `<ClientOnly>` 包裹 `AiChat` demo，验证 Nuxt SSR shell 下的客户端交互。
- [ ] 2.22 [新增] `packages/ai-vue-doc/pages/[...slug].vue` - 建立 `shadcn-docs-nuxt` document driven 页面入口。
- [ ] 2.23 [新增] `packages/ai-vue-doc/shims/debug.ts` - 提供 debug shim，配合 eams Nuxt 配置中的 `debug` alias。

### 2.3. VitePress 插件与根站接入

- [ ] 2.24 [新增] `packages/ai-vitepress-plugins/package.json` - 创建 `@ruan-cat-drill-doc/ai-vitepress-plugins` manifest，暴露 `.`、`./client`、`./client/style.css` 和 `sideEffects` 样式声明，并声明测试与构建脚本。
- [ ] 2.25 [新增] `packages/ai-vitepress-plugins/vite.config.ts` - 配置 Vite library build，输出根入口和 client 入口，并 external Vue 与 `@ruan-cat-drill-doc/ai-vue`。
- [ ] 2.26 [新增] `packages/ai-vitepress-plugins/vitest.config.ts` - 配置插件包的 Vitest 与 jsdom 环境，使 client plugin 注册测试可独立运行。
- [ ] 2.27 [新增] `packages/ai-vitepress-plugins/tsconfig.json` - 配置 VitePress 插件包 TypeScript 编译边界。
- [ ] 2.28 [新增] `packages/ai-vitepress-plugins/src/index.ts` - 导出普通包入口和类型，不在根入口访问浏览器 API。
- [ ] 2.29 [新增] `packages/ai-vitepress-plugins/src/client/types.ts` - 定义 VitePress client 插件可扩展配置类型，保持一期最小配置面。
- [ ] 2.30 [新增] `packages/ai-vitepress-plugins/src/client/components/AiChatVitePressShell.vue` - 在 mounted 后渲染 `AiChatFloatingButton`，作为 VitePress `layout-bottom` 可注入组件。
- [ ] 2.31 [新增] `packages/ai-vitepress-plugins/src/client/index.ts` - 导出 VitePress client Vue plugin，注册 `AiChatVitePressShell`。
- [ ] 2.32 [新增] `packages/ai-vitepress-plugins/src/client/style.css` - 定义 VitePress shell 层样式，只处理插件容器，不复制 `ai-vue` 内部组件样式。
- [ ] 2.33 [新增] `packages/ai-vitepress-plugins/src/tests/plugin.test.ts` - 使用 `import { test, describe } from "vitest";` 覆盖 client plugin 组件注册行为。
- [ ] 2.34 [修改] `docs/.vitepress/theme/index.ts` - 包装现有 `defineRuancatPresetTheme()`，在 `enhanceApp` 中安装 AI VitePress client plugin，并保留原 theme 行为。
- [ ] 2.35 [修改] `docs/.vitepress/theme/style.css` - 仅补充根站 AI 浮层必要样式兜底，不重写现有主题样式。
- [ ] 2.36 [修改] `pnpm-lock.yaml` - 在三个子包的 manifest 及全部依赖声明完成后运行 `pnpm install` 刷新 lockfile，确认无 hard peer dependency error。

## 3. 验证任务（Verification Tasks）

- [ ] 3.1 [修改] `openspec/changes/build-ai-chat-packages/agent-progress.md` - 记录每个 checkpoint 选中的 task、已改文件、验证命令和结果，不把未验证内容写成完成。
- [ ] 3.2 [修改] `openspec/changes/build-ai-chat-packages/agent-findings.md` - 记录实施中发现的 SSR、依赖、浏览器验收、任务遗漏和失败路径，避免重复走同一错误路线。
- [ ] 3.3 [修改] `packages/ai-vue/package.json` - 运行并记录 `pnpm --filter @ruan-cat-drill-doc/ai-vue test`、`typecheck`、`build` 的通过证据；失败时先修复再勾选。
- [ ] 3.4 [修改] `packages/ai-vitepress-plugins/package.json` - 运行并记录 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins test` 与 `build` 的通过证据；失败时先修复再勾选。
- [ ] 3.5 [修改] `packages/ai-vue-doc/package.json` - 运行并记录 `pnpm --filter @ruan-cat-drill-doc/ai-vue-doc build` 和 `preview` 的通过证据，确认 Nuxt SSR shell 正常。
- [ ] 3.6 [修改] `package.json` - 运行并记录 `pnpm run docs:build` 和 `pnpm run docs:dev` 的通过证据，确认根 VitePress 站点可启动。
- [ ] 3.7 [修改] `openspec/changes/build-ai-chat-packages/agent-progress.md` - 使用 agent-browser 优先完成 Nuxt preview 与 VitePress dev 浏览器验收，并记录按钮可见、打开对话框、发送 mock 回复和 console 结果。
- [ ] 3.8 [修改] `openspec/changes/build-ai-chat-packages/agent-findings.md` - 复核并记录未出现真实 API 请求、`baseUrl`、API key、模型配置、Nitro route、LangGraph、向量库或 RAG 抽象。
- [ ] 3.9 [修改] `openspec/changes/build-ai-chat-packages/tasks.md` - 每完成一个任务后只在验证证据齐全时标记为完成态 checkbox，发现遗漏先补本文件并运行 OpenSpec strict validate。
- [ ] 3.10 [修改] `openspec/changes/build-ai-chat-packages/agent-progress.md` - 最终记录 `openspec validate build-ai-chat-packages --strict`、`git diff --check`、`git status --short --untracked-files=all` 的结果和剩余风险。
