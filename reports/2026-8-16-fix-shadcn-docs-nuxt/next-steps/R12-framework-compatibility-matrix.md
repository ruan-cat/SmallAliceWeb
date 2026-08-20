# R12 Nuxt / Nitro / Content / H3 / Vite / shadcn-docs 组合缺少显式兼容矩阵

- **优先级**：P1
- **状态**：OPEN
- **类型**：框架升级 / 依赖兼容

## 风险说明

本仓库的 Nuxt 文档站不是单一 Nuxt 包，而是由多层框架和插件共同组成：

- Nuxt；
- Nitro；
- Vite；
- `@ztl-uwu/nuxt-content`；
- H3；
- `shadcn-docs-nuxt`；
- Vue；
- Element Plus；
- pnpm workspace packages。

本仓库已有 `2026-08-01-nuxt-content-monorepo-compatibility.md` 事故经验，说明跨 Nuxt/H3 世代解析曾经真实造成兼容问题。本轮又出现 Nitro 2.13.4 + pnpm npm alias tracing 的 runtime output 边界。

因此后续不能把“升级 Nuxt”当成只升级一个包。上游 patch/minor 可能同时改变 Nitro、Vite、Content hooks、externals tracing、SSR graph 与 memory profile。

## 当前已知基线

本轮 E1 fresh run 曾记录实际解析：

- Node `22.23.2`；
- Nuxt `3.21.11`；
- Nitro `2.13.4`；
- Vite `7.3.6`；
- Vue `3.5.41`。

当前 package metadata 还明确包含：

- `@ztl-uwu/nuxt-content: 2.13.9`；
- `h3: 1.15.11`；
- `shadcn-docs-nuxt: 1.1.9`；
- `element-plus: ^2.13.5`。

由于 R01 仍未解决，实际解析未来还可能漂移。

## 建议加固任务

1. 建立一份“已验证组合矩阵”，至少记录 Nuxt / Nitro / Vite / Vue / Content / H3 / shadcn-docs / Element Plus / pnpm / Node。
2. 每次框架升级先从当前绿色基线做单独 PR，不夹带 bundling、hoist、heap 上调。
3. 升级验证至少覆盖：
   - 5120 MiB full build；
   - module count / max RSS 对比；
   - R02 isolated output；
   - R03 Content/search/组件 smoke；
   - Vercel Preview。
4. 若升级跨 Nuxt/Nitro 大版本边界，先阅读上游 migration / breaking changes，不直接在主修复 PR 上试。
5. 当某一组合被证实失败时，记录“失败矩阵”而不是只回滚版本，让后续 agent 不重复踩坑。

## 验收标准

- [ ] 仓库有当前绿色版本组合记录。
- [ ] 框架升级 PR 能展示升级前后实际解析版本。
- [ ] 跨大版本升级有独立实验分支和回退点。
- [ ] Nuxt/Content/H3 runtime 世代不会因 hoist/alias 被意外混用。
- [ ] 每次升级都包含 standalone runtime 和 search/content 验收。

## 不要做什么

- 不要为了修当前问题直接强行跨到 Nitro 3 / Nuxt 4。
- 不要只根据 package.json range 推断实际运行版本。
- 不要在没有 lockfile 与完整版本记录时宣称某个升级“完全可复现”。
