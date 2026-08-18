# E2：最终 Nitro Rollup / externals 单变量实验

## 背景

E1 已完整完成 Vite client/server build 与 Nitro prerender，但在 final Nitro server build 中 exit 134。Nitro v2 源码显示该阶段进入最终 Rollup build/write，并通过 modern externals plugin 使用 NFT tracing。

因此 E2 不再继续调整 prerender，而用两个**互相独立、都从 E1 固定 SHA 派生**的实验定位 externals 路径。

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

如果跳过现代 externals/NFT tracing 后，默认 4144 MiB heap 可以完成 final Nitro server build，则现代 tracing 路径是 E1 剩余峰值的重要贡献者。

### 重要限制

E2-A **不是最终修复候选**。`trace=false` 可能让 node-server 输出依赖宿主环境提供依赖，而不是完整追踪/复制生产依赖。即使 CI 绿色，也只能用于根因归因。

## E2-B：`experimental.legacyExternals=true` 结构候选

### 唯一变量

从 E1 固定 SHA 独立派生：

```ts
nitro: {
  experimental: {
    legacyExternals: true,
  },
  externals: {
    ...(process.platform === "win32" ? { trace: false } : {}),
  },
}
```

即 Linux 仍保持正常外部依赖打包语义，只切换 Nitro externals 实现。

### 研究问题

Legacy externals 是否能避免 modern NFT path 的高峰值，同时仍生成可部署的 `.output`？

### 额外验收

E2-B 若 CI 绿色，还必须验证：

- final Nitro server bundle 完成；
- `.output/server` 存在并包含合理 package metadata；
- 构建产物可启动；
- 关键 docs 页面/API/search 不出现 module resolution/runtime failure；
- Vercel 部署成功；
- 同 SHA rerun + cold-runner 验证。

## 结果记录模板

| 字段 | E2-A | E2-B |
| --- | --- | --- |
| Branch | `2026-8-18-nuxt-e2-trace-off-diagnostic` | `2026-8-18-nuxt-e2-legacy-externals` |
| Commit SHA | 待执行 | 待执行 |
| PR | 待执行 | 待执行 |
| Run / Job | 待执行 | 待执行 |
| V8 heap | 默认 | 默认 |
| client modules | 待执行 | 待执行 |
| server modules | 待执行 | 待执行 |
| prerender | 待执行 | 待执行 |
| final Nitro | 待执行 | 待执行 |
| max RSS | 待执行 | 待执行 |
| exit | 待执行 | 待执行 |
| output sanity | 不作为最终验收 | 待执行 |

## 分支纪律

- 两个实验都从 E1 SHA `964911ee5c4691cc88a0ddb7672c400f3fb7ef7e` 派生，不能从彼此派生。
- 临时 PR 使用 Draft，目标 `dev`。
- 实验 PR 不合并。
- 只有经过完整验收的最小变更才回写主工作分支 / PR #11。