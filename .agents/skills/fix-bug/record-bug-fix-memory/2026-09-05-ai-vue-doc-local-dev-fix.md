# ai-vue-doc 本地 dev 全链路故障修复（2026-09-05）

## 事故简述

`@ruan-cat-drill-doc/ai-vue-doc`（shadcn-docs-nuxt 文档站）本地 `pnpm dev` 无法使用，表现为多层叠加故障，逐层剥开后共修复 4 类根因。

## 根因分层与修复

### 第 1 层：沙箱批量删除保护拦截 `nuxt prepare`

- 现象：`predev` 的 `nuxt prepare` 在 `clearDir(.nuxt)` 时抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（累计删除 53 > 阈值 50）。
- 根因：WorkBuddy CLI 注入的 `node-safe-delete-shim` 按会话累计拦截批量删除，与 Nuxt 的 `.nuxt` 清理逻辑冲突。
- 修复：启动 dev 前手动清理 `.nuxt`；对该命令用官方退出变量 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。

### 第 2 层：`vue-element-plus-x` 无法 SSR（模块顶层 `document.createElement`）

- 现象：首页 500，`Cannot read properties of undefined (reading 'createElement')`。
- 根因：`vue-element-plus-x` dist chunk 在模块求值期执行 `document.createElement`，SSR 必崩；且其 chunk 内部 import `.css`，被 Nitro 外部化后 Node 原生 ESM 也无法加载（`build.transpile` 只能把崩溃点从 CSS 挪到 DOM，不是修复）。
- 修复：`plugins/ai-vue.ts` → `plugins/ai-vue.client.ts`（客户端专属插件），服务端完全不求值该链路。demo 组件已有 `v-if="isMounted"` 挂载守卫，配合成立。

### 第 3 层（最核心）：h3 v2 RC 污染 pnpm 提升层，四个未声明 h3 的包全部中招

- 关键事实：`ai-rag-api` 依赖 `nitro@3.0.260610-beta` → 引入 `h3@2.0.1-rc.22`，被 pnpm 提升到 `.pnpm/node_modules/`（提升层）。h3 v1 与 v2 共存时提升层只有 v2。
- 四个包在自己的 package.json 里**完全未声明 h3**，运行时代码却裸 `import "h3"`，解析到提升层的 v2 → API 不匹配：
  1. `nuxt-og-image@5.1.9`：`sendError` 导出缺失 → SSR 全站 500。
  2. `@ztl-uwu/nuxt-content@2.13.9`：`getQuery(event)` 对 h3 v1 事件对象执行 `new URL(相对路径)` → `ERR_INVALID_URL` → Content API 全挂 → 所有页面渲染 404 UI（HTTP 200 的假象）。
  3. `@nuxtjs/mdc@0.18.4` / `0.20.2`：`/api/_mdc/highlight` 同类 `Invalid URL`，代码块高亮失效。
  4. `@nuxt/icon@1.15.0`：`/api/_nuxt_icon/lucide.json` 同类 `Invalid URL`。
- 为什么以前能跑：`ai-rag-api` 引入 nitro v3 beta 之前，提升层 h3 恰好是 v1，裸导入意外一致。
- 修复：根 `package.json` 的 `pnpm.packageExtensions` 为四个包注入声明的 `h3: 1.15.11`。比全局 override 精准——不会破坏 `ai-rag-api` 真正需要的 h3 v2。
- 排雷方法：写脚本扫描 `.pnpm` 内 `@nuxt/*`、`@nuxtjs/*` 作用域全部包，找「未声明 h3 但代码 `from "h3"`」的组合，一次收敛，不再逐错打地鼠。

### 第 4 层：`.client` 插件导入不在 optimizeDeps 扫描入口，element-plus/mermaid 整树未预构建

- 现象：SSR 全部正常，但客户端 `#__nuxt.__vue_app__` 不存在、整站不水合（表现为内容不变、交互全死）。动态 import entry 抓到真实错误：`dayjs.min.js does not provide an export named 'default'`（CJS/UMD 产物无 ESM interop）。
- 根因：`plugins/ai-vue.client.ts` 导入 element-plus、`shadcn-docs-nuxt/plugins/mermaid.client.ts` 动态导入 mermaid——两者都不在 Nuxt optimizeDeps 扫描入口里，element-plus/mermaid 整棵依赖树以原始产物直出，其中 dayjs（CJS）、@braintree/sanitize-url（CJS）无 interop 即崩，并阻断整个 entry 执行。
- 定位手段：agent-browser 守护进程 console 捕获不可靠时，用 playwright-core `connectOverCDP` 手写探针脚本抓 `pageerror`；用 CDP `Network.requestWillBeSent` 的 `initiator.url` 精确定位 dayjs 的导入方是 `mermaid/dist/chunks/mermaid.core/chunk-*.mjs`。
- 修复：`nuxt.config.ts` 增加 `vite.optimizeDeps.include: ["element-plus", "shadcn-docs-nuxt > mermaid"]`（嵌套 `>` 语法覆盖非直接依赖）。

