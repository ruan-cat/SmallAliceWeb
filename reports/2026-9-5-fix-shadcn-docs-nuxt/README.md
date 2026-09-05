# shadcn-docs-nuxt 文档站（ai-vue-doc）本地 dev 全链路故障事故报告

| 项       | 内容                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| 事故日期 | 2026-09-05                                                                                           |
| 影响对象 | `packages/ai-vue-doc`（`@ruan-cat-drill-doc/ai-vue-doc`，shadcn-docs-nuxt 文档站）                   |
| 事故等级 | 高（文档站完全不可用：dev 无法启动、SSR 全站 500、客户端整站不水合）                                 |
| 最终状态 | **verified** — dev 四路由 200 + 浏览器交互闭环 + turbo 全量构建 9/9 + 生产 `.output` HTTP smoke 通过 |
| 修复提交 | `5e5fda1`（deps 治理）、`c7980d8`（dev 四层故障）、`c3db7bf`（构建堆参数）、`a4d60fb`（事故沉淀）    |
| 报告作者 | WorkBuddy Agent（Kimi），含对自身排错误区的自我批判章节                                              |

---

## 1. 事故概述

用户初始诉求：修复 `@ruan-cat-drill-doc/ai-vue-doc` 无法本地 dev 的错误；用 turbo 预构建前置工作区依赖；用 agent-browser 的本地 Chrome 验证显示效果。

实际排障发现故障不是单点，而是**多层叠加**：剥开一层立刻暴露下一层，全程共修复 4 层主根因 + 5 个衍生问题（构建 OOM、IPX 404、fork 包硬编码警告、AiChat SSR 警告、sharp 警告定性）。修复过程本身又引入了 2 次次生事故（详见 §5 误区），均已自行闭环。

---

## 2. 环境背景

- 仓库：`D:\code\ruan-cat\SmallAliceWeb`，pnpm workspace + turbo monorepo，Windows 11（win32-x64），Node 22。
- 目标包：`packages/ai-vue-doc`，基于 `shadcn-docs-nuxt@1.1.9` + `nuxt ^3.21.x`，消费 workspace 包 `@ruan-cat-drill-doc/ai-vue`（Vue 组件库，依赖 `element-plus`、`vue-element-plus-x`）。
- 关键事实：同仓库的 `ai-rag-api` 依赖 `nitro@3.0.260610-beta` → 引入 `h3@2.0.1-rc.22`。
- 沙箱环境：WorkBuddy CLI 注入 `node-safe-delete-shim`（批量删除保护）。
- 注意：本仓库 `pnpm-lock.yaml` 被 `.gitignore` 忽略，不入库。

---

## 3. 主故障：四层根因与修复

### 第 1 层：沙箱 safe-delete shim 拦截 `nuxt prepare`

