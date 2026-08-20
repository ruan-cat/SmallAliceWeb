# 2026-08-18～20 Nuxt 文档构建与 standalone runtime 稳定化调查

> 状态：**主要故障调查完成；功能修复与临时 wrapper 退役均已通过 GitHub Actions / Vercel 验证。**
>
> 主 PR：#11 `fix(ci): 稳定 Nuxt 文档构建内存`，继续保持 Draft / open / 未合并。
>
> 本文件是当前调查的权威状态入口；`experiments/` 只保存单次实验历史。

## 1. 最终结论

本轮存在两条独立故障轴：

1. **production graph amplification**：历史 production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline` 显著放大 server graph；
2. **standalone npm-alias dependency closure**：pnpm npm alias `@popperjs/core -> npm:@sxzz/popperjs-es` 在 Nitro standalone tracing/copy 边界未稳定保留逻辑 runtime package identity。

E1 删除 graph amplifier 后，server transformed modules：

```text
约 4028 -> 2449
约 -39%
```

在 graph 收敛后，old-space 实测：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

所以 5120 MiB 是当前**最低已测试通过档**，不是根因，也不是数学精确下限。

## 2. 当前生产代码形态

当前最终形态不再依赖临时 wrapper。

`packages/ai-vue-doc/package.json` 已恢复：

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "predev": "nuxt prepare",
    "prebuild": "nuxt prepare",
    "build": "nuxt build",
    "typecheck": "nuxt typecheck",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare"
  }
}
```

保留真正的 runtime 修复：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

`packages/ai-vue-doc/nuxt.config.ts`：

- 没有 production alias 到 `../ai-vue/src`；
- 没有 blanket/wide `vite.ssr.noExternal`；
- 没有 blanket/wide `nitro.externals.inline`；
- 保留必要 compatibility aliases；
- 只在 Windows 条件下使用 `nitro.externals.trace=false`。

GitHub CI 在 production build step 直接设置：

```text
NODE_OPTIONS=--max-old-space-size=5120
```

因此内存预算属于 CI build 环境约束，不再通过 package wrapper 注入。

## 3. 临时 wrapper 已退役

退役提交：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
🐞 fix: 退役 Nuxt 临时内存包装脚本
```

该提交删除：

```text
packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs
```

并恢复原生 Nuxt scripts。

### GitHub exact-SHA 验证

```text
run: 32335097226
job: 96323008840
result: success
```

已通过：

- dependency install；
- 5120 MiB production build；
- `.output/server/index.mjs` startup；
- 真实 HTTP smoke。

### Vercel exact-SHA 验证

```text
deployment: dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt
state: READY
```

Vercel build log 明确显示：

```text
packages/ai-vue-doc postinstall$ nuxt prepare
...
@ruan-cat-drill-doc/ai-vue-doc#build
> nuxt prepare
> nuxt build
```

即 wrapper 已不再参与实际 Vercel 构建。

历史 E5-B (`88d17073...`) 也曾在无 wrapper、Vercel 无 previous build cache 的条件下完整安装/构建并 READY，作为额外对照。

## 4. 实验矩阵

| 实验 | 变量 | 结果 | 当前结论 |
| --- | --- | --- | --- |
| E0 | 8 GiB 控制 | ✅ | 只能控制症状。 |
| E1 | 删除 source alias + blanket noExternal/inline；默认 heap | ❌ final Nitro OOM；graph -39% | graph amplifier 被证实。 |
| E2-A | Linux `trace=false` | ❌ | 不采用。 |
| E2-B | legacy externals | ❌ | 不采用。 |
| E3 | server sourcemap off | ❌ | 不采用。 |
| E4 | treeshake off | ❌ | 不采用。 |
| E5 | 4608 / 5120 / 6144 | ❌ / ✅ / ✅ | 5120 为最低已测试通过档。 |
| E6-A | app-local Popper alias dependency | ✅ build + runtime | **采用。** |
| E6-B | inline Element Plus | ❌ 5120 OOM | forced bundling 回归。 |
| E6-C | `traceAlias` | ✅ build / ❌ runtime | 当前组合无效。 |
| E7-A | `nodeLinker: hoisted` | ❌ 5120 OOM | 全局拓扑改动爆炸半径过大。 |
| E7-B | targeted public hoist | ✅ build + runtime | 仅作为 fallback。 |

实验文件见 [`experiments/`](./experiments/)。

## 5. 为什么 build success 不足够

初始 5120 candidate 可以完成 full build，但真实 HTTP `/` 返回：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

所以验收必须区分：

```text
install
→ Vite build
→ Nitro prerender
→ final Nitro build
→ .output startup
→ HTTP runtime
→ Vercel
```

CI 的真实 HTTP smoke 是本轮最重要的长期测试升级之一。

## 6. 文档索引

### 当前结论

- [`final/final-fix.md`](./final/final-fix.md)：最终修复、wrapper 退役与验证。
- [`evidence/known-evidence.md`](./evidence/known-evidence.md)：可复核事实。
- [`hypotheses/root-cause-model.md`](./hypotheses/root-cause-model.md)：最终根因模型。
- [`test-plan.md`](./test-plan.md)：实验与验收矩阵。

### 可复用方法

- [`dependency-externalization-policy.md`](./dependency-externalization-policy.md)：`noExternal` / `inline` 专项边界。
- [`complex-dependency-troubleshooting-methodology.md`](./complex-dependency-troubleshooting-methodology.md)：复杂依赖、证据采集、临时工具退役通用方法。
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`：standalone alias 事故经验。
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-20-temporary-build-wrapper-diagnostics-retirement.md`：临时 wrapper 与错误取证退役经验。

### 后续技术加固

- [`next-steps/readme.md`](./next-steps/readme.md)：只保留尚未完成的技术风险。

## 7. 当前剩余边界

- dependency resolution 尚未由 lockfile 完全冻结；
- `.output` smoke 仍应进一步搬到 monorepo 外验证；
- runtime route/Content/search 覆盖可扩大；
- memory/module-count 应建立持续回归预算；
- Windows/Linux、GitHub/Vercel 工具链差异仍应持续验证。

临时 wrapper 已经完成使命，不再属于后续风险。

## 8. 当前状态

主故障已完成因果收敛。后续新的依赖问题应从根因模型和通用方法论开始，不重新尝试 E2/E3/E4/E6-B/E7-A，也不恢复旧依赖枚举表或已经退役的 memory wrapper。
