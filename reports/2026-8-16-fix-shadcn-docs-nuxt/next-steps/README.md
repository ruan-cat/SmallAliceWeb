# Nuxt / shadcn-docs 后续风险登记表

> 建立日期：2026-08-18
>
> 目标：把本轮 Nuxt 文档站 OOM、Nitro standalone runtime、pnpm alias 与 Vercel 调查过程中暴露出的风险拆成可独立领取的加固任务。这里不是当前修复的实现清单，而是后续 AI agent / 新会话可以逐项完成的风险封堵队列。

## 使用规则

1. 每个风险文件都可以作为一个独立 AI agent 的任务入口。
2. agent 开始前先读取本目录 `README.md`、对应风险卡，以及 `../evidence/KNOWN-EVIDENCE.md`、`../experiments/` 中相关实验。
3. 不允许用“为了变绿而关闭功能”替代根因加固。
4. 涉及依赖图、pnpm linker、Nitro externals、V8 heap 的改动必须使用单变量实验，不与无关升级混在一起。
5. 完成后应在对应风险卡中补充：最终方案、验证 SHA、CI / Vercel 证据、是否仍有残余风险。
6. 如果某项风险最终证明不存在，也要写明证伪过程，不要直接删除任务卡。

## 优先级定义

- **P0**：可能让已通过的修复失效、让不完整产物进入关键分支、或造成不可重复构建，应优先封堵。
- **P1**：当前已有缓解措施，但仍存在平台差异、覆盖缺口或维护债务。
- **P2**：主要影响调查效率、长期可维护性或实验治理，不一定直接造成线上故障。

## 风险矩阵

| ID | 优先级 | 风险 | 当前状态 | 建议独立任务 |
| --- | --- | --- | --- | --- |
| R01 | P0 | 依赖解析未锁定，同 Git SHA 不等于同依赖快照 | OPEN | [锁定依赖解析与工具链](./R01-dependency-resolution-reproducibility.md) |
| R02 | P0 | 当前 `.output` smoke 仍位于 monorepo 内，父级 `node_modules` 可能意外救活缺失依赖 | OPEN | [隔离 Nitro standalone 产物验证](./R02-isolated-nitro-output-smoke.md) |
| R03 | P1 | runtime smoke 只覆盖 `/`，Content/search/组件展示仍缺独立功能验收 | OPEN | [扩大运行时功能覆盖](./R03-runtime-functional-coverage.md) |
| R04 | P0 | 5120 MiB 只是最低已测通过档，未来 graph 增长可能静默吃掉 headroom | OPEN | [建立内存与 graph 回归预算](./R04-memory-headroom-regression-budget.md) |
| R05 | P0 | 历史 source alias / blanket bundling 配置可能被重新引入并再次放大 production graph | OPEN | [建立 production bundling 回归护栏](./R05-production-bundling-regression-guard.md) |
| R06 | P1 | `@popperjs/core` 显式 npm alias 是当前兼容修复，未来 Element Plus / Nitro 升级可能使它过时或再次失配 | OPEN | [管理 alias workaround 生命周期](./R06-npm-alias-workaround-lifecycle.md) |
| R07 | P0 | 全局 `nodeLinker: hoisted` 已实测重新触发 5120 MiB OOM，未来安装策略变更风险很高 | OPEN | [约束 pnpm linker / hoist 策略](./R07-pnpm-linker-hoist-policy.md) |
| R08 | P1 | Windows 专用 `nitro.externals.trace=false` 与 Linux/Vercel 行为不一致 | OPEN | [验证跨平台 Nitro 输出一致性](./R08-windows-linux-nitro-parity.md) |
| R09 | P1 | GitHub Actions 与 Vercel 的 Node/pnpm/环境设置存在漂移可能 | OPEN | [建立 CI / Vercel 工具链一致性](./R09-ci-vercel-toolchain-parity.md) |
| R10 | P1 | 失败诊断 artifact 仅保留 1 天，完整 job log 通过连接器又曾不可稳定获取 | OPEN | [增强构建可观测性与证据留存](./R10-observability-and-artifact-retention.md) |
| R11 | P2 | 主报告、TEST-PLAN、FINAL-FIX、PR body 存在阶段性过时内容，可能误导下一位 agent | OPEN | [清理调查文档漂移](./R11-investigation-documentation-drift.md) |
| R12 | P2 | 大量 Draft 实验 PR / 分支累积，容易误合并、误引用或丢失实验边界 | OPEN | [治理实验 PR 与分支生命周期](./R12-experiment-pr-governance.md) |
| R13 | P1 | 5120 MiB 被硬编码在 wrapper 与 CI 两处，脚本契约缺少自动测试 | OPEN | [收敛 memory wrapper 契约](./R13-memory-wrapper-contract.md) |
| R14 | P1 | Nuxt / Nitro / Content / H3 / Vite / shadcn-docs 版本组合存在跨世代兼容风险 | OPEN | [建立框架兼容矩阵](./R14-framework-compatibility-matrix.md) |
| R15 | P0 | `dev` / `main` 当前无 branch protection，也没有 required status checks | OPEN | [启用关键分支保护和强制检查](./R15-branch-protection-required-checks.md) |

## 已知不能作为加固捷径的方案

本轮实验已经给出反例，后续 agent 不应重新把以下配置当默认修复：

- 直接把 heap 提高到 8 / 12 / 16 GiB；
- Linux / Vercel 永久全局 `nitro.externals.trace=false`；
- `nitro.experimental.legacyExternals=true`；
- `sourcemap.server=false`；
- `nitro.rollupConfig.treeshake=false`；
- 选择性或 blanket inline `element-plus` / 大量依赖；
- `shamefullyHoist`；
- 全局 `nodeLinker: hoisted`；
- 关闭 Content、search、文档页面或其他用户功能换取 CI 绿色。

## 当前已验证基线

当前主修复路径的关键基线包括：

- E1 production graph 缩减：移除 ai-vue production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline`；
- 5120 MiB 是当前最低已测试通过的 old-space 档位，4608 MiB 失败、6144 MiB 也成功；
- `packages/ai-vue-doc` 显式声明 `@popperjs/core -> npm:@sxzz/popperjs-es@^2.11.7` 后，Nitro standalone HTTP smoke 成功；
- CI 已包含 full production build、V8/RSS 观测、`.output/server/index.mjs` HTTP smoke 和 failure-only diagnostics artifact；
- 主 PR #11 保持 Draft，不在本轮自动合并。

后续任何加固任务都应先保证这些基线不被破坏，再评估是否可以进一步降低复杂度。