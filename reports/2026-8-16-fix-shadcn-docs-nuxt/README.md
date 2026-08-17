# 2026-08-18 Nuxt 文档构建 OOM 故障分析与结构性修复实验

## 目标

修复 `@ruan-cat-drill-doc/ai-vue-doc` 在 Windows、GitHub Actions Linux runner 与 Vercel 类云构建环境中反复出现的 Node.js / V8 heap out of memory，并尽量避免用持续提高 `--max-old-space-size` 的方式掩盖复杂依赖图中的结构性问题。

本报告把“8 GiB heap 能稳定通过”定义为**对照组**，最终目标改为：在默认 Node/V8 heap 限制下，通过缩小生产 SSR/Nitro 构建图，使 Nitro prerender 能稳定完成。

## 关键失败证据

- 历史重点失败：Actions run `31272689831` / job `93141201150`。
- 近期 `dev` 失败：run `31930697012` / job `95124914691`。
- 两类失败均在约 4 GiB V8 heap 边界持续 Scavenge / Mark-Compact 后出现 `Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`，exit 134。
- 近期失败中 Vite client build 已成功处理约 5414 modules，server build 已成功处理约 4028 modules；真正死亡位置在 `[nitro] Initializing prerenderer` 之后。
- `packages/ai-vue-doc/content` 的 Markdown 数量很小，当前没有证据支持“内容文件太多直接撑爆 Nuxt Content”的解释。

因此应区分：

- **exit 134 + V8 heap OOM**：JavaScript heap ceiling 被击穿；
- **exit 137 / Killed**：更偏向 runner/cgroup 物理内存压力；
- 两者不能混为同一故障。

## 第一阶段：8 GiB 对照组

第一阶段采用以下措施建立稳定基线：

1. `ai-vue-doc` 的生产 `prepare/build` 暂时通过 package-level wrapper 设置 `--max-old-space-size=8192`；
2. 根 `build/docs:build` 使用 Turbo `--concurrency=1`，避免 workspace 高内存任务并行叠加；
3. GitHub CI 和 Vercel workflow 从 Node 24 对齐项目 `engines.node = 22.x`；
4. CI 输出 V8 heap limit、`free -h`，并通过 `/usr/bin/time -v` 记录进程资源数据。

### 对照组验证

| 验证 | 结果 |
| --- | --- |
| 主 PR #11 初次 CI | 成功 |
| 主 PR #11 同功能 SHA rerun | 成功 |
| 临时 PR #12 / run `32079043977` | 成功 |
| 临时 PR #13 / run `32079230457` | 成功 |

这证明：**增加 heap headroom 可以稳定绕过当前 OOM。**

但该结论不能证明根因已经解决。`8192` 只是提高 V8 old-space 上限，不是减少构建工作量，也不是证明存在经典内存泄漏。

## 第二阶段源码分析

### 1. workspace package 已经具备正式 dist exports

