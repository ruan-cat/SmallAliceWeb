# 2026-08-19 对 2026-08-01 Nuxt Content 脆弱性报告的后续勘误

> 被纠偏的历史报告：`reports/2026-08-01-nuxt-content-monorepo-build-fragility-incident.md`
>
> 原报告保留当时事故事实；本文件只纠正后来被新证据推翻或收窄的泛化建议。

## 1. 为什么需要勘误

2026-08-01 报告同时引用 SmallAliceWeb 与另一个仓库 `eams-component-lib` 的 Nuxt Content 事故。另一个仓库历史上曾用 narrow `vite.ssr.noExternal` / `nitro.externals.inline` 处理其特定 externalization/workspace 问题。

2026-08-18～20 的 SmallAliceWeb E1～E7 给出了更直接的本仓库证据，不能继续把另一个仓库的 workaround 泛化成 SmallAliceWeb 依赖策略。

## 2. 8 GiB 不是永久构建基线

2026-08-01 的“8 GiB + 串行构建可以完成”是当时真实控制组，不是最低需求。

后续 graph 收敛后：

```text
默认约 4144 MiB -> final Nitro OOM
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

当前准确表述：**5120 MiB 是最低已测试通过档，实测阈值位于 `(4608, 5120]`；8 GiB 只保留为历史症状控制。**

## 3. noExternal / inline 不能复制成依赖族策略

SmallAliceWeb 本轮直接证据：

1. 删除 production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 后，server modules 约 4028 → 2449，约 -39%；
2. 仅 `nitro.externals.inline=["element-plus"]` 就让 5120 MiB production build 失败；
3. `.output` 实际缺失 `@popperjs/core` 属于 npm alias logical identity + pnpm symlink + Nitro standalone tracing/copy；
4. 最小有效修复是在部署 package 显式声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

所以旧报告的“保留 SSR noExternal、精准 inline”只能理解为：**不要无证据删除另一个仓库已经验证的 narrow exception**，绝不能解释为“SmallAliceWeb 应维护 UI 依赖族清单”。

## 4. 两个阶段不能机械镜像

Vite SSR transform 与 Nitro final server bundling/tracing 是不同生命周期。

- 一个包需要 Vite transform，不代表需要 Nitro inline；
- Nitro runtime 缺 package，不代表应该 Vite noExternal；
- “不能互相替代”更不意味着“两边各抄一份相同列表”。

## 5. 依赖枚举只能作为历史诊断，不是模板

未来新增 noExternal/inline 必须具备：

- exact error / first failing gate；
- exact package/path；
- 单变量实验；
- 为什么必须 transform/bundle；
- module count/RSS/build time 对照；
- 5120 full build；
- `.output` HTTP smoke；
- Vercel exact-SHA 验证；
- 删除条件。

## 6. 临时 memory wrapper 的后续纠偏

调查中一度使用 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs` 固定 5120 MiB 并统一子进程环境。后续证据证明它是控制工具而不是根修复。

退役 SHA `ba810875...` 已恢复原生 `nuxt prepare` / `nuxt build`，GitHub run `32335097226 / 96323008840` success，Vercel `dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt` READY。

因此长期观测应留在 CI/test harness，不应永久侵入 package scripts。

## 7. 当前权威说明

后续优先阅读：

- [`2026-8-16-fix-shadcn-docs-nuxt/dependency-externalization-policy.md`](./2026-8-16-fix-shadcn-docs-nuxt/dependency-externalization-policy.md)
- [`2026-8-16-fix-shadcn-docs-nuxt/complex-dependency-troubleshooting-methodology.md`](./2026-8-16-fix-shadcn-docs-nuxt/complex-dependency-troubleshooting-methodology.md)
- [`2026-8-16-fix-shadcn-docs-nuxt/experiments/e1-default-heap-minimal-bundle.md`](./2026-8-16-fix-shadcn-docs-nuxt/experiments/e1-default-heap-minimal-bundle.md)
- [`2026-8-16-fix-shadcn-docs-nuxt/experiments/e6-runtime-output-package-alias.md`](./2026-8-16-fix-shadcn-docs-nuxt/experiments/e6-runtime-output-package-alias.md)
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-20-temporary-build-wrapper-diagnostics-retirement.md`

旧报告继续作为历史证据，不作为当前 externalization 配置模板。
