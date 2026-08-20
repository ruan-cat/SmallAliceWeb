# Nuxt 修复后续技术风险登记表

> 更新：2026-08-20
>
> 本目录只保留与 `packages/ai-vue-doc` **构建正确性、运行时完整性、依赖可复现性和资源回归**直接相关、尚未完成的技术风险。
>
> 已完成的调查整理工作不作为风险继续登记；与仓库治理或任务调度有关的事项也不放在本目录。
>
> 当前风险卡已重新压缩为连续编号 **R01–R12**。后续若删除风险卡，应同步重排本目录编号与所有内部引用，避免再次出现编号断层。

## 当前已验证基线

当前功能修复基线为 commit `a021ce96534360029e579183b8b5841b785f048a`，核心结论：

- 移除 production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 后，server transformed modules 从历史约 4028 降至 2449，约减少 39%；
- 4608 MiB old-space 失败，5120 / 6144 MiB 成功；5120 MiB 是当前**最低已测试通过档**，不是数学意义精确下限；
- initial 5120 candidate 的 build 可成功，但 standalone HTTP runtime 因 `@popperjs/core` 缺失而失败；
- 最终通过在实际部署 package 显式声明 `@popperjs/core -> npm:@sxzz/popperjs-es@^2.11.7` 修复 runtime dependency closure；
- GitHub Actions full production build + `.output` HTTP smoke 成功；
- 对应 Vercel Git Preview READY，根路由 HTTP 200。

详细结论见：

- [`../final/FINAL-FIX.md`](../final/FINAL-FIX.md)
- [`../evidence/KNOWN-EVIDENCE.md`](../evidence/KNOWN-EVIDENCE.md)
- [`../hypotheses/ROOT-CAUSE-MODEL.md`](../hypotheses/ROOT-CAUSE-MODEL.md)
- [`../DEPENDENCY-EXTERNALIZATION-POLICY.md`](../DEPENDENCY-EXTERNALIZATION-POLICY.md)
- [`../COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md`](../COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md)

## 风险清单（按编号）

| 编号 | 优先级 | 风险 | 后续方向 |
| --- | --- | --- | --- |
| [R01](./R01-dependency-resolution-reproducibility.md) | P0 | 依赖解析不可完全复现 | 提交 lockfile、使用 frozen install，并记录实际工具链版本。 |
| [R02](./R02-isolated-nitro-output-smoke.md) | P0 | standalone smoke 仍位于 monorepo 内 | 把 `.output` 复制到仓库外，排除父级 `node_modules` 偶然救活。 |
| [R03](./R03-runtime-functional-coverage.md) | P1 | runtime smoke 当前覆盖路由有限 | 增加代表性 docs、组件、Content/search、静态资源探针。 |
| [R04](./R04-memory-headroom-regression-budget.md) | P0 | 5120 MiB headroom 可能被未来 graph 增长吃掉 | 持续比较 transformed modules、RSS、heap 和 build duration。 |
| [R05](./R05-production-bundling-regression-guard.md) | P0 | production bundling graph 可能被历史配置重新放大 | 防止 wide source alias / noExternal / inline 回归。 |
| [R06](./R06-npm-alias-workaround-lifecycle.md) | P1 | `@popperjs/core` direct alias workaround 未来可能过期 | 跟踪上游并通过 isolated output 验证决定是否移除。 |
| [R07](./R07-pnpm-linker-hoist-policy.md) | P0 | workspace 级 linker/hoist 改动可能重写构建边界 | 对 linker/hoist 变更执行专项 graph、内存与 runtime 回归。 |
| [R08](./R08-windows-linux-nitro-parity.md) | P1 | Windows-only `trace:false` 与 Linux/Vercel 输出路径不同 | 保持平台条件化，并定期做跨平台产物验证。 |
| [R09](./R09-ci-vercel-toolchain-parity.md) | P1 | CI 与 Vercel 工具链可能漂移 | 记录 Node/pnpm/Nuxt/Nitro/Vite 与 exact Git SHA。 |
| [R10](./R10-observability-and-artifact-retention.md) | P1 | 失败证据留存仍偏弱 | 延长诊断留存并输出 machine-readable summary。 |
| [R11](./R11-memory-wrapper-contract.md) | P1 | 5120 配置存在 wrapper/CI 双写 | 收敛单一真值并验证 Windows/Linux spawn 行为。 |
| [R12](./R12-framework-compatibility-matrix.md) | P1 | Nuxt/Content/H3/Element Plus 组合仍存在升级漂移面 | 建立受控兼容矩阵，逐组验证而不是单包跳版本。 |

## 后续任务统一原则

1. **先分生命周期，再修依赖。** install、Vite SSR、Nitro build、standalone runtime、Vercel 是不同验收门。
2. **先修最小责任边界。** dependency manifest / package identity 优先于 workspace hoist 或大范围 bundling。
3. **任何 bundling exception 都必须单变量验证。** 不恢复依赖族枚举表。
4. **build 绿色不等于 runtime 绿色。** 必须实际启动产物并发送 HTTP 请求。
5. **资源变化也是回归。** 修 dependency 的同时必须观察 transformed modules、RSS、heap、duration。

## 明确不再重复的方向

- Linux/Vercel 永久全局 `nitro.externals.trace=false`；
- `experimental.legacyExternals=true` 作为当前修复；
- `sourcemap.server=false` 作为当前修复；
- `rollupConfig.treeshake=false` 作为当前修复；
- 为一个 runtime 缺包 inline 整个 Element Plus；
- 全局 `nodeLinker: hoisted` / `shamefullyHoist`；
- 用更大的 heap 掩盖 production graph 再次膨胀；
- 只看 `nuxt build` 成功就宣布可部署。