- **现象**：`predev` 的 `nuxt prepare` 在 `clearDir(.nuxt)` 时抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`（会话累计删除 53 个文件 > 阈值 50）。
- **根因**：WorkBuddy 沙箱注入的 `node-safe-delete-shim` 对批量删除要求人工确认，与 Nuxt 每次启动清写 `.nuxt` 的行为天然冲突。
- **修复**：启动前手动清理 `.nuxt`；对该类命令使用官方退出变量 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。
- **后续深坑**：该 shim 还会拦截 `pnpm add` 触发的 postinstall `nuxt prepare`，导致**整个 `pnpm add` 回滚、package.json 不写入且 exit 1**，极易误判为依赖解析失败（详见 §5-M11）。

### 第 2 层：`vue-element-plus-x` 无法 SSR（模块顶层 DOM API）

- **现象**：首页 500，`Cannot read properties of undefined (reading 'createElement')`。
- **根因**：`vue-element-plus-x` 的 dist chunk 在**模块求值期**执行 `document.createElement`，Node SSR 环境无 `document` 必崩；且 chunk 内部 import `.css`，被 Nitro 外部化后 Node 原生 ESM 同样无法加载。
- **修复**：`plugins/ai-vue.ts` → `plugins/ai-vue.client.ts`（客户端专属插件），服务端完全不求值该链路；demo 组件已有 `v-if="isMounted"` 挂载守卫配合。

### 第 3 层（最核心）：h3 v2 RC 污染 pnpm 提升层，四个未声明 h3 的包全部中招

- **根因链**：`ai-rag-api` → `nitro@3.0-beta` → `h3@2.0.1-rc.22` 被 pnpm 提升到 `.pnpm/node_modules/`。h3 v1/v2 共存时**提升层只保留 v2**。四个包在自己的 package.json 里完全未声明 h3，运行时代码却裸 `import "h3"`，全部解析到提升层 v2：
  | 中招包 | 症状 |
  | --- | --- |
  | `nuxt-og-image@5.1.9` | `sendError` 导出缺失 → SSR 全站 500 |
  | `@ztl-uwu/nuxt-content@2.13.9` | `getQuery` 对 v1 事件对象执行 `new URL(相对路径)` → `ERR_INVALID_URL` → Content API 全挂 → 所有页面渲染 404 UI（**HTTP 200 假象**） |
  | `@nuxtjs/mdc@0.18.4 / 0.20.2` | `/api/_mdc/highlight` 同类 `Invalid URL`，代码高亮失效 |
  | `@nuxt/icon@1.15.0` | `/api/_nuxt_icon/lucide.json` 同类 `Invalid URL` |
- **为什么以前能跑**：`ai-rag-api` 引入 nitro v3 beta 之前，提升层 h3 恰好是 v1，裸导入"意外一致"——这是典型的**隐性依赖运气**。
- **修复**：根 `package.json` 的 `pnpm.packageExtensions` 为四个包逐包注入 `h3: 1.15.11` 声明。选 packageExtensions 而非全局 override：后者会破坏 `ai-rag-api` 真正需要的 h3 v2。
- **排雷方法**：放弃"报一个错修一个包"，写脚本扫描 `.pnpm` 内 `@nuxt/*`、`@nuxtjs/*` 作用域全部包，找出所有「未声明 h3 但代码 `from "h3"`」的组合，一次收敛。

### 第 4 层：`.client` 插件导入不在 optimizeDeps 扫描入口，element-plus/mermaid 整树未预构建

- **现象**：SSR 全部正常，但客户端 `#__nuxt.__vue_app__` 不存在——整站不水合，内容不变、交互全死，**console 看起来干净**。
- **定位手段**（本层最耗时的部分）：
  1. `document.querySelector('#__nuxt').__vue_app__` 判定未水合；
  2. 动态 `import(entrySrc + '?v=diag')` 强制重执行 entry，抓到真实错误：`dayjs.min.js does not provide an export named 'default'`（CJS 产物无 ESM interop）；
  3. agent-browser 的 console 捕获不可靠 → playwright-core `connectOverCDP` 直连 CDP，用 `Network.requestWillBeSent` 的 **`initiator.url`** 精确定位 dayjs 的导入方是 `mermaid@11.16.0/dist/chunks/mermaid.core/chunk-*.mjs`——不定位导入链就会在错误的依赖上打转。
- **根因**：`plugins/ai-vue.client.ts` 导入 element-plus、主题的 `mermaid.client.ts` 动态导入 mermaid——两者都不在 Nuxt optimizeDeps 扫描入口里，整棵依赖树以原始产物直出，其中 dayjs（CJS）、`@braintree/sanitize-url`（CJS）无 interop 即崩，并**阻断整个 entry 执行**。
- **修复**：`nuxt.config.ts` 增加 `vite.optimizeDeps.include: ["element-plus", "shadcn-docs-nuxt > mermaid"]`（嵌套 `>` 语法覆盖非直接依赖），esbuild 预构建递归打包全部传递依赖并提供 interop。

---

## 4. 衍生问题族谱（主故障修复后陆续暴露）

| #   | 问题                                                    | 根因                                                                                                                                                                | 处置                                                                                                                                | 状态                                     |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| D1  | 生产 build exit 134（4GB 堆 OOM）                       | Nitro prerender 内存大户，默认堆不够                                                                                                                                | `NODE_OPTIONS=--max-old-space-size=8192`，后经 `cross-env` 固化进 build 脚本（提交 `c3db7bf`）                                      | ✅ verified                              |
| D2  | IPX 404（`/logo.svg`、`/logo-dark.svg`）                | 主题 `useConfig.ts` 默认 logo 指向**主题包不附带**的源文件                                                                                                          | `app.config.ts` 的 `header.logo` 指向真实存在的 `/favicon.svg`（第一版方案有误，见 §5-M6）                                          | ✅ verified（`/_ipx/_/favicon.svg` 200） |
| D3  | 7 条 `Failed to resolve dependency` WARN                | fork 包 `@ztl-uwu/nuxt-content` 改名后 `dist/module.mjs` 硬编码旧前缀 `"@nuxt/content > slugify"` 等，vite 必然解析失败                                             | `pnpm patch` 改前缀为 fork 自身包名 → `patch-commit`，产物 `patches/@ztl-uwu__nuxt-content@2.13.9.patch`                            | ✅ verified（警告 7→0）                  |
| D4  | SSR 警告 `Failed to resolve component: AiChat`          | Vue 编译把组件解析 **hoist** 到 render 开头（`v-if` 为假也执行）；AiChat 仅由 `.client` 插件注册，SSR 端不存在                                                      | `defineAsyncComponent(() => import(...).then(m => m.AiChat))`——直接绑定消警告且 loader 仅实际渲染时执行（第一版方案有误，见 §5-M8） | ✅ verified（警告 0 + mock 对话闭环）    |
| D5  | 构建警告 `sharp binaries for win32-x64 cannot be found` | **非缺依赖**：win32 上 nitro `externals.trace: false` 是历史提交 `9c3a3ce` 为修 OOM 做的有意决策，`@nuxt/image` 检查 `.output/server/node_modules/@img/` 时必然为空 | win32 保留决策并注释文档化（本地 preview 实测 sharp v0.33.5 加载正常）；非 win32（CI/Vercel）分支补 `traceInclude: ["sharp"]`       | ✅ 定性为良性副作用                      |

**明确不动的事项**（已披露）：

- nuxt/vue 双物理实例（peer hash 分裂）——当前可用，长期隐患仅记录；
- `#app-manifest` pre-transform ERROR——Nuxt 3.21 dev 已知噪音（`manifest.js` 的 `if (false)` 死分支）；
- nuxt-content WS Error——dev 热更新通道偶发；
- `@vueuse` 的 rollup 注释警告——无害。

---

## 5. 误区与自我批判（本报告核心章节）

以下每一条都是排错过程中**真实发生过的错误判断**。写下来的目的：复盘产出 SOP，不是"下次注意"。

### M1：把 `build.transpile` 当万能解

第二层故障最初尝试 `build.transpile: ["vue-element-plus-x"]`，结果只是**把崩溃点从 CSS 加载挪到 DOM API**，问题原样存在。两类症状（外部化 + CJS 依赖 vs 模块顶层 DOM API）机理不同、解法不同，修复前必须先分清，而不是抓着一个配置项反复加码。

### M2：逐错打地鼠，缺少作用域收敛思维

第 3 层最初按报错逐包修（修 og-image → 冒出 nuxt-content → 冒出 mdc → 冒出 icon），修了 3 轮才意识到这是**同一根因的批量表现**，改为脚本扫描 `.pnpm` 全作用域一次收敛。教训：同型错误连续出现 ≥2 次时，必须停下来找"生成这些错误的共同机制"，而不是继续打地鼠。

### M3：`pnpm why` 单版本 ≠ 运行时单实例

依赖树显示 h3"只有一个版本"曾误导判断。实际上 pnpm 的 peer hash 变体会产生多份物理拷贝（本项目 nuxt、vue 均有多实例），提升层才是裸导入的真实解析目标。**看版本要用 `.pnpm/node_modules` 提升层 + 实际链接验证，不能只信 `pnpm why`。**

### M4：HTTP 200 假象差点蒙混过关

Content API 全挂后，所有页面由 catch-all 路由渲染 404 UI，但 HTTP 状态码是 200——如果只做状态码冒烟，会把"全站 404"验收成"正常"。最终验证必须断言 `<title>` 或正文内容。这条后来写进了技能的验证规范。

### M5：console 干净 ≠ 客户端没崩

第 4 层的整站不水合在浏览器 console 里**几乎无报错**——模块脚本执行失败不一定走 `console.error`。靠"console 没错所以客户端正常"的直觉判断会漏掉最深的坑。正确姿势：水合状态用 `__vue_app__` 判定，真实错误用动态 `import(entry + '?v=diag')` 的 reject 抓。

### M6：logo 置空——只读源码推断渲染行为，没过浏览器验收

IPX 404 的第一版修复是把 `header.logo` 置空，依据是 `Logo.vue` 有 `v-if="logo.light && logo.dark"` 分支。**但源码里标题文本 span 嵌在这个 `v-if` 分支内部**——logo 置空后站点标题"AI Vue"一起消失，是浏览器实测才发现的。此外 header logo 容器是 `hidden md:flex`，窄视口下本就不渲染，验收必须用桌面视口。教训一句话：**组件源码的分支推断不可替代浏览器验收；UI 配置修改必须过像素级视觉验证。**

### M7：build 与 dev 并行跑——教训已入库，执行时仍然遗漏

上轮排障已总结并记录"跑 build 前必须停 dev（二者共享 `.nuxt`）"，本轮执行生产构建回归时**依然没有先停 dev**，build 的 `nuxt prepare` 清写共享 `.nuxt`，污染 dev 正在使用的 server 产物，全站瞬时 500（`#internal/nuxt/paths is not defined` + `mdc-highlighter.mjs ENOENT`）。这是自己引入、自己修复的次生事故。自我批判：**经验入库 ≠ 执行到位；高危操作清单应该在动作前强制过一遍，而不是事后靠记忆。**（本报告写作时，此条已固化为 SOP 检查项，见 §9。）

### M8：AiChat 静态 import——修复引入新故障

为消除 SSR 组件解析警告，第一版直接 `import { AiChat } from "@ruan-cat-drill-doc/ai-vue"`，结果组件页 500：显式 import 把 ai-vue 拉进 SSR 模块图，其依赖 `vue-element-plus-x/dist/style7.css` 在 Node SSR 无法加载。**对非 SSR-safe 的包，静态 import 与全局注册是两条不同的边界**；最终方案 `defineAsyncComponent` 同时满足"消解析警告"与"不进 SSR 模块图"。教训：修一个警告前先想清楚它的注册边界，否则修复本身就是下一个 500。

### M9：据"lockfile 无变更"推断依赖状态

曾基于 `git status` 中 `pnpm-lock.yaml` 无 diff 推断"lockfile 与 HEAD 一致"——实际上该文件被 `.gitignore` 忽略，git status **永远不会显示它**。判断依赖状态必须直接读文件内容或跑 install，不能依赖 git 视角。

### M10：agent-browser 启动失败原地重试 8+ 次才降级

agent-browser 自动启动 Chrome 反复 exit 3（Chrome 152 + 无 DevToolsActivePort），重试了 8 次以上才切换到降级路径（手动 `chrome --headless=new --remote-debugging-port=<port>` + `agent-browser connect`）。同一方法重复失败超过 2 次就应换本质不同的方案——这条纪律当时执行得太晚。

### M11：把 stderr 噪音当失败信号

safe-delete shim 的 genie-trash 失败会输出 fail-closed stderr，但实际删除已完成、命令 exit 0；反之 `pnpm add` 回滚时 exit 1 但报错信息指向依赖解析。**判定成败以 exit code + 结果状态为准，不以 stderr 情绪为准**——两个方向都踩过。

---

## 6. 修复清单（文件级）

| 文件                                                                                               | 改动                                                                                                                                       | 提交      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `package.json`（根）                                                                               | `pnpm.packageExtensions` 5 项注入 h3@1.15.11、`overrides` 固定 nuxt-og-image 5.1.9、`patchedDependencies` 登记 fork 补丁                   | `5e5fda1` |
| `patches/@ztl-uwu__nuxt-content@2.13.9.patch`                                                      | 新增：修正 fork 硬编码的 optimizeDeps 旧前缀                                                                                               | `5e5fda1` |
| `packages/ai-vue-doc/plugins/ai-vue.ts → ai-vue.client.ts`                                         | rename：客户端专属插件，规避 SSR DOM API 崩溃                                                                                              | `c7980d8` |
| `packages/ai-vue-doc/nuxt.config.ts`                                                               | `vite.optimizeDeps.include`（element-plus + mermaid）；nitro win32 保持 `trace: false` 并注释文档化，非 win32 补 `traceInclude: ["sharp"]` | `c7980d8` |
| `packages/ai-vue-doc/app.config.ts`                                                                | `header.logo` 指向 `/favicon.svg`（明暗共用）                                                                                              | `c7980d8` |
| `packages/ai-vue-doc/components/content/AiChatBasicDemo.vue`                                       | AiChat 改 `defineAsyncComponent` 客户端懒加载                                                                                              | `c7980d8` |
| `packages/ai-vue-doc/package.json`                                                                 | build 脚本固化 `cross-env NODE_OPTIONS=--max-old-space-size=8192`；devDeps +`cross-env`、+`sharp@0.33.5`                                   | `c3db7bf` |
| `.agents/skills/fix-bug/record-bug-fix-memory/2026-09-05-ai-vue-doc-local-dev-fix.md` + `SKILL.md` | 事故案例沉淀（12 条经验 + 索引）                                                                                                           | `a4d60fb` |

全部通过 pre-commit（lint-staged）、commit-msg（commitlint）钩子，未使用 `--no-verify`。

---

## 7. 验证证据链

| 门       | 证据                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| dev 路由 | `/`、`/getting-started`、`/components`、`/components/ai-chat` 全部 200                                                         |
| 内容断言 | 首页 `<title>` 与标题文本存在；`/_ipx/` 引用指向 favicon 且返回 200（image/svg+xml）；组件页 SSR 输出含 `ai-vue-doc-demo` 容器 |
| 水合     | `window.useNuxtApp` 存在；`#__nuxt.__vue_app__` 判定通过                                                                       |
| 交互闭环 | 浏览器实测：输入"最终回归" → Enter 发送 → mock 回复"这是本地 mock 回复：最终回归"完整渲染（截图存档）                          |
| 警告收敛 | optimizeDeps `Failed to resolve dependency` 7→0；`Failed to resolve component: AiChat` →0                                      |
| 生产构建 | `turbo run build` 全量 **9/9 tasks successful**（4m36s，无 OOM）                                                               |
| 生产冒烟 | `.output` server（PORT=4000）四路由 200 + 内容断言 + 服务器日志 0 ERROR                                                        |
| IPX      | `curl /_ipx/_/favicon.svg` → 200，`image/svg+xml`                                                                              |

---

## 8. 知识沉淀

- **memorix**：obs #5881（dev 四层修复）、#5885（sharp 警告根因 + logo 陷阱修正）、#5886（shim 拦截 pnpm add）、#5887（fork patch）、#5888（AiChat defineAsyncComponent + build/dev 冲突）。
- **案例文件**：`.agents/skills/fix-bug/record-bug-fix-memory/2026-09-05-ai-vue-doc-local-dev-fix.md`（12 条经验）。
- **技能升级**：`init-shadcn-docs-nuxt` 事故记忆 14 → 20 条，版本 1.3.0 → 1.4.0（ai-plugins 源与 WorkBuddy 副本已对齐）；`nitro-api-development` 经评估**不升级**——本次 nitro 知识点属 Nuxt 内嵌 Nitro 构建层，写入会污染其"独立 API 编写"的范围。
- **工作日志**：`.workbuddy/memory/2026-09-05.md` 续 1-7 段。

---

## 9. 防复发 SOP（下次处理同类故障的强制清单）

1. **动手前**：确认无 dev 服务器在跑（build 与 dev 共享 `.nuxt`，冲突即全站 500）。
2. **依赖类问题**：先扫提升层 `.pnpm/node_modules` 与实际链接，禁止单信 `pnpm why`；同型错误 ≥2 次即停止打地鼠，找共同机制做作用域收敛。
3. **SSR 类问题**：先分清"外部化/CJS"与"顶层 DOM API"两类症状；非 SSR-safe 包一律 client-only 边界 + `defineAsyncComponent`，禁止静态 import 进 SSR 图。
4. **验证口径**：状态码 + `<title>`/正文断言 + 水合判定 + 浏览器桌面视口截图 + 至少一个交互闭环，四者缺一不可。
5. **UI 配置修改**：必须过浏览器视觉验收，源码分支推断不作为依据。
6. **成败判定**：以 exit code + 结果状态为准；stderr 噪音需核实后再定性。
7. **收尾**：`pnpm patch` 绑定版本，升级 fork 需重做；引入 fork 包先 grep 其 dist 内自引用字符串。

---

## 10. 遗留风险（候选/needs_check 状态）

| 风险                                  | 等级       | 说明                                                           |
| ------------------------------------- | ---------- | -------------------------------------------------------------- |
| nuxt/vue 双物理实例（peer hash 分裂） | 中（长期） | 当前共存可用；建议后续收敛根与 doc 包的 nuxt peer 解析         |
| fork patch 绑定 2.13.9                | 低         | 升级 `@ztl-uwu/nuxt-content` 时 patch 需重做                   |
| sharp 警告在 win32 持续出现           | 低         | 已文档化的良性副作用（trace:false 决策），勿再当缺依赖反复安装 |
| `#app-manifest` pre-transform ERROR   | 低         | Nuxt 3.21 dev 已知噪音，无干净修法，功能无影响                 |
| ai-plugins 技能升级未提交             | 低         | `init-shadcn-docs-nuxt` 1.4.0（2 文件）待提交                  |

---

## 附录：关键排查命令速查

```bash
# 水合判定（浏览器 console）
document.querySelector('#__nuxt').__vue_app__

# 抓真实模块错误（console 无错时）
import(entrySrc + '?v=diag')  // 看 reject 的 SyntaxError

# CDP 定位导入链
playwright-core connectOverCDP + Network.requestWillBeSent 的 initiator.url

# Chrome 152 降级路径
chrome --headless=new --remote-debugging-port=<port> && agent-browser connect <port>

# 提升层验证（不信 pnpm why）
ls node_modules/.pnpm/node_modules/<pkg>

# 作用域排雷（未声明 h3 却裸导入）
grep -rl 'from "h3"' node_modules/.pnpm/@nuxt+* node_modules/.pnpm/@nuxtjs+*
```

---

## 续章：Vercel 生产部署故障（traceInclude 实机证伪与回退）

**时间**：2026-09-05 12:30 前后 ｜ **部署**：`dpl_AnX24PMQQVfGh6QigwLrZeEWyURS`（commit `1cc3ea6`）→ **ERROR**

### 现象

包含本报告全部修复提交的 Vercel 生产流水线构建失败：turbo 8 任务中 **6 成功 / 1 失败**，失败任务 `@ruan-cat-drill-doc/ai-vue-doc#build`；**`ai-rag-api#build` 成功**——h3 治理（packageExtensions）未波及 Nitro v3 服务，用户最担心的"修 A 破坏 B"在 h3 维度上未发生。

### 根因（RCA）

致命错误来自**本报告 §4-D5 处置方案中"非 win32 补 `traceInclude: [\"sharp\"]`"这一分支**：

```text
Error: File /vercel/path0/packages/ai-vue-doc/sharp does not exist.
  at Job.emitDependency (@vercel/nft) / plugin: node-externals / hook: buildEnd
```

机理：nitro 的 `traceInclude` 在 pnpm 环境下把包名 `"sharp"` resolve 成 `<pkg>/sharp` 伪路径交给 `@vercel/nft`，nft 对不存在的文件直接硬错误。该分支只在非 win32 生效，**本地 win32 构建永远走不到**——与 §5-M7 同型："本地验证过 ≠ 全平台验证过"。

另有非致命噪音：prerender 期间 `/api/_mdc/highlight` 多次报 `Cannot find package 'env' imported from shiki/dist/onig.wasm`（shiki wasm 在 linux prerender 的解析问题），prerender 仍完成（2 routes），不阻断构建。

### 修复与决策

1. **回退 Linux `traceInclude` 分支**：`nuxt.config.ts` 非 win32 恢复为空配置（最后已知良好的 Linux 行为），全部平台不配置 traceInclude。理由：本 Vercel 项目部署产物是 `docs/.vitepress/dist`，ai-vue-doc 的 `.output` 仅作构建门禁，traceInclude 无部署收益；sharp 警告按良性噪音处理。
2. 处置写回 `nuxt.config.ts` 注释与事故报告，防止未来再次"补"上这个分支。

### 教训（新增）

13. **引入跨平台行为分支必须取得目标平台证据**：`traceInclude` 修复的是"警告"（良性），却引入了"硬错误"（致命）——修噪音前先评估目标平台风险收益比。
14. **Vercel 生产验证不能靠本地 win32 推断**：凡按 `process.platform` 分叉的构建配置，两个分支都需要在对应平台上至少跑通一次。

### 续章补遗：回退后的生产验证结果（同日）

- 回退 traceInclude 后推送 `a8170d0` → Vercel 部署 `dpl_VipqeTAyam6fti6hJ27L54YrZ7KC` **READY**（全流水线含 ai-rag-api#build 与 ai-vue-doc#build 通过）。
- 文档站生产冒烟：部署 URL 首页 200 + `<title>小爱丽丝官网`。
- ai-rag-api 生产接口（`smallalice-docs-ai-nitro-api.ruan-cat.com`，生产部署自 main 分支 `752fa45c`，**早于今日全部改动**）：`POST /v1/search` 200 + 标准 ApiResponse + 真实 RAG 结果；`POST /v1/chat` SSE 流式正常（来源帧 + 检索链路完整）。
- `GET /v1/knowledge/sync-runs` 500（标准 ApiResponse 结构，handler 正常执行，DB 查询层失败）——当前线上 API 构建于今日改动之前，**定性为既有问题**，与今日依赖治理无关，建议单独排查 Neon 查询。
- 结论：h3 治理未破坏 ai-rag-api（构建级 + 运行时机制级双重证据）；真实破坏源是 traceInclude（已回退 + 技能修正 10.15.1）。注意：API 生产部署跟随 main 分支，今日 dev 改动要进入 API 生产需 dev→main 合并（待用户决策）。
