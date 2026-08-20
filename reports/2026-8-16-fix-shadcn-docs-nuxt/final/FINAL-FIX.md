# FINAL FIX：Nuxt 文档构建与 standalone runtime 稳定化

> 更新：2026-08-20
>
> 状态：**当前功能修复已完成并通过 CI + runtime smoke + Vercel 验证。**

## 1. 最终功能提交

```text
a021ce96534360029e579183b8b5841b785f048a
🐞 fix: 收敛 Nuxt 文档构建与运行时依赖
```

该功能提交只修改 4 个文件：

1. `.github/workflows/ci.yaml`
2. `packages/ai-vue-doc/nuxt.config.ts`
3. `packages/ai-vue-doc/package.json`
4. `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`

后续提交主要用于补充调查证据、方法论和风险记录，不改变本节描述的功能修复模型。

## 2. 根因不是一个问题，而是两个独立故障轴

### 2.1 轴 A：production graph 被历史配置放大

历史 `nuxt.config.ts` 同时存在：

- production source alias，绕过 workspace package 正式发布边界直接消费源码；
- blanket / wide `vite.ssr.noExternal`；
- blanket / wide `nitro.externals.inline`。

E1 移除这些 graph amplifier 后：

```text
server transformed modules
约 4028 -> 2449
约 -39%
```

Nitro prerender 可以在默认约 4144 MiB heap 内完整结束，OOM 被明确后移到 final Nitro server Rollup/write path。

因此旧 bundling 配置确实显著增加了 production working set。

### 2.2 轴 B：standalone output 丢失 npm alias 的逻辑 runtime dependency

在 graph 收敛并使用 5120 MiB 后，full production build 可以成功，但 `.output` 真实 HTTP 请求暴露第二个独立问题：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

Element Plus 使用的逻辑运行时依赖关系是：

```text
@popperjs/core -> npm:@sxzz/popperjs-es
```

源码 workspace 中 package 可见，不代表 Nitro standalone tracing/copy 会保留运行时所需的逻辑 alias 身份。

因此最终 runtime 根因归类为：

```text
npm alias logical identity
+ pnpm symlink / visibility layout
+ Nitro standalone tracing/copy
-> .output runtime dependency closure 不完整
```

## 3. 最终采用的修复

### 3.1 收敛 production graph

`packages/ai-vue-doc/nuxt.config.ts` 不再维护历史依赖族枚举：

- 删除 production source alias；
- 删除 blanket `vite.ssr.noExternal`；
- 删除 blanket `nitro.externals.inline`。

保留：

- 项目必要兼容 aliases；
- debug shim alias；
- 仅 Windows 条件下的 `nitro.externals.trace=false`。

`noExternal` / `inline` 今后只允许作为 exact-error 驱动的 narrow exception。专项规则见 [`../DEPENDENCY-EXTERNALIZATION-POLICY.md`](../DEPENDENCY-EXTERNALIZATION-POLICY.md)。

### 3.2 使用已测量的 5120 MiB build headroom

E5：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

因此 wrapper/CI 使用 5120 MiB。

需要明确：

> **5120 是当前最低已测试通过档，不是根因，也不是永远不变的预算。**

它只在 production graph 已经收敛的前提下承担剩余 headroom。

### 3.3 在实际部署 package 显式声明 runtime alias dependency

`packages/ai-vue-doc/package.json` 增加：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

这样修的是实际 deployment package 的 runtime dependency boundary，而不是通过扩大 bundling graph 偶然把依赖卷进产物。

### 3.4 CI 增加真实 `.output` HTTP smoke

CI 不再停在 `nuxt build` 成功，而是：

1. 启动 `packages/ai-vue-doc/.output/server/index.mjs`；
2. 等待 server 监听；
3. 对根路由发真实 HTTP 请求；
4. 失败时保留 server log / response headers / response body。

这一步直接发现了最初 candidate 的 `@popperjs/core` runtime 缺包，也是本次调查的重要验收升级。

## 4. 明确拒绝的方案