`packages/ai-vue/package.json` 已定义：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./styles": {
      "types": "./dist/style.d.ts",
      "import": "./dist/style.css",
      "default": "./dist/style.css"
    }
  }
}
```

并且根 `turbo.json` 的通用 `build` task 配置：

```json
{
  "build": {
    "dependsOn": ["^build"]
  }
}
```

`ai-vue-doc` 又声明了 `@ruan-cat-drill-doc/ai-vue: workspace:*`，因此在标准 Turbo package graph 中，依赖包可以先 build 出 `dist`，文档站生产构建没有必然理由继续消费 `../ai-vue/src/index.ts`。

### 2. 当前配置绕过 package exports，直接把源码拖入 Nuxt 构建图

`packages/ai-vue-doc/workspace-aliases.ts` 当前包含：

```ts
"@ruan-cat-drill-doc/ai-vue/styles": resolve(__dirname, "../ai-vue/src/styles/index.scss"),
"@ruan-cat-drill-doc/ai-vue": resolve(__dirname, "../ai-vue/src/index.ts"),
```

这会让生产文档站直接消费 workspace 源码，而不是正常使用 `package.json exports -> dist`。

开发模式这样做可能有 HMR / 联调价值，但生产构建会扩大 Nuxt/Vite 需要解析、转换和保留的 module graph。

### 3. Vite SSR 与 Nitro 又对同一批依赖做双重 blanket bundling

当前 `nuxt.config.ts` 的 `vite.ssr.noExternal` 包含：

- `@ruan-cat-drill-doc/ai-vue`
- Element Plus / `@element-plus/*`
- VueUse
- vue-demi
- floating-ui / popper
- async-validator
- lodash 系列
- tinycolor
- entities 等

Nitro `externals.inline` 又几乎重复同一组依赖。

这意味着大量本可作为正常 package dependency 处理的模块被强制参与 SSR/server bundling，并且在 Nitro server/prerender 生命周期继续扩大转换与保留对象集合。

### 4. Nitro prerender 是本次峰值的重要时间点

当前日志不是在 Markdown parse、client compile 或 server compile 初期死亡，而是在这两套 Vite build 已成功后，于 `[nitro] Initializing prerenderer` 后 OOM。

针对当前 Nitro `2.13.4` 的源码检查表明，prerender 初始化并非只是在现有 bundle 上直接并发抓取页面；它还会创建 prerender renderer/Nitro 生命周期并进行对应 build 初始化。

因此这里很容易形成“旧 module graph 尚有大量对象存活，新 renderer/build 又开始建立”的晚期峰值。

### 5. `nitro.prerender.concurrency = 1` 不是根修复

当前 Nitro 2.13.4 的 prerender 默认并发本身就是 1，而且现有 OOM 发生在真正 route 并发循环之前。

因此把：

```ts
nitro: {
  prerender: { concurrency: 1 }
}
```

作为主要修复，与当前证据不匹配。

### 6. shadcn-docs-nuxt / Nuxt Content 是基础负载放大器，但暂无单点泄漏证据

当前 `shadcn-docs-nuxt@1.1.9` 文档层会带入 Nuxt Content / document-driven、indexed search、Shiki highlight preload、Icon scanning 等文档站能力。

这些能力会增加生产构建的基础成本，但当前内容量很小，不能仅据此认定 Nuxt Content 本身泄漏。

更符合当前证据的模型是：

```text
shadcn-docs-nuxt / Nuxt Content 基础构建成本
  + workspace 源码 alias
  + 大范围 Vite ssr.noExternal
  + 大范围 Nitro externals.inline
  + Nitro prerender 晚期 renderer/build
  = 默认 V8 heap 附近的高瞬时/保留工作集
```

## 为什么会表现成“偶尔成功，大多数时候失败”

如果真实峰值长期贴近默认 V8 old-space ceiling，那么以下微小变化就足以改变是否越线：

- V8 GC 时机；
- Rollup/Vite module graph 的对象释放时机；
- Nitro prerender renderer 初始化时点；
- runner 当时的 native/RSS 使用；
- cache 与文件遍历顺序；
- Node 版本及 native dependency 安装路径；
- workspace 其他 task 是否同时存活。

因此“偶发绿色”与“结构仍不健康”并不矛盾。

## 第二阶段实验设计

### 实验目标

在**默认 Node/V8 heap**下完成生产构建，并验证成功不是偶发。

### 保持不变的控制变量

- Node 继续使用项目声明的 `22.x`；
- 根 Turbo `--concurrency=1` 暂时保留；
- shadcn-docs-nuxt 必需的内部兼容 alias 继续保留；
- Windows-only `nitro.externals.trace=false` 继续只在 `win32` 生效；
- 不新增 12/16 GiB heap；
- 不用 `nitro.prerender.concurrency` 掩盖问题。

### 结构实验候选变更

1. 删除 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`；
2. 恢复标准 `nuxt prepare` / `nuxt build` scripts；
3. GitHub CI 删除 `NODE_OPTIONS=--max-old-space-size=8192`，保留内存诊断；
4. 生产构建停止把 `@ruan-cat-drill-doc/ai-vue` / styles alias 到 `src`，改走 workspace package exports 的 `dist`；
5. 移除大范围 `vite.ssr.noExternal`；
6. 移除大范围 `nitro.externals.inline`；
7. 如果暴露真实 SSR externalization 或 module-resolution 错误，只根据错误逐项恢复**最小必要集合**。

### 实验矩阵

| 实验 | 默认 heap | 源码 alias | blanket `noExternal`/`inline` | 目的 |
| --- | --- | --- | --- | --- |
| Baseline | 否，8 GiB | 有 | 有 | 已建立稳定对照组 |
| E1 | 是 | 无 | 无/最小 | 验证构建图缩减能否直接消除 OOM |
| E1 rerun/独立 PR | 是 | 无 | 无/最小 | 验证不是偶发 green |
| E2（仅 E1 出现解析错误时） | 是 | 无 | 按错误逐项恢复 | 找到真实最小 bundling 集合 |

不再重复做一个“默认 heap + 原结构”的新实验，因为历史失败 run 已经多次提供该基线证据；新 runner 配额应该优先用于能区分根因的结构实验。

## 实验判定标准

### 成功

- 从 clean install 到 `nuxt build`、Nitro prerender、根 docs build 全部通过；
- 默认 V8 heap，无 8 GiB wrapper；
- 至少一次 rerun 或第二个独立 PR 仍成功；
- 不以关闭业务能力（如全文搜索/文档页面）换取绿色。

### 失败：exit 134 / V8 OOM

说明结构缩减仍不足。继续检查实际 module graph、Shiki/Icon/Nuxt Content 集成和 Nitro server/prerender build 的保留集合，而不是直接把 heap 提到 12/16 GiB。

### 失败：exit 137 / Killed

说明单进程 V8 ceiling 已不再是唯一限制，应转查 runner/cgroup 总内存和 RSS 峰值。

### 失败：module resolution / SSR externalization

这是有价值的实验结果。按错误逐个恢复最小 `noExternal` / `inline` 项，记录每一项为什么必须存在，禁止恢复整块 blanket 列表。

## Windows tracing workaround 的边界

现有：

```ts
...(process.platform === "win32" ? { trace: false } : {})
```

用于历史 Windows Nitro/NFT tracing 兼容问题。本次 Linux runner 同样 OOM，因此不能把 OOM 归咎于 Windows tracing，也不应该把 `trace: false` 无条件扩展到 Linux/Vercel。

## 当前结论

目前最符合源码、项目配置和 CI 崩溃时点的解释是：

> `shadcn-docs-nuxt` / Nuxt Content 提供较重的文档站基础构建；项目又通过 workspace 源码 alias 让 `ai-vue` 源码进入生产 SSR graph，并用 Vite `noExternal` 与 Nitro `externals.inline` 对大批依赖进行双重强制 bundling。Nitro 2.13.4 在 prerender 初始化阶段建立新的 renderer/build 生命周期后，晚期高瞬时/保留工作集超过默认 V8 heap ceiling。

目前没有足够证据证明经典 memory leak，也没有证据支持把 `prerender.concurrency` 当作核心修复。

最终长期方案应优先**缩小和分离生产依赖图**，让 workspace package 通过正式 exports 消费已构建的 dist，只保留确有证据需要的 externalization 例外；8 GiB 仅作为回退与对照组。

## PR / 分支记录

- 主 PR：#11 `fix(ci): 稳定 Nuxt 文档构建内存`
- 主工作分支：`2026-8-16-fix-shadcn-docs-nuxt`（不得删除，保持 Draft，不自动合并）
- 已建立的临时对照验证：PR #12、#13
- 后续结构实验继续使用独立临时 PR，实验结束后关闭但不合并，再把验证通过的最小修复回写主分支。

## 工具状态

本轮再次调用 Skill Router MCP 返回：

```text
FORBIDDEN: This conversation does not support developer MCPs
```

GitHub 连接器可正常读写仓库、PR 与 Actions，因此实验继续执行；PR/commit message 在 Skill Router 不可用时按项目既有规范和 Conventional Commits 编写。
