# Nuxt 修复后续技术风险登记表

> 更新：2026-08-20
>
> 本目录只保留与 `packages/ai-vue-doc` 构建正确性、运行时完整性、依赖可复现性和资源回归直接相关、尚未完成的技术风险。
>
> 已完成事项不继续伪装成“风险卡”。临时 memory wrapper 已退役并完成双流水线验证，因此原 wrapper 风险卡已删除；编号重新压缩为连续 **R01–R11**。

## 当前已验证基线

- production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 已移除；
- server transformed modules 历史约 4028 → E1 2449，约 -39%；
- 4608 MiB fail，5120/6144 MiB pass，5120 为最低已测试通过档；
- `@popperjs/core -> npm:@sxzz/popperjs-es@^2.11.7` 由实际部署 package 显式声明；
- GitHub full production build + `.output` HTTP smoke 已通过；
- Vercel Git Preview 已通过；
- `run-nuxt-with-memory.mjs` 已删除，package scripts 已恢复原生 Nuxt commands；
- wrapper 退役 SHA `ba810875...` 的 GitHub run `32335097226 / 96323008840` success，Vercel `dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt` READY。

权威说明：

- [`../final/final-fix.md`](../final/final-fix.md)
- [`../evidence/known-evidence.md`](../evidence/known-evidence.md)
- [`../hypotheses/root-cause-model.md`](../hypotheses/root-cause-model.md)
- [`../dependency-externalization-policy.md`](../dependency-externalization-policy.md)
- [`../complex-dependency-troubleshooting-methodology.md`](../complex-dependency-troubleshooting-methodology.md)

## 风险清单

| 编号 | 优先级 | 风险 | 后续方向 |
| --- | --- | --- | --- |
| [R01](./r01-dependency-resolution-reproducibility.md) | P0 | 依赖解析不可完全复现 | 提交 lockfile、frozen install、记录实际工具链。 |
| [R02](./r02-isolated-nitro-output-smoke.md) | P0 | standalone smoke 仍位于 monorepo 内 | 把 `.output` 复制到仓库树外再启动。 |
| [R03](./r03-runtime-functional-coverage.md) | P1 | runtime route 覆盖有限 | 增加 docs、组件、Content/search 代表性探针。 |
| [R04](./r04-memory-headroom-regression-budget.md) | P0 | 5120 headroom 可能被未来 graph 增长吃掉 | 持续比较 modules/RSS/heap/duration。 |
| [R05](./r05-production-bundling-regression-guard.md) | P0 | historical bundling graph amplifier 可能回归 | 防止 wide source alias/noExternal/inline。 |
| [R06](./r06-npm-alias-workaround-lifecycle.md) | P1 | Popper direct alias workaround 未来可能过期 | 跟踪上游并用 isolated output 决定移除时机。 |
| [R07](./r07-pnpm-linker-hoist-policy.md) | P0 | workspace linker/hoist 改动可能重写构建边界 | topology 变更必须做 graph、内存、runtime 回归。 |
| [R08](./r08-windows-linux-nitro-parity.md) | P1 | Windows-only `trace:false` 与 Linux/Vercel 不同 | 定期做跨平台 output 验证。 |
| [R09](./r09-ci-vercel-toolchain-parity.md) | P1 | CI/Vercel 工具链可能漂移 | 记录 Node/pnpm/Nuxt/Nitro/Vite 与 exact SHA。 |
| [R10](./r10-observability-and-artifact-retention.md) | P1 | 诊断证据留存偏弱 | 延长高信号 artifact、输出机器可读 summary。 |
| [R11](./r11-framework-compatibility-matrix.md) | P1 | Nuxt/Content/H3/Element Plus 升级组合可能漂移 | 建立受控兼容矩阵。 |

## 后续任务统一原则

1. 先分生命周期，再修依赖。
2. manifest/package identity 优先于 workspace hoist 或大范围 bundling。
3. bundling exception 必须单变量、exact-error 驱动。
4. build 绿色不等于 runtime 绿色，必须真实 HTTP。
5. 资源变化也是回归。
6. 临时 wrapper/shim 完成调查后必须退役，不能因为“曾经有用”永久留在 package scripts。
7. 删除风险卡时同步压缩编号和更新引用。

## 明确不再重复

- Linux/Vercel 永久全局 `nitro.externals.trace=false`；
- legacy externals / sourcemap off / treeshake off 作为当前修复；
- 为 runtime 缺包 inline 整个 Element Plus；
- global `nodeLinker: hoisted` / `shamefullyHoist`；
- 用更大 heap 掩盖 graph 回归；
- 只看 `nuxt build` success；
- 重新引入已退役的 `run-nuxt-with-memory.mjs`。