## 关键经验

1. **`pnpm why` 显示"只有一个版本"不等于运行时只有一个实例**：peer hash 变体会产生多份物理拷贝（本项目 nuxt、vue、@ztl-uwu/nuxt-content 都有多实例），排查时直接看 `.pnpm/node_modules`（提升层）和实际链接指向。
2. **HTTP 200 ≠ 页面正常**：catch-all 路由会把 404 UI 渲染成 200。验证必须断言 `<title>` 或具体内容，不能只看状态码。
3. **`build.transpile` 不是万能解**：对「外部化 + CJS 依赖」问题它是解，对「模块顶层 DOM API」问题它只是把崩溃点后移。修复前必须分清两类症状。
4. **packageExtensions 优先于 overrides**：给第三方包补声明是外科手术；全局 override 会误伤真正需要新版本的包。
5. **agent-browser 自动启动 Chrome 失败（exit code 3，Chrome 152 + 无 DevToolsActivePort）时的降级路径**：手动 `chrome --headless=new --remote-debugging-port=<port>` 启动 + `agent-browser connect <port>`；console 捕获不可靠时用 playwright-core `connectOverCDP` 直连抓 `pageerror`，用 CDP Network initiator 定位导入链。
6. **浏览器「整站无水合且 console 无错」时**：优先 `document.querySelector('#__nuxt').__vue_app__` 判定挂载状态，再 `import(entry + '?v=diag')` 动态重执行抓真实 SyntaxError——模块脚本执行失败不一定走 console.error。

## 遗留与候选状态

- dev 服务验证状态：**verified**（本地 HTTP + 内容 API + 浏览器截图 + mock 对话交互全通过）。生产 build 此前另有 4GB 堆 OOM（exit 134），属独立问题未在本轮处理。
- IPX og 图像 404（`IPX_FILE_NOT_FOUND`）为非阻断遗留，源图缺失，不影响文档功能。
- 两个 nuxt 物理实例（peer hash 分裂）目前共存且能跑，但属于长期隐患，建议后续收敛根与 doc 包的 nuxt peer 解析。

## 追记（同日续 3：IPX logo 修正 + fork patch）

7. **shadcn-docs-nuxt 的 `Logo.vue` 标题文本嵌在 logo 的 `v-if` 分支内部**：把 `header.logo` 置空来"禁用 logo"会连带丢失站点标题——组件源码的分支推断必须过浏览器验收。正确做法：logo 指向真实存在的资源（本项目用 `/favicon.svg`）。另注意 header logo 容器是 `hidden md:flex`，窄视口下本就不渲染，验收必须桌面视口（agent-browser 命令为 `set viewport <w> <h>`，非 `set-viewport`）。
8. **fork 包改名的硬编码自引用残留**：`@ztl-uwu/nuxt-content`（fork 自 `@nuxt/content`）的 `dist/module.mjs` 硬编码 `optimizeDeps.include` 旧前缀 `@nuxt/content > slugify`，vite 必然解析失败并刷 7 条 WARN。修复用 `pnpm patch` 改前缀为 fork 自身包名（依赖链物理完整：fork 声明了 slugify 与 @nuxtjs/mdc）。产物 `patches/@ztl-uwu__nuxt-content@2.13.9.patch`；patch 绑定版本，升级 fork 需重做。教训：引入 fork 包后先 grep 其 dist 内的自引用字符串。
9. **`pnpm-lock.yaml` 在本仓库被 .gitignore**：git status 永远不显示它，勿据"lockfile 无变更"推断依赖状态。
10. **Vue 组件解析是 hoisted，`v-if` 为假也执行 `resolveComponent`**：client-only 插件（`.client.ts`）全局注册的组件在 SSR 端不存在，SSR 渲染引用它的组件必然警告。**不要用静态 import 修复**——会把非 SSR-safe 包（依赖 CSS 产物的，如 ai-vue → vue-element-plus-x/dist/style7.css）拉进 SSR 模块图导致 500。正确方案：`defineAsyncComponent(() => import(...).then(m => m.X))`——异步组件直接绑定消警告，且 loader 仅在实际渲染时执行（配合 `v-if="isMounted"` 时 SSR 不触发 import）。
11. **`pnpm build` 与 dev 并行会互相摧毁**：二者共享 `.nuxt`，build 的 `nuxt prepare` 清写该目录会污染 dev 正在使用的 server 产物，症状为全站 500 + `#internal/nuxt/paths is not defined` + `mdc-highlighter.mjs ENOENT`。修复：停 dev → 清 `.nuxt` → 重启。
12. **`#app-manifest` pre-transform ERROR 是 Nuxt 3.21 dev 已知噪音**：来自 nuxt `manifest.js` 的 `if (false)` 死分支，vite import-analysis 仍尝试解析，页面功能不受影响。