| 方案 | 实验结果 | 为什么不采用 |
| --- | --- | --- |
| Linux 全局 `externals.trace=false` | E2-A ❌ | 不能恢复默认 heap，而且会改变 standalone trace 语义。 |
| `legacyExternals=true` | E2-B ❌ | 不能恢复默认 heap。 |
| `sourcemap.server=false` | E3 ❌ | 不是决定性峰值来源。 |
| `treeshake=false` | E4 ❌ | 无法解决当前问题。 |
| 只提高到 8/12/16 GiB | E0 只能控制症状 | 会掩盖 graph 膨胀。 |
| `nitro.externals.inline=["element-plus"]` | E6-B ❌ | 5120 MiB build 重新 OOM；大包 inline 会扩大 working set。 |
| `traceOpts.traceAlias` | E6-C build ✅ / runtime ❌ | 当前组合下仍缺 `@popperjs/core`。 |
| 全局 `nodeLinker: hoisted` | E7-A ❌ | 5120 MiB build OOM，max RSS `5,646,292 kB`。 |
| targeted `publicHoistPattern` | E7-B ✅ | 可作为 fallback，但作用域大于 app-local dependency，因此不作为首选。 |

## 5. 最终验证

### 5.1 Candidate / cold-runner

最终 candidate 相同 tree 通过：

- PR #22：full build + `.output` HTTP smoke ✅
- PR #23：cold-runner full build + HTTP smoke ✅
- PR #24：cold-runner full build + HTTP smoke ✅

### 5.2 主工作分支功能 SHA

GitHub Actions：

```text
SHA: a021ce96534360029e579183b8b5841b785f048a
run: 32118675630
job: 95653890207
result: success
```

已验证：

- dependency install ✅
- production build ✅
- `.output/server/index.mjs` startup ✅
- HTTP smoke ✅

### 5.3 Vercel

```text
deployment: dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs
```

结果：

- READY；
- Preview `/` HTTP 200；
- 查询到的近期 error/fatal runtime logs：0。

因此最终方案不是“本地能构建”的修复，而是经过 GitHub Linux runner、standalone runtime 与真实 Vercel deployment 三层验证。

## 6. 为什么最终方案比历史依赖枚举更健康

旧方式试图通过：

```text
Element Plus 出问题
-> noExternal/inline Element Plus
-> 再补 VueUse
-> 再补 Popper
-> 再补 lodash/entities/...
```

来人工维护传递依赖图。

最终方案改为：

```text
先定位 first failing gate
-> graph OOM：缩小 production bundling graph
-> build 后 MODULE_NOT_FOUND：检查 logical runtime package identity
-> 在实际 deployment package 补精确 dependency contract
-> 启动真实 artifact 验证
```

它的 blast radius 更小，因果关系也可以通过 E1/E6/E7 单变量实验解释。

## 7. 当前剩余技术加固

当前修复已经成立，但仍建议继续处理 [`../next-steps/README.md`](../next-steps/README.md) 中的真正技术风险：

- dependency resolution 可复现性；
- 把 `.output` 搬到 monorepo 外做 isolated smoke；
- 扩展 runtime route / Content / search 覆盖；
- 建立 memory/module-count 回归预算；
- 防止 wide bundling 配置回归；
- 管理 npm alias workaround 生命周期；
- 避免全局 pnpm linker/hoist 回归；
- 验证 Windows/Linux 与 CI/Vercel 工具链差异；
- 改善构建证据留存；
- 收敛 memory wrapper 单一真值；
- 维护 Nuxt/Content/H3/Element Plus compatibility matrix。

## 8. 当前结论

本轮故障已经从“Nuxt 文档站偶发大内存/依赖问题”被拆成可复现的两个根因面：

1. **production graph amplification**；
2. **standalone npm-alias dependency closure**。

最终修复遵循最小责任边界：

- graph 问题在 build graph 层收敛；
- runtime alias 问题在 deployment package manifest 层显式化；
- 5120 MiB 仅承担 graph 收敛后的实测 headroom；
- CI 用真实 HTTP runtime 证明产物，而不是依赖 build-complete 文本。

这就是当前可以继续维护的稳定基线。
