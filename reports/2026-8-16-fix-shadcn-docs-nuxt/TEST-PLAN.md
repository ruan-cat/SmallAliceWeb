# Nuxt 文档构建稳定化测试计划与结果

> 更新：2026-08-20
>
> 状态：**实验阶段已完成。** 本文件现在记录已执行测试矩阵、因果结论和当前验收覆盖，不再作为“正在运行的任务队列”。

## 1. 测试目标

本轮测试同时回答两个独立问题：

1. production build 为什么会在约 4 GiB old-space 附近 OOM，怎样降低 graph 并找到合理 headroom；
2. full build 成功后，Nitro standalone `.output` 是否真的包含完整 runtime dependency closure。

测试始终把下面几个 gate 分开：

```text
install
→ Vite client/server build
→ Nitro prerender
→ final Nitro server build/write
→ .output startup
→ HTTP runtime
→ Vercel
```

## 2. 实验纪律

- 每个诊断实验尽量从固定基线独立派生；
- 一次只改变一个主要变量；
- 失败实验同样保留，因为它们排除高诱惑性的错误方向；
- build success 与 runtime success 分开记录；
- heap、module count、RSS、output/runtime 都属于验收指标。

## 3. 已完成实验矩阵

| 实验 | 主要变量 | 结果 | 结论 |
| --- | --- | --- | --- |
| E0 | 8 GiB old-space 控制组 | ✅ | 增加 heap 可以稳定控制症状，但不能说明 graph 健康。 |
| E1 | 删除 production source alias、blanket `ssr.noExternal`、blanket `externals.inline`；默认 heap | ❌ final Nitro OOM | server modules 约 4028 → 2449，约 -39%；graph 放大器被证实。 |
| E2-A | Linux `nitro.externals.trace=false` | ❌ | 单独关闭 modern tracing 不足以恢复默认 heap。 |
| E2-B | `experimental.legacyExternals=true` | ❌ | legacy externals 不足以恢复默认 heap。 |
| E3 | `sourcemap.server=false` | ❌ | sourcemap 不是决定性剩余峰值来源。 |
| E4 | Rollup `treeshake=false` | ❌ | 不采用。 |
| E5-A | 4608 MiB | ❌ | 小于当前稳定需求。 |
| E5-B | 5120 MiB | ✅ | 当前最低已测试通过档。 |
| E5-C | 6144 MiB | ✅ | 为 E5-B 提供上界稳定对照。 |
| E6-A | app-local `@popperjs/core` npm alias dependency | ✅ build + HTTP runtime | **最终采用的 runtime 修复。** |
| E6-B | `nitro.externals.inline=["element-plus"]` | ❌ 5120 MiB build | 即使 selective inline 大 UI 包也会重新放大 working set。 |
| E6-C | `nitro.traceOpts.traceAlias` | ✅ build / ❌ runtime | 当前 Nuxt/Nitro/pnpm 组合下不能补齐 standalone alias。 |
| E7-A | `nodeLinker: hoisted` | ❌ 5120 MiB build OOM | 全局 linker 改动爆炸半径过大。 |
| E7-B | `publicHoistPattern: ["@popperjs/core"]` | ✅ build + runtime | 证明 pnpm visibility/layout 参与故障；保留为 fallback。 |

## 4. E1：production graph 收敛

E1 的关键数据：

- V8 heap limit：约 4144 MiB；
- server transformed modules：2449；
- 历史失败基线：约 4028；
- graph 减少：约 39%；
- Nitro prerender：完整成功；
- 最终在 `[nitro] Building Nuxt Nitro server ...` 后的 final Rollup/write path OOM；
- max RSS：约 4.55 GiB。

E1 因此证明：删除旧 bundling/source-alias 配置是结构性改善，即使默认 heap 仍不足以完成最后的 server build。

## 5. E5：heap 阈值

E5 的目的不是“找一个越大越好”的数字，而是在 graph 已经收敛后测量剩余真实 headroom。

结果：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

因此当前只允许表述为：

> **最低已测试通过档为 5120 MiB，已测稳定边界在 `(4608, 5120] MiB`。**

不能声称 5120 是精确数学最小值，也不能把未来 graph 增长简单用更大 heap 掩盖。

## 6. E6：build 绿色后暴露 standalone runtime 缺包

初始 5120 candidate 的 full production build 已经成功，但真实 HTTP runtime 报：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
imported from .output/server/node_modules/element-plus/...
```

这使调查从“构建内存”进入第二条独立轴：standalone dependency closure。

### E6-A：最终采用

在 `packages/ai-vue-doc/package.json` 中显式加入：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

结果：full build + `.output` startup + HTTP smoke 全部成功。

### E6-B：拒绝

只 inline `element-plus` 即导致 5120 MiB build 失败，因此不能用重新扩大 bundling graph 的方式修 alias runtime 缺包。

### E6-C：拒绝

`traceAlias` 不改变最终 runtime 缺包结果。

## 7. E7：pnpm 拓扑因果验证

E7-A：全局 `nodeLinker: hoisted`，run `32117268637` 失败；生产构建重新 OOM，max RSS `5,646,292 kB`。

E7-B：只 public-hoist `@popperjs/core`，run `32117424893` 成功，并通过 runtime smoke。

联合结论：pnpm visibility/layout 确实参与 alias tracing 问题，但 workspace-wide topology change 不是最小责任边界。最终仍采用 app-local runtime dependency。

详见 [`experiments/E7-pnpm-layout-alias-visibility.md`](./experiments/E7-pnpm-layout-alias-visibility.md)。

## 8. 最终候选重复性验证

候选最终 tree 在多条独立路径通过：

- PR #22 candidate：full build + HTTP smoke ✅
- cold PR #23：full build + HTTP smoke ✅
- cold PR #24：full build + HTTP smoke ✅

最终功能 commit：

```text
a021ce96534360029e579183b8b5841b785f048a
```

对应 GitHub Actions：

- run `32118675630`：success；
- job `95653890207`：success；
- production build：success；
- `.output` HTTP smoke：success。

对应 Vercel deployment：

```text
dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs
```

- READY；
- `/` HTTP 200；
- 查询到的近期 error/fatal logs：0。

## 9. 当前验收覆盖

### 已完成

- [x] production graph 收敛有量化证据；
- [x] final Nitro server build 完成；
- [x] 5120 MiB 最低已测试通过档被独立测量；
- [x] `.output/server/index.mjs` 可启动；
- [x] 对 `.output` 发起真实 HTTP 请求成功；
- [x] candidate/cold-runner 重复验证；
- [x] Vercel Git Preview READY；
- [x] Preview 根路由 HTTP 200。

### 后续加固，不影响当前修复结论

- [ ] 把 `.output` 复制到 monorepo 之外再 smoke；
- [ ] 增加代表性 docs / Content / search / static asset runtime route matrix；
- [ ] 固定 dependency resolution 快照；
- [ ] 把 module count / RSS / heap 纳入持续回归预算。

这些事项已进入 [`next-steps/README.md`](./next-steps/README.md)，不再混入“当前实验是否完成”的状态描述。

## 10. 停止条件

当前调查已经满足停止条件：

- 根因模型可以解释 graph OOM 与 standalone runtime 缺包两条独立轴；
- 采用方案的责任边界小于被拒绝方案；
- 同类高诱惑替代方案已通过单变量实验排除；
- build、runtime、真实 Vercel 三个 gate 均有 fresh 成功证据。

后续若再次出现依赖问题，应创建新的故障假设，不再把 E2/E3/E4 或旧依赖枚举方案重新当“待尝试项”。
