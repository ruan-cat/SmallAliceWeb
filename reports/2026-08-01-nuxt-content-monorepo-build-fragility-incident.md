# 2026-08-01 Nuxt Content 组件库文档站依赖与构建脆弱性事故报告

## 1. 结论摘要

本次结论不是“Nuxt Content 只能使用一组神秘版本，也不是任何微小版本变化都会失败”。更准确的说法是：

> `shadcn-docs-nuxt`、`@ztl-uwu/nuxt-content`、Nuxt/Nitro 与 H3 存在实际的运行时兼容矩阵，但上游 package metadata 没有完整表达这条边界。`pnpm` 严格依赖与 monorepo 符号链接会让未声明的运行时 import 暴露为具体的错误实例，因此一次看似普通的 minor 漂移可以跨过 Nuxt 3/H3 v1 与 Nuxt 4/H3 v2 的世代边界。

`SmallAliceWeb` 已验证稳定的本仓库基线是：

|            角色            |           已验证版本           |                 作用                 |
| :------------------------: | :----------------------------: | :----------------------------------: |
|        文档站主题层        |    `shadcn-docs-nuxt@1.1.9`    | 提供页面、Content 配置、搜索与组件层 |
|       Content 运行时       | `@ztl-uwu/nuxt-content@2.13.9` |    提供内容索引、cache/search API    |
|       应用框架与服务       |         `nuxt@3.21.2`          | 使用 Nitro `2.13.3` 与 H3 v1 运行时  |
|          H3 实例           |          `h3@1.15.11`          | 消除 Content 幽灵 import 的解析歧义  |
| Windows 构建临时 V8 堆上限 |            `8 GiB`             | 承载 SSR、索引与 prerender 内存峰值  |

这是一条“当前仓库有 fresh API 和全量构建证据的基线”，不是整个生态唯一正确的版本组合。另一条从 manifest 看起来同代的候选线是 `shadcn-docs-nuxt@1.2.2 + Content@2.14.1 + Nuxt 4.4.x`，但本仓库没有执行迁移验证，因此不得声称它已经可用。

## 2. 事故影响与现象

`packages/ai-vue-doc` 的 Content cache/search API 在开发和 Nitro prerender 中返回 `500`。可复核的异常包括：

```log
TypeError [ERR_INVALID_URL]: Invalid URL
    at new URL (node:internal/url:818:25)
    at getQuery (.../h3@2.0.1-rc.22/dist/h3.mjs:584:34)
    at isPreview (.../@ztl-uwu/nuxt-content/.../runtime/server/preview.js:3:23)
```

随后还出现 H3 API 代际差异：

```log
The requested module '.../h3@2.0.1-rc.22/.../h3/dist/_entries/node.mjs'
does not provide an export named 'sendError'
```

构建链还有第二类独立问题：默认 Node V8 堆约 `4,144 MiB` 时，客户端和服务端构建完成后，Nitro prerender 初始化阶段发生真实 OOM，退出码为 `134`：

```log
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

将堆上限提高到 `8 GiB` 后，Nuxt/Nitro 进程峰值工作集约 `7 GiB`，会持续高 CPU 并在一段时间内没有完成行。最终的 fresh 日志证明它不是永久死锁：单包构建成功，两次串行全量构建分别在 `82.36s` 与 `81.10s` 完成 VitePress 阶段，均输出 `9 successful, 9 total`。

## 3. 精确的版本失配机制

### 3.1 上游元数据实际表达了什么

从当前安装包的 manifest 可直接得到：

|             包版本             | Content 依赖 | 开发时 Nuxt | H3 dependency/peer |
| :----------------------------: | :----------: | :---------: | :----------------: |
|    `shadcn-docs-nuxt@1.1.9`    |  `^2.13.9`   |  `^3.21.0`  |       未声明       |
|    `shadcn-docs-nuxt@1.2.2`    |  `^2.14.1`   |  `^4.4.5`   |       未声明       |
| `@ztl-uwu/nuxt-content@2.13.9` |    不适用    |  `3.16.2`   |       未声明       |
| `@ztl-uwu/nuxt-content@2.14.1` |    不适用    |  `^4.4.5`   |       未声明       |

这里有两个结构性缺口：

1. `shadcn-docs-nuxt@1.1.9` 使用 `^2.13.9`，SemVer 会允许 Content `2.14.1`。
2. Content 运行时代码 `import { getQuery, getCookie } from "h3"`，却没有声明 H3 dependency 或 peer dependency。

因此，包管理器看到的是“允许升级的 minor 版本”，运行时实际跨越的却是“上游开发环境从 Nuxt 3 变为 Nuxt 4，H3 API 也发生代际变化”。这不是 pnpm 随机出错；pnpm 只是把不完整的依赖契约暴露了出来。

### 3.2 坏组合如何形成

本次已验证的坏组合是：

```log
shadcn-docs-nuxt 1.1.9
  -> 允许 @ztl-uwu/nuxt-content ^2.13.9
  -> 实际解析到 @ztl-uwu/nuxt-content 2.14.1
  -> Content 未声明 h3，但运行时直接 import h3
  -> monorepo 解析到 h3 2.0.1-rc.22
  -> Nuxt 3.21.2 / Nitro 2.13.3 的 H3 v1 事件和导出契约被破坏
  -> cache/search API 500
  -> Nitro prerender 失败
