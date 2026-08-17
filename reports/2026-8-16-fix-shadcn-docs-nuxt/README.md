# 2026-08-18 Nuxt 文档构建 OOM 故障分析与修复

## 目标

修复 `@ruan-cat-drill-doc/ai-vue-doc` 在 Windows、本项目 GitHub Actions Linux runner 以及 Vercel 类云构建环境中反复出现的 Node.js / V8 heap out of memory 问题，并给后续回归提供可观测证据。

## 关键证据

- 重点失败流水线：`actions/runs/31272689831/job/93141201150`。
- 失败进程在 V8 heap 约 4 GiB 附近持续 Scavenge / Mark-Compact，最终出现：`Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`。
- 该错误是 Node/V8 主动在 JavaScript heap 上限附近终止，不是 Linux 内核首先发出的 cgroup OOM kill。因此 Windows 与 Linux 出现近似错误并不矛盾：二者共同运行 Node/V8，并共同继承默认 heap 预算。
- `packages/ai-vue-doc/content` 的 Markdown 数量很小，不能用“文档数量巨大”解释当前峰值。
- 历史故障记录 `2026-08-01-nuxt-content-monorepo-compatibility.md` 已说明此包处于 Nuxt、Nitro、Nuxt Content、shadcn-docs-nuxt 与 monorepo workspace 依赖的高敏感组合中，并曾需要更高 Node heap 预算。

## 为什么这个组合容易出现高内存峰值

这不等价于“Nuxt / Nitro / Nuxt Content / shadcn-docs-nuxt 很垃圾”。当前证据更符合构建资源预算与任务编排问题，而不是已经证实的框架内存泄漏。

生产构建并不只处理 Markdown。Nuxt/Nitro 会建立客户端与服务端模块图，Nuxt Content 会参与内容转换/索引，shadcn-docs-nuxt 会加入文档主题与组件层，workspace 包又让构建图跨越包边界。随后 Nitro 还需要生成服务器产物并处理依赖。即使页面很少，模块图、转换缓存、Rollup/Vite 中间对象、SSR 代码和依赖追踪也可能在同一阶段驻留于 heap。

此外，根 `turbo run //#docs:build:run` 的依赖链会拉起 workspace build。如果多个高内存 Node 任务并发，单进程的 V8 heap 上限与整机 RSS 峰值会叠加。原配置没有显式限制并发。

## 第一轮长期修复

### 1. 在 `ai-vue-doc` 包内固定生产构建 heap 预算

新增 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`，由包自身在 `prebuild` / `build` 时设置：

```text
--max-old-space-size=8192
```

这样本地 Windows、Linux、GitHub Actions、Vercel 等只要执行该包标准 `build` 脚本，就不需要调用者另外记忆环境变量。该值是 V8 old-space 的上限，而不是启动时立即占用 8 GiB。

### 2. 根文档构建限制 Turbo 并发

根 `build` 与 `docs:build` 增加：

```text
--concurrency=1
```

目的不是修复单进程 heap，而是避免 workspace 构建任务并发把整机瞬时内存进一步放大。这里用构建时间换确定性。

### 3. GitHub Actions 与项目 Node 版本基线对齐

根 `package.json` 声明 `engines.node = 22.x`，旧 CI 却固定 `24.18.0`。第一轮修复将 CI 改回 `22.x`，减少本地/CI 两套 Node/V8 行为基线。

CI 同时显式设置 `NODE_OPTIONS=--max-old-space-size=8192`，保证根构建链和其子进程也获得一致预算。

### 4. CI 增加内存可观测性

构建前输出 V8 heap limit 与 `free -h`；生产构建优先通过 `/usr/bin/time -v` 执行，以便失败后区分：

1. V8 heap 再次达到上限；
2. runner 整机 RSS / cgroup 先耗尽并出现 exit 137 / killed；
3. OOM 已解除但暴露下一层真实构建错误。

这是后续迭代能否做对的关键，不能继续只看到一句 `pnpm run build failed`。

## 为什么不直接无限增加 heap

`8192` 是第一轮上限，不代表应该继续无条件增加。如果串行化以后仍然把 heap 推到 8 GiB，说明需要进一步检查模块图、Nitro tracing 或某个转换阶段是否存在病态增长；继续把 heap 提到 12/16 GiB 只会掩盖问题。

如果下一轮 GitHub Actions 不是 V8 OOM，而是 exit 137 / `Killed`，则说明已经从“单进程 V8 上限”转变为“runner 整机内存不足”。此时应优先减少峰值，必要时再给 CI 增加 swap，而不是继续提高 old-space。

## Windows 专用历史 workaround

现有 Nuxt 配置中 Windows 的 Nitro tracing workaround 已按 `process.platform === "win32"` 限定。当前 GitHub Linux 同样 OOM，说明不能把本次问题归因于那个 Windows workaround，也不应该把 `trace: false` 无条件扩展到 Linux。

## Vercel 证据边界

当前云任务能访问 GitHub 仓库、GitHub Actions 与仓库中的 Vercel 部署配置，但没有 Vercel Dashboard 日志连接器。因此不能声称已经直接读取所有 Vercel 平台内部构建日志。包级 build wrapper 与根 build 串行化的设计刻意不依赖 GitHub Actions，目的是让执行标准 pnpm package/build 链路的 Vercel 构建同样继承修复。

如果 Vercel 后续仍失败，需要按其实际日志区分 V8 heap OOM、平台总内存限制和 Nitro 输出/追踪故障，不能把三者混为一谈。

## 验证记录

| 轮次 | 环境 | 变更 | 结果 |
| --- | --- | --- | --- |
| 基线 | GitHub Actions | 默认 heap、Turbo 未限并发 | 约 4 GiB V8 heap OOM |
| 第一轮 | GitHub Actions PR CI | 8 GiB heap、Turbo concurrency=1、Node 22.x、RSS 诊断 | 待 CI 实测更新 |

## 长期判定标准

只有满足以下条件，才能把本故障视为真正稳定：

- PR CI 从干净依赖安装到生产构建完整通过；
- 不再出现 V8 heap OOM 或系统 exit 137；
- 后续重复 CI 不依赖手工重跑才能偶然成功；
- Windows 本地执行包标准 `build` 时自动继承高 heap 入口；
- 如果 Vercel 仍有失败，必须基于其真实失败阶段继续处理，而不能把 GitHub 绿色误认为 Vercel 已验证。
