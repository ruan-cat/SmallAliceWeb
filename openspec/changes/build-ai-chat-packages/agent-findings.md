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
- 试点测试需显式覆盖 responding/loading、响应期间发送禁用和无网络调用；这些验收已收敛到既有 `1.8` 文件级 checkbox，不新增第二套任务。
- `pnpm -r list --depth -1` 在 1.1 后不会枚举 `ai-vue`，因为该包的 manifest 按任务顺序要在 1.2 创建；不要把此预期状态误判为 workspace glob 失效。
- `git diff --check` 不覆盖未跟踪新文件；任务 1.2 以 Node JSON 与字段白名单校验作为 manifest 证据，后续由安装完成后的 test/typecheck/build 覆盖源代码与格式验收。
- 1.3 在 1.5 前执行 TypeScript 模块解析会因未安装 `vitest/config` 报 `TS2307`；已用 Biome 语法检查验证配置。1.5 安装后必须重跑模块解析，1.8 测试创建后必须运行 Vitest，不能把当前静态检查视为最终 suite 证据。
- 新增 JSON 默认需使用仓库 Biome 的 Tab 缩进；1.4 的首次空格缩进已导致格式检查失败，修正后通过。后续 package JSON、tsconfig 与其他 JSON 配置先运行对应 Biome 检查再交复核。
- `pnpm-lock.yaml` 受 `.gitignore` 忽略且不存在于 HEAD，安装前已含 `packages/ai-vue` importer；1.5 以 `pnpm install --ignore-scripts` 的成功解析和当前 importer 为证据，不能把无 Git diff 误判为未刷新。5 组 peer warning 与 7 个 deprecated warning 来自既有依赖链、均非 hard error，需在最终风险审计保留。
- 1.8 的初版测试无法隔离证明“响应中且输入非空”时的 `canSend` 禁用，且实施报告曾遗漏；已补上直接 `false` 与响应结束后 `true` 断言、重跑包级测试并完成独立复核。后续状态测试不要仅依赖输入被清空后的间接断言。
- 2.4 的入口行为与 2.7 的唯一样式入口原先存在验收歧义；已在 2.4 明确结构/class 归属，在 2.7 集中实现圆形、右下角定位和尺寸，避免 SFC scoped CSS 与公共样式重复。
- 2.5 复核确认：普通 `git diff --check -- <未跟踪文件>` 不会覆盖新文件内容，不能把无输出写成该文件的空白检查证据。新增文件须以直接 Biome 检查（本次已通过）或 `git diff --no-index` 作为可复核证据；该表述缺陷不影响 2.5 的实现验收。
- 2.6 子代理的 PUA 注入模板解析不到工作区内的 `pua-skills/skills/pua/SKILL.md`；本机实际技能位于 `C:\Users\pc\.agents\skills\pua\SKILL.md`。这只影响子代理提示的附加行为协议，不影响代码验证；后续派发应给出实际绝对路径，避免重复报告环境缺失。
- 2.7 前的工件检查发现 `spec.md` 要求公开 `@ruan-cat-drill-doc/ai-vue/styles`，但原任务没有稳定 CSS 构建文件名、manifest subpath export 或入口样式导入。已在 `tasks.md` 补为 2.7.1、2.7.2 并扩充 2.8；未完成前不可宣称样式入口可被消费者解析。
- 2.7 验证限制：当前 Biome 对指定 `.scss` 处理 0 个文件并失败，`pnpm exec sass` 也因未安装可调用的 Sass CLI 失败；不可把其中任一命令写作通过。当前仅有精确静态契约与独立复审证据，待 2.36 安装完成后须以 3.3 library build 实际解析 SCSS。
- 2.7.1 的目标配置尚属未跟踪文件，普通 git diff 只能给出全文件新增。审计“仅修改一项”时，应引用前序已复核的任务 diff 作为基线并作字段比对；本次比对仅显示 `cssFileName: "style"`。
- 2.7.2 的 manifest 同属未跟踪文件。以 2.2 已复核 JSON 为基线，删除当前 `exports` 后做深度等价比对，才能证明既有脚本和依赖边界无漂移；exports 的键集合与路径也须单独严格断言，不能只看顶层键数。
- 2.8 复核再次确认：对未跟踪新文件运行普通 `git diff --check -- <path>` 的无输出没有文件级空白校验意义。报告不得据此写“无空白错误”；应使用 `git diff --no-index --check -- /dev/null <path>` 并将退出码 1 识别为内容差异而非空白失败。
- 2.9 前实测：`pnpm --filter @ruan-cat-drill-doc/ai-vue exec sass --version` 失败 `Command "sass" not found`，但 `vitest` 已可调用。`src/index.ts` 导入 SCSS，因此 plugin test 的实际 Vitest 运行要等待 2.36 统一安装；已在 tasks 增加 2.36.1，禁止在安装前把该运行时测试标记为通过。
- 2.12 的 `debug` alias 指向后续 2.23 创建的 shim；在 shim 与完整依赖均就绪前，不能将 Nuxt `prepare`、build 或 preview 的运行时结果归因于当前配置。该配置使用 `process.platform` 做 Windows trace 兼容判断，不访问浏览器全局对象。
- 2.13 的 GitHub 链接仅为文档站导航目标，不触发真实 AI API 调用；一期禁网审计应区分静态外链元数据与 `fetch`、XHR、SDK 等运行时请求，避免误报或遗漏。
- 2.14 的 Tailwind 扫描路径包含尚未创建的 content、app 与 components 目录；这是为了后续文件被创建时参与构建，不应在目录尚未落地前误判为配置失效。实际 Tailwind 解析仍由 3.5 验证。
- 2.15 的 Nuxt plugin 依赖 workspace alias 与公共 CSS subpath；在 2.36 重新安装依赖并于 3.5 构建前，不能仅凭静态导入宣称运行时解析成功。
- 2.16 的 `tailwind.css` 预先导入后续 2.17 创建的 `main.css`；在其落地前不要提前执行完整 Tailwind/Nuxt 解析。一次 PowerShell `rg` 管道参数拆分失败不作为任务失败或通过证据，应使用已通过的精确静态契约与独立复核结论。
- 2.17 完成后，Tailwind 样式入口的两个文件均已存在，但这不替代 3.5 的实际解析或 3.7 的视觉验收；文档站 CSS 必须继续保持 `.ai-vue-docs-*` 容器限定，避免后续内容示例误写组件内部 selector。
- 2.18 首页明确排除 `baseUrl` 与真实服务配置；后续文档不得为了“完整性”新增未经本 change 允许的连接、模型或后端接入说明，实际 Nuxt 内容渲染仍由 3.5 统一验证。
- 2.23 首次 shim 导出契约因验证命令错误地把预期布尔 `false` 当失败而报错；后续 no-op API 测试必须断言具体返回值，不能把 falsy 值泛化为失败。该路径不影响源代码验收。
- 2.27 首轮复核因 `.superpowers` brief/report 不可读或仍为占位而拒绝批准，虽实现文件正确。后续子代理交接前必须 UTF-8 读回 brief/report；未提交新文件的 `git diff --no-index --check` 退出码 `1` 只表示内容差异，报告应记录“无输出”而非将其当作失败。
- 2.31 子代理流程风险：探索子代理、首个复核子代理和快速复核子代理均超时且已中断；编辑子代理已完成文件与报告。后续不能把子代理沉默当作通过或阻塞，必须由主代理独立重跑命令证据后再勾选。
- 2.32 样式越界扫描首次使用 `\.ai-chat\b` 误命中 `.ai-chat-vitepress-shell`，该正则会把带连字符的插件容器误判为组件库内部 `.ai-chat`。后续扫描内部组件样式时使用 `\.ai-chat[\s,{]` 或明确列举 `ai-chat-floating-button|ai-chat__`。
- 2.33 只读复核子代理 120 秒超时未返回，已关闭；不能把子代理沉默视为通过。该任务由主代理以 Biome、精确静态契约、禁用项扫描和 `git diff --no-index --check` 独立验收。实际 Vitest 运行仍保留到 3.4。
- 2.34 前发现根站依赖缺口：根 `node_modules` 当前没有 `@ruan-cat-drill-doc/ai-vitepress-plugins` 链接，若直接在 `docs/.vitepress/theme/index.ts` 按公共 client 入口导入，VitePress 解析会缺少根 package 依赖声明。已先补 `tasks.md` 的 `2.33.1`，再执行根 theme 接入。
- 2.33.1 对根 `package.json` 做禁用项扫描时命中既有 `git:fetch` 脚本；这是 Git 脚本名误报，不代表真实 AI 网络请求。后续一期边界审计应聚焦 AI 包源码、theme 接入、配置字段和运行时请求。
- 2.34 只读复核子代理 120 秒超时未返回，已关闭；不能把子代理沉默视为通过。主代理已用 Biome、theme 契约扫描、禁用项扫描和 `git diff --check` 独立验收；VitePress 构建与浏览器行为仍须在 3.6、3.7 实际验证。
- 2.35 的 `pnpm exec biome check docs/.vitepress/theme/style.css` 失败来自文件既有格式：注释空格和旧 gradient 长行；本次 diff 只在末尾追加 13 行 AI shell 兜底。为保持精准修改，未格式化全文件，改用 `biome lint`、`git diff --check`、契约扫描和 diff 审计作为本 checkpoint 证据。
- 2.36 安装后仍有 peer/deprecated warning，但 `pnpm install --ignore-scripts` 退出码为 0，无 hard peer dependency error。主要 warning 来自 Nuxt/@nuxt/schema、VitePress preset/twoslash TypeScript、shadcn-docs-nuxt/@nuxtjs/i18n、既有 changelog/c12 与 scripts 包依赖链；需在最终风险摘要保留，但不阻塞当前任务。
- 2.36 探索子代理 120 秒超时未返回，已关闭；不能把子代理沉默视为通过。安装与 workspace/lockfile 验收由主代理命令证据覆盖。
- 2.36.1 首次 `ai-vue` 测试失败不是 SCSS 问题，而是 Vitest 缺少 `@vitejs/plugin-vue` 导致 `.vue` 文件无法解析。`@vitejs/plugin-vue` 依赖已存在，因此不要重复加依赖；只需补 `packages/ai-vue/vitest.config.ts` 的 Vue plugin 配置，并将测试验收顺延为 2.36.2。
- 2.36.1 修复后 `ai-vue` 测试通过，但输出 Dart Sass legacy JS API deprecation warning；这是 Sass/Vite 转换链的弃用提示，不是当前任务失败。后续 3.3 build/test 仍需保留该 warning 作为风险摘要。
- 3.2 复核确认 findings 已覆盖 SSR、依赖、浏览器、遗漏任务、失败路径和一期禁用边界；后续若出现新的构建或浏览器失败，应继续追加摘要索引，不在 change 根目录新增过程报告。
- 3.3 首次 `ai-vue` build 失败与 2.36.1 同类：Vite library build 未配置 `@vitejs/plugin-vue`，导致 `.vue` 文件 import analysis 失败。依赖已存在，不要新增依赖；只需补 `packages/ai-vue/vite.config.ts` 的 Vue plugin，且保留 entry、ES/CJS 输出、`cssFileName: "style"` 与 external 边界。
- 3.3 修复后 `ai-vue` build 通过，但 Rollup 输出 default/named exports 混用 warning；这是当前入口同时导出默认 plugin 与具名 API 的结果，不是构建失败。若未来发布到 npm，可在单独 change 中评估 `output.exports: "named"` 或入口导出策略。
- 3.4 首次 `ai-vitepress-plugins` build 退出码为 0，但未生成 `dist/client/style.css`，与 package exports `./client/style.css` 不一致。原因是 client 入口未导入 `src/client/style.css`；需先修复 `src/client/index.ts`，再重跑 build 并检查 CSS 产物存在。
- 3.4 修复后插件包 test/build 通过并生成 `dist/client/style.css`。build 仍提示根入口 empty chunk 与 client 入口 default/named exports 混用；根入口当前仅导出类型，empty chunk 属于预期非阻断状态。
- 3.5 首次 Nuxt build 失败在 `packages/ai-vue-doc/pages/[...slug].vue` 模板 `:class` 表达式，原因是 HTML 属性双引号内又使用双引号字符串。修复时只替换表达式内部字符串为单引号，不改页面结构或 Nuxt 路由逻辑。
- 3.5.1 Nuxt build/preview 通过，但保留多个第三方链路 warning：`@nuxt/icon` 与 Nuxt 3 不兼容被禁用、VueUse PURE 注释、chunk size、nuxt-og-image 插件包装/字体解析、Nitro virtual storage external、`@nuxt/image` sharp win32 二进制。`@nuxt/scripts` 在 build 期下载 umami 脚本，这是文档站依赖链构建期外部下载，不是 AI 对话运行时请求。
- 3.5.1 preview 参数不要使用 `pnpm --filter ... preview -- --port ...` 或 `preview --port ... --host ...`，Nuxt 在当前组合下会把参数误当 rootDir。可用 `NITRO_PORT`/`NITRO_HOST` 环境变量启动。清理端口时不要用 `$pid` 变量名，PowerShell `$PID` 是只读保留变量。
- 3.6 前置风险：根 `pnpm run docs:build` 会触发 `predocs:build`，而 `build:doc-in-vercel` 会删除 `drill-docx`、删除并重建 `docs/docx`，并 clone `https://github.com/ruan-cat/drill-docx`。这超出 AI chat change 且有破坏性/外部网络风险；本轮改为直接执行 `vitepress build/dev` 验证根 VitePress 站点。
- 3.6 首次根 VitePress build 失败由 theme 包装错误触发：`defineRuancatPresetTheme()` 返回的 theme 依赖 `extends: Teek`，自身没有 `Layout`。直接 `h(baseTheme.Layout, ...)` 会渲染 undefined Layout 并导致 Vue SSR `src.replace is not a function`。修复应取 `baseTheme.Layout ?? baseTheme.extends?.Layout`，并保留 `baseTheme.enhanceApp`。
- 3.6 修复后根 VitePress build/dev 通过。`pnpm exec vitepress dev docs --port 4176 --host 127.0.0.1` 实际仍监听 8080，后续浏览器验收应使用日志中的实际端口。dev 初始 HTML 很短，不包含标题或 AI shell，需以浏览器客户端挂载为准。
- 3.6.2 后 Nuxt preview 已能渲染可操作 `AiChat` demo；`/components/ai-chat` 浏览器内出现 `AI 对话` region，输入消息后追加用户消息和固定本地 mock 回复。后续若 SSR HTML 中 `hasDemo=False`，这是 `<ClientOnly>` shell 预期，不代表浏览器 demo 缺失。
- 3.6.3 首轮浏览器验收发现 `/components/ai-chat` 和非 AI 页 `/getting-started` 都报 `Hydration completed but contains mismatches`。DOM 差异定位到文档壳层 icon SSR 注释节点与客户端 icon 节点不一致，构建日志同时显示 `@nuxt/icon 2.3.1` 因要求 Nuxt 4 被禁用。已补 `packages/ai-vue-doc/package.json` 直接依赖 `@nuxt/icon 1.15.0` 并刷新 lockfile；后续 build 输出 `Nuxt Icon client bundle` 和 `icons.mjs`，preview 两页 console 均无 error/warn/issue。
- 3.6.3 调试路径限制：`pnpm --filter @ruan-cat-drill-doc/ai-vue-doc dev -- --port ...` 会把 `--` 也传给 Nuxt，在当前环境下打开 Nuxt welcome page；不要用它作为文档站 hydration 证据。需要 dev 定位时从 `packages/ai-vue-doc` 目录直接运行 `pnpm exec nuxt dev --port <port> --host 127.0.0.1`。
- 3.6.3 期间一次 `pnpm --filter @ruan-cat-drill-doc/ai-vue-doc build` 因 preview 进程占用 `.output` 失败：`EBUSY: resource busy or locked, rmdir ...packages/ai-vue-doc/.output`。这不是源码编译失败；重跑 build 前应先停止 `NITRO_PORT=4175` 的 preview 进程。
- 3.6.4 验收确认 `/components` 内容索引页消除了 Nuxt Content 预取 404；Chrome DevTools `xhr/fetch/websocket` 里 `/api/_content/query` 的 `/components` 请求均为 `200`。
- 3.7 浏览器路径中 agent-browser 对 VitePress `http://127.0.0.1:8080/` 也等待 300 秒超时；此前 Nuxt agent-browser 已有同类超时。后续本 change 浏览器验收以 Chrome DevTools 证据为准，不再重复等待 agent-browser。
- 3.7 初次 VitePress 验收发现 AI shell 与按钮已挂载，但按钮退化为普通文本按钮，DOM rect 为 `x=0,y=925,width=73.609375,height=24`。根因是插件 `dist/client/style.css` 只包含 shell 样式，没有吸收 `@ruan-cat-drill-doc/ai-vue/styles`；已补 `3.6.5` 在 client 入口导入组件库公共样式，重跑插件 build 后 CSS 产物增至 `4.61 kB` 并包含 `ai-chat-floating-button` 与 `ai-chat__*`。
- 3.7 样式修复后继续发现 VitePress `AI 对话面板` 内没有真实输入框，只有 `发送` 文本。根因是根站通过插件注入 `AiChat`，但 VitePress app 未安装 Element Plus；已补 `3.6.6` 在 client plugin 中 `app.use(ElementPlus)`，并把 Element Plus 声明为插件包 dependency。测试覆盖启用/禁用两条路径。
- 3.6.6 后插件 build 通过但 `dist/client/index.js` 增至 `1,430.36 kB`，`dist/client/style.css` 增至 `362.14 kB`，因为 Element Plus 运行时和 CSS 进入 client 产物。这是包体积风险，不是一期边界失败；若未来正式发布，可单独评估 external Element Plus 与按需组件导入。
- 3.7 初次 VitePress console/network 看到 `favicon.ico` 返回 `404`，同时 `favicon.svg` 为 `200`。这是根站静态资源缺失，不是 AI 插件资源、mock 对话逻辑或真实 AI 请求；在最终风险摘要中保留为非阻断风险。
- 3.7 当前 VitePress dev 还有一个既有主题图标外部请求 `https://api.iconify.design/simple-icons/github.svg [200]`。它来自根站 GitHub 图标，不是 AI 对话组件、VitePress AI 插件、LLM、RAG 或模型请求；Nuxt preview 当前外部请求为空。
- 3.8 禁用项复核：`packages/ai-vue`、`packages/ai-vue-doc`、`packages/ai-vitepress-plugins` 与 `docs/.vitepress/theme` 未发现真实 OpenAI/Anthropic/API key/`baseUrl`/chat completions/embeddings/LangGraph/vector/RAG 请求入口。`packages/ai-vue-doc/content/index.md` 与 `content/2.components/1.ai-chat.md` 的命中是“本阶段不包含/不提供”的边界说明，不是配置。
- 3.8 禁用项复核：未发现 `server/api`、`routes`、Nitro route 或 `.server`/`.api` 文件；`packages/ai-vue-doc/nuxt.config.ts` 的 `nitro.externals.inline` 只用于 Nuxt SSR 打包外部化依赖，不提供 AI 后端路由。
- 3.8 禁用项复核：`packages/ai-vue/src/tests/use-mock-ai-chat.test.ts` 的 `globalThis.fetch` 是 spy，并断言 `fetchSpy` 未被调用；生产源码未命中 `fetch`、`XMLHttpRequest`、`window`、`document`、`localStorage` 或 `navigator`。

