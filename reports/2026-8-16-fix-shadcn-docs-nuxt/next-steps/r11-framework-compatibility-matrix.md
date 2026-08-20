# R11 Nuxt / Nitro / Content / H3 / Vite / shadcn-docs 组合缺少显式兼容矩阵

- **优先级**：P1
- **状态**：OPEN
- **类型**：框架升级 / 依赖兼容

## 风险说明

文档站由 Nuxt、Nitro、Vite、`@ztl-uwu/nuxt-content`、H3、`shadcn-docs-nuxt`、Vue、Element Plus 和 pnpm workspace packages 共同组成。

仓库已有 Nuxt Content/H3 世代失配事故，本轮又出现 Nitro + pnpm npm alias tracing 的 runtime output 边界。因此“升级 Nuxt”不能被当成单包升级；patch/minor 也可能改变 Nitro、Vite、Content hooks、SSR graph、external tracing 和 memory profile。

## 当前已知基线

E1 fresh run 曾记录：

- Node `22.23.2`；
- Nuxt `3.21.11`；
- Nitro `2.13.4`；
- Vite `7.3.6`；
- Vue `3.5.41`。

当前 manifest 还包含：

- `@ztl-uwu/nuxt-content: 2.13.9`；
- `h3: 1.15.11`；
- `shadcn-docs-nuxt: 1.1.9`；
- `element-plus: ^2.13.5`。

由于 R01 尚未闭合，实际解析未来仍可能漂移。

## 建议加固

1. 建立已验证组合矩阵：Node / pnpm / Nuxt / Nitro / Vite / Vue / Content / H3 / shadcn-docs / Element Plus；
2. 框架升级从当前绿色基线单独 PR，不夹带 bundling、hoist、heap 上调；
3. 升级至少验证：5120 MiB full build、module/RSS 对比、R02 isolated output、R03 Content/search/组件 smoke、Vercel Preview；
4. 跨 Nuxt/Nitro 大版本前先阅读 migration/breaking changes；
5. 已证实失败的组合也记录进矩阵，避免未来重复试错。

## 验收标准

- [ ] 有当前绿色版本组合记录；
- [ ] 升级前后展示实际 resolved versions；
- [ ] 跨大版本有独立实验和回退点；
- [ ] Nuxt/Content/H3 runtime 世代不会因 hoist/alias 意外混用；
- [ ] 每次升级包含 standalone runtime 与 search/content 验收。

## 不要做什么

- 不要为了当前问题直接跨到 Nitro 3 / Nuxt 4；
- 不要只看 package.json range 推断真实运行版本；
- 不要在没有 lockfile/版本快照时宣称升级完全可复现。
