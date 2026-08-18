# E2：最终 Nitro Rollup / externals 单变量实验

## 背景

E1 已完整完成 Vite client/server build 与 Nitro prerender，但在 final Nitro server build 中 exit 134。Nitro v2 源码显示该阶段进入最终 Rollup build/write；modern externals plugin 在 `buildEnd()` 中调用 `@vercel/nft.nodeFileTrace()` 并处理 trace reasons/package versions/依赖复制。

因此 E2 不再继续调整 prerender，而用两个**互相独立、都从 E1 固定 SHA 派生**的实验定位 externals 阶段的内存贡献。

## E2-A：`externals.trace=false` 因果诊断

### 唯一变量

在 E1 的 `nuxt.config.ts` 基础上，将当前仅 Windows 生效的 `nitro.externals.trace=false` 临时扩展到 Linux，即实验分支中无条件：

```ts
nitro: {
  externals: {
    trace: false,
  },
}
```

其他 E1 设置全部不动；不提高 heap。

### 研究问题

如果跳过 externals tracing/trace-result processing 后，默认 4144 MiB heap 可以完成 final Nitro server build，则该阶段是 E1 剩余峰值的重要贡献者。

### 重要限制

E2-A **不是最终修复候选**。`trace=false` 可能让 node-server 输出依赖宿主环境提供依赖，而不是完整追踪/复制生产依赖。即使 CI 绿色，也只能用于根因归因。

### 执行信息

- Branch：`2026-8-18-nuxt-e2-trace-off-diagnostic`
- Commit：`0db93685297d5f4d01af7625150489224c7fcc86`
- Draft PR：#15
- Run：`32106327534`
- Job：`95616407587`
- 当前状态：生产构建执行中，待封存日志后补齐指标。

## E2-B：`experimental.legacyExternals=true` 结构候选

### 唯一变量

从 E1 固定 SHA 独立派生：

```ts
nitro: {
  experimental: {
    legacyExternals: true,
  },
  ...(process.platform === "win32"
    ? { externals: { trace: false } }
    : {}),
}
```

Linux 仍启用 tracing/依赖复制，只切换 Nitro externals 实现。

### 源码纠偏：legacy 也使用 NFT

设计初稿曾把 E2-B 描述成“绕过 modern NFT path”。重新阅读 Nitro v2 `externals-legacy.ts` 后确认：**legacy implementation 同样直接调用 `@vercel/nft.nodeFileTrace()`。**

因此 E2-B 真正比较的是：

- external resolution/normalization 实现；
- 对 `nodeFileTrace()` 输出的展开方式；
- package/version dedupe；
- dependency copy 与 package metadata 生成；

是否能在保持 tracing 语义时降低 final Rollup 的峰值，而不是比较“有 NFT / 无 NFT”。

### 额外验收

E2-B 若 CI 绿色，还必须验证：

- final Nitro server bundle 完成；
- `.output/server` 存在并包含合理 package metadata；
- 构建产物可启动；
- 关键 docs 页面/API/search 不出现 module resolution/runtime failure；
- Vercel 部署成功；
- 同 SHA rerun + cold-runner 验证。

### 执行信息

- Branch：`2026-8-18-nuxt-e2-legacy-externals`
- Commit：`4df102608c966cd2d79d41c5adf955107a05ea38`
- Draft PR：#16
- Run：`32106392146`
- Job：`95616598844`
- 当前状态：生产构建执行中，待封存日志后补齐指标。

## 结果记录

| 字段 | E2-A | E2-B |
| --- | --- | --- |
| Branch | `2026-8-18-nuxt-e2-trace-off-diagnostic` | `2026-8-18-nuxt-e2-legacy-externals` |
| Commit SHA | `0db93685297d5f4d01af7625150489224c7fcc86` | `4df102608c966cd2d79d41c5adf955107a05ea38` |
| PR | #15 Draft | #16 Draft |
| Run / Job | `32106327534` / `95616407587` | `32106392146` / `95616598844` |
| V8 heap | 默认；待日志确认 | 默认；待日志确认 |
| client modules | 待完成 | 待完成 |
| server modules | 待完成 | 待完成 |
| prerender | 待完成 | 待完成 |
| final Nitro | 待完成 | 待完成 |
| max RSS | 待完成 | 待完成 |
| exit | 待完成 | 待完成 |
| output sanity | 不作为最终验收 | CI 绿色后执行 |

## 分支纪律

- 两个实验都从 E1 SHA `964911ee5c4691cc88a0ddb7672c400f3fb7ef7e` 派生，不能从彼此派生。
- 临时 PR 使用 Draft，目标 `dev`。
- 实验 PR 不合并。
- 只有经过完整验收的最小变更才回写主工作分支 / PR #11。