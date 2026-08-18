# 2026-08-19 对 2026-08-01 Nuxt Content 脆弱性报告的后续勘误

> 被纠偏的历史报告：`reports/2026-08-01-nuxt-content-monorepo-build-fragility-incident.md`
>
> 原报告保留 2026-08-01 当时的调查事实，本文件只纠正后来被新证据推翻或收窄的**泛化建议**，避免重写历史。

## 1. 为什么需要勘误

2026-08-01 的报告同时引用了 SmallAliceWeb 与另一个仓库 `eams-component-lib` 的 Nuxt Content 事故。

其中 `eams-component-lib` 的历史修复包含：

- `vite.ssr.noExternal`；
- 精准 `nitro.externals.inline`；
- Windows-only `trace:false`；
- Content prerender 恢复。

原报告在专项建议中写过“保留平台条件化 trace、SSR `noExternal`、精准 inline”。这个表述在当时是在描述 **eams-component-lib 已验证过的仓库特定 workaround**，但如果后续 agent 把它泛化为 SmallAliceWeb 的依赖处理规范，就会产生错误方向。

2026-08-18～19 的 SmallAliceWeb E1～E7 实验已经提供了新的、更直接的本仓库证据，因此必须收窄该结论。

## 2. 勘误一：8 GiB 不是当前永久构建基线

2026-08-01 报告中“8 GiB + 串行构建可以自然完成”是当时真实的控制组事实，但不是长期最低需求。

后续调查在移除 production graph 放大器后测得：

- 默认约 4144 MiB：final Nitro build OOM；
- 4608 MiB：失败；
- 5120 MiB：成功；
- 6144 MiB：成功。

因此当前准确说法是：

> **5120 MiB 是当前最低已测试通过档位，实测稳定阈值被夹在 `(4608, 5120] MiB`。8 GiB 只保留为历史症状控制组。**

不得从旧报告恢复“Windows/Nuxt 文档构建默认就需要 8 GiB”的规则。

## 3. 勘误二：`noExternal` / `inline` 不能从 eams 事故复制成 SmallAliceWeb 策略

原报告关于 `eams-component-lib` 的事实仍然成立于其历史上下文：它当时的 externalization、workspace symlink、Vercel dependency copy 故障确实曾由特定 bundling 配置缓解。

但 SmallAliceWeb 本轮直接实验得到：

1. 移除 production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 后，server transformed modules 从历史约 4028 降到 2449，约减少 39%；
2. 仅 `nitro.externals.inline = ["element-plus"]` 就足以让 5120 MiB production build 失败；
3. `.output` 中实际缺失 `@popperjs/core` 的根因是 npm alias logical identity + pnpm symlink + Nitro standalone tracing/copy；
4. 最终有效修复是给实际部署 package 显式增加：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

因此原报告中的“保留 SSR noExternal、精准 inline”只能理解为：

> **不要随意删除一个已经在特定仓库、特定故障上有直接证据的 narrow exception。**

它绝不意味着：

> **复杂 Nuxt monorepo 应维护一张 Element Plus / VueUse / Popper / lodash 等依赖族清单，并同时复制到 Vite 和 Nitro。**

## 4. 勘误三：原报告第 4.4 节应如何理解

原报告写道 Vite SSR、Nitro Rollup 与 NFT 在不同阶段决定 externalization，并指出 `inline` 与 `noExternal` 不能互相替代。

这个判断本身仍然成立，但后续规则应进一步明确：

- “不能互相替代”不等于“两个阶段各维护一份相同列表”；
- 一个包需要 Vite transform，不代表它需要 Nitro inline；
- 一个 package 在 Nitro runtime 缺失，不代表应该通过 Vite noExternal 修；
- 必须先判断错误发生在哪一个生命周期，再只修改对应层。

## 5. 勘误四：旧报告中的依赖枚举只能作为诊断历史，不能成为模板

以后如需新增 `ssr.noExternal` / `nitro.externals.inline`，必须满足：

- exact error；
- exact package/path；
- 单变量实验；
- 说明为什么必须 transform/bundle；
- module count / RSS 无不可接受退化；
- `.output` HTTP smoke；
- Vercel 验证；
- upstream issue 与删除条件。

禁止把旧配置复制回来后再逐个补传递依赖。

## 6. 当前权威说明

后续 agent 处理 `packages/ai-vue-doc` externalization 问题时，应优先阅读：

- [`2026-8-16-fix-shadcn-docs-nuxt/DEPENDENCY-EXTERNALIZATION-POLICY.md`](./2026-8-16-fix-shadcn-docs-nuxt/DEPENDENCY-EXTERNALIZATION-POLICY.md)
- [`2026-8-16-fix-shadcn-docs-nuxt/experiments/E1-default-heap-minimal-bundle.md`](./2026-8-16-fix-shadcn-docs-nuxt/experiments/E1-default-heap-minimal-bundle.md)
- [`2026-8-16-fix-shadcn-docs-nuxt/experiments/E6-runtime-output-package-alias.md`](./2026-8-16-fix-shadcn-docs-nuxt/experiments/E6-runtime-output-package-alias.md)
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`

旧报告继续保留为 2026-08-01 的历史证据，不再作为 externalization 配置模板。
