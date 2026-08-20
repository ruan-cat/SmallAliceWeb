# Nuxt / shadcn-docs 后续风险登记表

> 建立日期：2026-08-18
>
> 目标：记录本轮 Nuxt 文档站 OOM、Nitro standalone runtime、pnpm alias 与依赖 externalization 调查中暴露出的**技术风险与架构风险**。
>
> 本目录只保留会影响软件正确性、依赖边界、构建产物、运行时行为的问题。不记录纯任务管理、AI 调度过程、PR 管理流程或仓库治理流程。

## 使用规则

1. 每个风险文件作为独立技术加固任务入口。
2. 涉及依赖图、pnpm linker、Nitro externals、V8 heap 的修改必须使用单变量实验。
3. 完成后记录方案、验证 SHA、CI / Vercel 证据和残余风险。
4. 如果风险被证伪，应保留证伪过程，不以删除历史证据代替结论。

## 风险矩阵

| ID | 优先级 | 风险 | 当前状态 |
| --- | --- | --- | --- |
| R01 | P0 | 依赖解析未锁定，同 Git SHA 不等于同依赖快照 | OPEN |
| R02 | P0 | `.output` smoke 位于 monorepo 内，父级 node_modules 可能意外影响结果 | OPEN |
| R03 | P1 | runtime smoke 覆盖不足，Content/search/组件展示需要独立验收 | OPEN |
| R04 | P0 | 5120 MiB 是当前最低已测通过档，未来 graph 增长可能消耗 headroom | OPEN |
| R05 | P0 | source alias / blanket bundling 配置可能重新放大 production graph | OPEN |
| R06 | P1 | `@popperjs/core` npm alias 兼容修复需要生命周期管理 | OPEN |
| R07 | P0 | 全局 `nodeLinker: hoisted` 已有重新触发 OOM 的反例 | OPEN |
| R08 | P1 | Windows / Linux / Vercel Nitro 输出行为可能存在差异 | OPEN |
| R09 | P1 | GitHub Actions 与 Vercel 工具链可能漂移 | OPEN |
| R10 | P1 | 构建失败证据留存和 artifact 可观测性需要加强 | OPEN |
| R13 | P1 | 5120 MiB wrapper 与 CI 配置存在重复维护风险 | OPEN |
| R14 | P1 | Nuxt / Nitro / Content / H3 / Vite / shadcn-docs 版本组合存在兼容矩阵风险 | OPEN |

## 已移除的非核心任务项

以下项目已从风险登记中移除，不属于本次复杂依赖故障本身：

- R11：调查文档与 PR 描述阶段性漂移。
  - 属于长期任务资料同步和维护流程问题，不属于软件依赖、构建或运行时风险。
  - 文档整理应通过当前调查文档维护完成，不作为技术风险卡管理。

- R12：Draft 实验 PR / 分支生命周期治理。
  - 属于 AI 调度和实验流程管理问题，不属于应用故障风险。
  - 实验 PR 收尾由执行流程负责，不进入技术风险池。

- R15：branch protection / required status checks。
  - 属于 GitHub 仓库治理策略，不属于本次 Nuxt 依赖与构建故障范围。
  - 如未来需要治理，应单独作为仓库管理任务处理。

## 已知不能作为默认修复的方案

- 直接提高 heap 到 8 / 12 / 16 GiB；
- 永久全局 `nitro.externals.trace=false`；
- `nitro.experimental.legacyExternals=true`；
- `sourcemap.server=false`；
- `nitro.rollupConfig.treeshake=false`；
- blanket inline 大型依赖；
- `shamefullyHoist`；
- 全局 `nodeLinker: hoisted`；
- 关闭 Content/search/文档功能换取 CI 绿色。

## 当前已验证基线

- E1 删除 production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 后缩小 production graph。
- 5120 MiB 为当前最低已测试通过 old-space 档位。
- `packages/ai-vue-doc` 显式声明 `@popperjs/core -> npm:@sxzz/popperjs-es@^2.11.7` 后 standalone runtime smoke 成功。
- CI 包含 full production build、资源观测、`.output/server/index.mjs` HTTP smoke。

后续加固任务必须先保护这些基线，再进行复杂依赖调整。