```

`ERR_INVALID_URL` 的具体原因是 H3 v2 的 `getQuery` 在当前事件上退回到 `new URL(event.req.url)`，而 Nitro 传入 `/api/_content/...` 相对路径，没有 base。`sendError` 则是另一处更直接的 H3 v1/v2 导出差异。

### 3.3 为什么固定四个版本有效

`packages/ai-vue-doc/package.json` 现在直接声明 Content `2.13.9` 和 H3 `1.15.11`，并把主题从 `^1.1.9` 固定为 `1.1.9`。这同时关闭了三条不受控路径：

- 主题不会在重新安装时自动进入 Nuxt 4 主题线。
- Content 不会被主题的 `^2.13.9` 自动提升到 `2.14.1`。
- Content 的未声明 H3 import 会在当前包边界找到明确的 H3 v1 实例。

当前 `pnpm list` 显示 Nuxt `3.21.2`、Nitro `2.13.3`、Content `2.13.9` 及相关链路均落到 H3 `1.15.11`。这解释了为什么 fresh dev 的两个 Content API 都恢复为 `200`。

### 3.4 为什么不能说“稍微漂移一点就必然失败”

当前证据只支持以下三种判断：

|                          判断                          |     证据状态     |                               结论                               |
| :----------------------------------------------------: | :--------------: | :--------------------------------------------------------------: |
|   Nuxt 3.21.2 + 主题 1.1.9 + Content 2.14.1 + H3 v2    |    已复现失败    |         `ERR_INVALID_URL`/`sendError`，属于已确认坏组合          |
| Nuxt 3.21.2 + 主题 1.1.9 + Content 2.13.9 + H3 1.15.11 |    已完整验证    |     fresh API、单包构建、两轮全量构建通过，属于当前稳定基线      |
|    Nuxt 4.4.x + 主题 1.2.2 + Content 2.14.1 + H3 v2    | 仅 manifest 同代 | 可能是上游预期组合，但本仓库未迁移、未构建、未部署，不能判定可用 |

小版本本身不是问题。真正危险的是：版本号变化触发了运行时世代变化，而 dependency/peer 契约、锁文件策略和验收门禁没有把它拦住。未来可以升级，但必须整组升级、整组验证。

## 4. 为什么这类组件库文档站在 monorepo 中显得脆弱

### 4.1 它不是一个单纯的 Markdown 静态站

`shadcn-docs-nuxt` 同时引入 Nuxt layer、Content 索引、MDC、站内搜索、图标、i18n、OG、Tailwind 和服务端 API。构建不只是把 Markdown 转 HTML，还会经历：

```log
Nuxt layer 合并
-> Vite 客户端构建
-> Vite SSR 构建
-> Nitro 打包
-> Content cache/search handler 执行
-> prerender 路由抓取
-> 服务端依赖追踪与部署产物生成
```

任何一层的依赖实例、外部化或平台行为不一致，都可能在最后的 prerender 才暴露。错误距离真正的依赖声明很远，因此体感上像“状况百出”。

### 4.2 主题层拥有大量传递依赖，但应用承担最终运行责任

应用只写了 `extends: ["shadcn-docs-nuxt"]`，实际运行时却继承主题内部几十个模块。主题的依赖范围一旦过宽，应用 lockfile 的一次更新就可能改变 Content、MDC、Shiki、i18n 或 H3 的实际实例。应用源码没改，构建行为仍会改变。

### 4.3 pnpm monorepo 会放大幽灵依赖和多实例问题

pnpm 通过内容寻址目录和符号链接隔离依赖。对声明完整的包，这是优势；对“代码 import 了 H3、manifest 却没声明 H3”的包，运行时实例会取决于调用位置、符号链接、hoist 和其他 workspace 包已安装的版本。于是同一段 Content 代码可能在不同仓库或一次重装后拿到不同 H3。

### 4.4 workspace 组件库让 SSR externalization 更复杂

组件库文档会直接渲染 workspace 包、Element Plus 和其传递依赖。Vite SSR、Nitro Rollup 与 `@vercel/nft` 在不同阶段决定“打入 bundle 还是运行时从 node_modules 加载”。一个阶段的 `inline` 不能替代另一个阶段的 `noExternal`；包被错误外部化后，pnpm 符号链接上下文可能在部署产物中丢失。

### 4.5 Content 的功能正确性依赖 prerender，不适合用跳过来止痛

cache/search API 是 Content 索引的一部分。`routes.clear()`、关闭 `crawlLinks`、关闭搜索或 `prerender.ignore` 可以让某次构建不再触发错误，但会让文档导航、搜索或 document-driven 数据在运行时为空。构建“变绿”不等于文档站功能正确。

### 4.6 Windows 本地与 Linux 部署不是同一个依赖追踪环境

Windows 的 junction、路径格式和 NFT trace 行为与 Vercel Linux 不同。本地为了避免 trace 卡住而设置的全局 workaround，如果无条件进入生产配置，可能直接删掉部署所需的 node_modules 或预渲染结果。

### 4.7 构建资源峰值会制造第二种“假脆弱”

本项目的 Nuxt/Nitro prerender 峰值约 `7 GiB`。默认 `4 GiB` 是真实 OOM；提高堆后约两分钟高 CPU 又容易被工具超时或人为终止。若同时启动多条 docs build，资源竞争、缓存目录写入和日志交错会进一步制造 `ENOTEMPTY`、超时或“像死锁”的假象。精准构建的前提是单包隔离、串行执行、进程采样和足够的超时预算。

## 5. 两个仓库的证据边界

### 5.1 SmallAliceWeb 已确认事实

|                         事实                          |                              证据                               |
| :---------------------------------------------------: | :-------------------------------------------------------------: |
| Content `2.14.1` 的 H3 import 解析到 `h3@2.0.1-rc.22` |          本地 Content API 堆栈与 `sendError` 导出错误           |
|     Content `2.14.1` 的开发依赖已是 Nuxt `^4.4.5`     |                        已安装包 manifest                        |
|         主题 `1.1.9` 仍允许 Content `^2.13.9`         |                       已安装主题 manifest                       |
|        默认约 `4 GiB` 堆在 Nitro prerender OOM        |                `FATAL ERROR` 与退出码 `134` 日志                |
|      固定 Content/H3 后 cache/search 返回 `200`       |                       fresh Nuxt dev 探针                       |
|        无并发、`8 GiB` 堆后完整构建可自然完成         | 单包成功、两次 `pnpm run docs:build` 均 `9 successful, 9 total` |

### 5.2 eams-component-lib 已确认事实

`D:\code\ruan-cat\eams-component-lib` 的 commit `77fd027` 和当前配置证明它确实发生过另一组 Nuxt Content 文档站事故：

|                  已确认现象                   |                                 已确认根因                                 |
| :-------------------------------------------: | :------------------------------------------------------------------------: |
| Vercel `Cannot find module 'entities/decode'` |         Windows 本地 `trace: false` 无条件影响云端，部署包缺少依赖         |
|         Vercel 找不到 `@vueuse/core`          | workspace 包与 Element Plus 被 Vite SSR 外部化，NFT 未完整追踪符号链接依赖 |
| 运行时 Content 对象为 `null`，读取 `_id` 失败 |    为缩短构建清空 prerender routes，document-driven 内容未在构建期生成     |

它的当前 `nuxt.config.ts` 也保留了针对这些事实的修复：`vite.ssr.noExternal`、精准 `nitro.externals.inline`、仅 Windows 条件启用 `trace: false`、`crawlLinks: true`，以及限制 icon server bundle。

### 5.3 只能作为相似背景、不能当成本次事实的内容

- 两个仓库都是 pnpm monorepo、Nuxt 3、`shadcn-docs-nuxt` 和 workspace 组件库文档站，因此“依赖解析、SSR externalization、prerender、Windows/Linux 差异”是共同风险面。
- `eams-component-lib` 当前仍使用 `nuxt: ^3.21.2`、`shadcn-docs-nuxt: ^1.1.9`，且没有直接声明 Content/H3。这说明它有与本次相似的未来漂移风险，但不证明它已经发生过 `ERR_INVALID_URL` 或 H3 v2 事故。
- `SmallAliceWeb` 本次 H3 失配不能反推 `eams-component-lib` 当年的三个生产故障也是 Content `2.14.1` 导致；现有证据明确给出了不同根因。
- `eams-component-lib` 的线上修复曾通过 Vercel `200` 和 Content navigation 验证；本次任务没有重新访问其线上环境，因此本报告只引用已提交历史记录，不把旧证据冒充 2026-08-01 的实时状态。

## 6. 五问根因分析

### 6.1 为什么 Content API 返回 500

因为 Nuxt 3 事件被交给了 H3 v2 的 query/error API，URL 和导出契约不兼容。

### 6.2 为什么 Nuxt 3 文档站会加载 H3 v2

因为 Content 在运行时代码中直接 import H3，却没有声明 dependency/peer，实例解析穿透到 monorepo 中的 H3 v2。

### 6.3 为什么 Content 会从 2.13.9 漂移到 2.14.1

因为主题 `1.1.9` 声明 `^2.13.9`，SemVer 允许 minor 升级，而应用没有直接锁定 Content。

### 6.4 为什么普通 minor 升级跨越了 Nuxt 世代

因为 Content `2.14.1` 的开发环境已从 Nuxt 3 转到 Nuxt 4，但上游没有用 major、peer dependency 或 engines 把兼容边界完整编码进包元数据。

### 6.5 为什么直到 prerender 才成为严重构建故障

因为 cache/search handler 在 Nitro prerender 阶段被真实执行；客户端与 SSR 编译可以先成功，最终索引路由执行才触发运行时实例错误。默认堆不足和 monorepo 全量构建又叠加了资源噪音，使根因更难识别。

## 7. 无效或危险的止痛方案

|                     方案                     |                          为什么不能采用                          |
| :------------------------------------------: | :--------------------------------------------------------------: |
|           `nitro.prerender.ignore`           |               隐藏 500，但不生成 cache/search 产物               |
|            清空 prerender routes             |              破坏 document-driven Content 数据生成               |
|                   关闭搜索                   |               改变产品功能，且不能修复 H3 依赖契约               |
|                  关闭预渲染                  |                   运行时 Content 数据可能为空                    |
|           直接修改 `node_modules`            |                     不可复现，重新安装即丢失                     |
|          只提高 V8 堆，不修 H3 解析          |                只能解决 OOM，Content API 仍然 500                |
|       只降级 Content，不直接声明 H3 v1       |   本轮早期探针已证明仍可能从工作区加载 H3 v2，并报 `sendError`   |
|       看到高 CPU/高内存就提前杀死构建        |  `8 GiB`、无并发时该进程会自然完成，会把正常长尾误报成永久卡死   |
| 在 Windows 无条件关闭 NFT trace 并复用到部署 | `eams-component-lib` 已证明这会让 Vercel serverless 产物缺少依赖 |

## 8. 预防机制与验收门禁

### 8.1 依赖声明门禁

Nuxt 3 线在当前仓库必须保持精确声明：

```json
{
	"@ztl-uwu/nuxt-content": "2.13.9",
	"h3": "1.15.11",
	"nuxt": "^3.21.2",
	"shadcn-docs-nuxt": "1.1.9"
}
```

任何升级 PR 必须把四个包当作一个矩阵审查，并回答：主题用哪个 Nuxt 开发、Content 用哪个 Nuxt 开发、H3 由谁声明、运行时最终解析到哪个实例。

### 8.2 安装解析门禁

fresh install 后至少运行：

```powershell
pnpm --filter @ruan-cat-drill-doc/ai-vue-doc list nuxt shadcn-docs-nuxt @ztl-uwu/nuxt-content h3 nitropack --depth 4
pnpm --filter @ruan-cat-drill-doc/ai-vue-doc why h3
```

Nuxt 3 线不应在 `ai-vue-doc` 的 Content 运行链中出现 H3 v2。仅检查 `package.json` 不够，必须检查实际解析树。

### 8.3 Content 功能门禁

使用 fresh dev 进程直接请求：

```powershell
curl.exe -sS -i --max-time 10 http://127.0.0.1:<port>/api/_content/cache.json
curl.exe -sS -i --max-time 10 http://127.0.0.1:<port>/api/_content/search
```

两条路由必须返回 `200` 和非空索引数据。不得只看首页能打开，也不得复用历史进程或历史日志。

### 8.4 构建资源门禁

- Windows 构建使用临时 `NODE_OPTIONS=--max-old-space-size=8192`。
- 先跑 `pnpm --dir packages/ai-vue-doc run build`，成功后才跑 workspace 全量构建。
- 完整 `pnpm run docs:build` 串行执行两次，不并发启动第二条相同构建。
- 允许 Nuxt/Nitro 在高 CPU、高工作集下完成约两分钟长尾；通过 PID、CPU 增量、工作集和日志更新时间判断进展。
- 验收必须有成功退出码、`9 successful, 9 total`、生成产物，以及 stderr 不匹配 OOM、Content 500、`ERR_INVALID_URL`、`ENOTEMPTY`。

### 8.5 跨平台与部署门禁

- Windows-only workaround 必须条件化，不能无条件进入 Linux/Vercel。
- `vite.ssr.noExternal` 与 `nitro.externals.inline` 分属不同构建阶段，不得互相替代。
- 不得清空 Content prerender 路由。
- 本地全量构建成功只证明本地链路。生产正确性仍需要用户授权后的 Linux/Vercel 构建、部署 URL、Content API、站内搜索与页面跳转回归；本次未访问任何云端服务。

### 8.6 两个仓库的专项建议

|         仓库         |                                 立即保持                                 |                                后续升级门禁                                 |
| :------------------: | :----------------------------------------------------------------------: | :-------------------------------------------------------------------------: |
|   `SmallAliceWeb`    |         保持当前四包固定基线、`8 GiB` 串行构建和 fresh API 探针          |   升级到 Nuxt 4 线时建立独立分支，整组升级主题/Content/H3，并执行全套验收   |
| `eams-component-lib` | 保留平台条件化 trace、SSR `noExternal`、精准 inline 与 Content prerender | 先审计当前 caret 实际解析结果；不要因本报告就宣称已复现 H3 事故或直接改生产 |

## 9. 已完成验证与未完成边界

### 9.1 本地已完成

- `packages/ai-vue-doc` 实际解析为主题 `1.1.9`、Content `2.13.9`、Nuxt `3.21.2`、Nitro `2.13.3`、H3 `1.15.11`。
- fresh dev 的 Content cache/search API 均为 `200`。
- 单包生产构建成功。
- 两次串行 `pnpm run docs:build` 均为 `9 successful, 9 total`。
- VitePress 两轮构建耗时分别为 `82.36s`、`81.10s`；本轮产物共 `6600` 个文件。
- 两轮没有 Content API 500、`ERR_INVALID_URL`、`ENOTEMPTY` 或 OOM。

### 9.2 仍未完成

- 没有验证 Nuxt 4 + 主题 1.2.x + Content 2.14.x 的候选升级线。
- 没有重新构建或部署 `eams-component-lib`；对该仓库的引用来自其当前配置与已提交事故记录。
- 没有访问 Neon、Vercel、数据库、模型服务或任何生产环境。
- 本地成功不能替代外部部署和真实生产回归。

## 10. 最终判断

`shadcn-docs-nuxt@1.1.9 + Nuxt@3.21.2 + Content@2.13.9 + H3@1.15.11` 是当前仓库通过 fresh API、单包构建和两次全量构建证明的正确基线。它之所以需要精确锁定，不是因为生态中任何小版本变化都必然失败，而是因为当前上游的 semver 和 peer dependency 没有表达真实的 Nuxt/H3 世代兼容边界。

两个 monorepo 的共同脆弱性来自“主题传递依赖 + 未声明运行时 import + pnpm 实例隔离 + workspace SSR 外部化 + Content prerender + Windows/Linux 差异 + 高内存长尾”的组合。解决办法不是继续堆 workaround，而是把依赖矩阵、功能探针、构建资源和跨平台部署拆成独立门禁，让每一层都能用 fresh 证据验收。
