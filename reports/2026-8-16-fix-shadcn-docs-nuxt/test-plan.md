# Nuxt 文档构建稳定化测试计划与结果

> 更新：2026-08-20
>
> 状态：实验阶段已完成；临时 memory wrapper 已完成退役验证。

## 1. 测试目标

本轮分别验证：

1. production graph OOM 的结构性来源与最低已测 heap headroom；
2. full build 后 Nitro standalone runtime dependency closure；
3. 临时诊断 wrapper 是否可以在根因修复后安全删除。

生命周期始终拆开：

```text
install
→ Vite client/server
→ Nitro prerender
→ final Nitro server build/write
→ .output startup
→ HTTP runtime
→ Vercel
```

## 2. 实验纪律

- 每次只改变一个主要变量；
- 失败实验同样保留；
- build/runtime 分开记录；
- heap、module count、RSS、artifact runtime 都是指标；
- 临时 wrapper 只能作为控制变量，最终必须验证删除后的原生命令。

## 3. 已完成实验矩阵

| 实验 | 主要变量 | 结果 | 结论 |
| --- | --- | --- | --- |
| E0 | 8 GiB old-space | ✅ | 控制症状，不是根修复。 |
| E1 | 删除 source alias、blanket noExternal/inline；默认 heap | ❌ final Nitro OOM | server modules 约 4028→2449，约 -39%。 |
| E2-A | Linux `trace=false` | ❌ | 不采用。 |
| E2-B | legacy externals | ❌ | 不采用。 |
| E3 | server sourcemap off | ❌ | 不采用。 |
| E4 | treeshake off | ❌ | 不采用。 |
| E5-A | 4608 MiB | ❌ | 小于当前稳定需求。 |
| E5-B | 5120 MiB | ✅ | 最低已测试通过档。 |
| E5-C | 6144 MiB | ✅ | 上界稳定对照。 |
| E6-A | app-local `@popperjs/core` alias dependency | ✅ build + HTTP | 采用。 |
| E6-B | inline Element Plus | ❌ 5120 build | graph/working-set 回归。 |
| E6-C | traceAlias | ✅ build / ❌ runtime | 当前组合无效。 |
| E7-A | global hoisted linker | ❌ 5120 OOM | 不采用。 |
| E7-B | targeted public hoist | ✅ build + runtime | fallback。 |

详细历史：[`experiments/`](./experiments/)。其中 E7 见 [`experiments/e7-pnpm-layout-alias-visibility.md`](./experiments/e7-pnpm-layout-alias-visibility.md)。

## 4. E1 / E5 关键量化

E1：

- V8 heap limit 约 4144 MiB；
- server modules 2449；历史约 4028；
- graph 约 -39%；
- prerender 完成；
- final Nitro Rollup/write OOM；
- max RSS 约 4.55 GiB。

E5：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

只能表述为：最低已测试通过档为 5120 MiB，阈值位于 `(4608, 5120]`。

## 5. E6：build 绿色后仍可能 runtime 失败

初始 5120 candidate full build 成功，但 HTTP `/`：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

最终 E6-A 在部署 package 中显式声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

后 build + startup + HTTP smoke 全绿。

## 6. 候选重复验证

最终 candidate 相同 tree 在 PR #22/#23/#24 均通过 full build + HTTP smoke。

最终功能 SHA `a021ce96534360029e579183b8b5841b785f048a`：

- GitHub run `32118675630` / job `95653890207`：success；
- Vercel `dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs`：READY。

## 7. 临时 wrapper 退役验证

退役 SHA：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
```

变化：删除 `run-nuxt-with-memory.mjs`，package scripts 恢复 `nuxt prepare` / `nuxt build`；GitHub CI 继续仅在 build step 设置 5120 MiB。

验证：

- GitHub run `32335097226` / job `96323008840`：success；
- full production build：✅；
- `.output` startup：✅；
- HTTP smoke：✅；
- Vercel deployment `dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt`：READY；
- Vercel 日志确认原生 `nuxt prepare` / `nuxt build` 被实际执行。

因此 wrapper 已完成使命，不再是最终生产设计。

## 8. 当前验收覆盖

### 已完成

- [x] graph 收敛量化；
- [x] 5120 MiB 最低已测通过档；
- [x] final Nitro build；
- [x] `.output` startup；
- [x] 真实 HTTP smoke；
- [x] cold-runner 重复验证；
- [x] Vercel Git Preview；
- [x] wrapper 退役后的 GitHub + Vercel exact-SHA 验证。

### 后续加固

- [ ] `.output` 搬到 monorepo 外再 smoke；
- [ ] 增加 docs/Content/search/组件 route matrix；
- [ ] 锁定 dependency resolution；
- [ ] 持续保存 module count/RSS/heap 基线。

这些事项见 [`next-steps/readme.md`](./next-steps/readme.md)。

## 9. 停止条件

当前根因模型可以解释 graph OOM 与 standalone alias 缺包两条独立轴；高诱惑替代方案已有反例；build/runtime/Vercel 与 wrapper 退役均有 fresh 证据。后续出现新故障时建立新假设，不重复 E2/E3/E4/E6-B/E7-A。