## 3. 禁止重复路径

- 不要再只保留 `.openspec.yaml` 或单个干瘪文件后声明 OpenSpec 长任务已建立。
- 不要把 `docs/superpowers/plans/2026-07-22-ai-chat-packages.md` 当作后续执行的主任务源。
- 不要在 change 根目录新增日期化过程报告或临时 markdown；根目录只保留 OpenSpec 核心工件、`.openspec.yaml`、`agent-progress.md`、`agent-findings.md`。
- 不要在没有验证证据时把 `tasks.md` 中任意任务改成 `[x]`。
- 不要触碰 `prompts/index.md`，除非用户另行明确要求。

## 4. 最终复核结果

- OpenSpec strict validate 已通过：`Change 'build-ai-chat-packages' is valid`。
- `proposal.md`、`design.md`、`specs/ai-chat-packages/spec.md` 与 `tasks.md` 的工件链已保持一致；`tasks.md` 是唯一执行任务源。
- 最终 `git diff --check` 通过，无空白错误输出；`git status --short --untracked-files=all` 仍显示本 change 的未暂存修改和新增包文件，未执行暂存、提交、推送或回滚。
- `agent-team-node-cleanup.ps1` final dry-run 采样 `42` 个 Node 进程，`CandidateCount: 0`，未停止进程；端口 `8080` 与 `4175` 未发现残留监听。
- 剩余非阻断风险：Nuxt/VitePress 构建仍有第三方依赖 warning；VitePress 站点存在既有 `favicon.ico` 404 与 GitHub 图标 Iconify 外部请求；VitePress 插件因打包 Element Plus 导致 client 产物偏大。这些风险不属于一期 mock AI 对话能力阻塞项。
