# E2：最终 Nitro Rollup / externals 单变量实验

## 背景

E1 已完整完成 Vite client/server build 与 Nitro prerender，但在 final Nitro server build 中 exit 134。E1 的 server modules 已从约 `4028` 降至 `2449`，说明前序依赖图收缩有效，但默认 Node/V8 heap 下仍存在 final server Rollup/write 峰值。

因此 E2 用两个**互相独立、都从 E1 固定 SHA 派生**的实验，定位 externals 实现/trace 路径是否是剩余峰值的主因。

固定基线：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。

## E2-A：`externals.trace=false` 因果诊断

### 唯一变量

在 E1 的 `nuxt.config.ts` 基础上，将当前仅 Windows 生效的 `nitro.externals.trace=false` 临时扩展到 Linux：

```ts
nitro: {
  externals: {
    trace: false,
  },
}
```

其他 E1 设置全部不动；不提高 heap。

### 研究问题

如果跳过 externals tracing/trace-result processing 后，默认 heap 可以完成生产构建，则 tracing 阶段是 E1 剩余峰值的重要贡献者。

### 重要限制

E2-A **不是最终修复候选**。`trace=false` 可能改变 node-server 输出的依赖追踪/复制语义；即使绿色，也只能先用于根因归因，再做产物与部署验收。

### 执行结果

- Branch：`2026-8-18-nuxt-e2-trace-off-diagnostic`
- Commit：`0db93685297d5f4d01af7625150489224c7fcc86`
- Draft PR：#15
- Run：`32106327534`
- Job：`95616407587`
- 结果：**失败**。
- GitHub Actions step 证据：checkout、pnpm、Node setup、依赖安装均成功；`Run documentation build` 为唯一失败的主体步骤。
- 当前 GitHub connector 未返回可可靠解析的完整 job log，因此本轮不臆造具体 OOM 行号、峰值 RSS 或该次构建的模块数。

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

Linux 仍保持 E1 的生产构建语义，只切换 Nitro externals 实现。

### 源码纠偏：legacy 也使用 NFT

设计初稿曾把 E2-B 描述成“绕过 modern NFT path”。重新阅读 Nitro v2 `externals-legacy.ts` 后确认：legacy implementation 同样调用 `@vercel/nft.nodeFileTrace()`。

因此 E2-B 真正比较的是 external resolution/normalization、trace 输出展开、package/version dedupe、dependency copy 与 package metadata 生成等实现差异，而不是简单比较“有 NFT / 无 NFT”。

### 执行结果

- Branch：`2026-8-18-nuxt-e2-legacy-externals`
- Commit：`4df102608c966cd2d79d41c5adf955107a05ea38`
- Draft PR：#16
- Run：`32106392146`
- Job：`95616598844`
- 结果：**失败**。
- GitHub Actions step 证据：checkout、pnpm、Node setup、依赖安装均成功；`Run documentation build` 为唯一失败的主体步骤。
- 当前 GitHub connector 未返回可可靠解析的完整 job log，因此本轮不臆造具体 OOM 行号、峰值 RSS 或该次构建的模块数。

## 结果记录

| 字段 | E2-A | E2-B |
| --- | --- | --- |
| Branch | `2026-8-18-nuxt-e2-trace-off-diagnostic` | `2026-8-18-nuxt-e2-legacy-externals` |
| Commit SHA | `0db93685297d5f4d01af7625150489224c7fcc86` | `4df102608c966cd2d79d41c5adf955107a05ea38` |
| PR | #15 Draft | #16 Draft |
| Run / Job | `32106327534` / `95616407587` | `32106392146` / `95616598844` |
| Heap policy | 默认 heap；未增加 `NODE_OPTIONS` | 默认 heap；未增加 `NODE_OPTIONS` |
| CI 主体 build step | ❌ failure | ❌ failure |
| 可靠的阶段级日志 | 未由 connector 取得 | 未由 connector 取得 |
| max RSS / heap used | 未取得可靠数据 | 未取得可靠数据 |
| `.output` sanity | 构建未通过，不执行 | 构建未通过，不执行 |

## 结论

E2-A 与 E2-B 都没有让默认 heap 下的生产构建恢复绿色。因此：

1. **单独关闭 modern externals tracing 不足以解决问题**；
2. **单独切换 legacy externals 实现也不足以解决问题**；
3. 现有证据不支持把 externals tracing/modern-vs-legacy implementation 作为唯一剩余根因；
4. 由于完整 job log 未被 connector 稳定返回，不能把两次失败进一步宣称为“已证实死在完全相同的具体 OOM 行”。

下一轮应继续围绕 E1 已定位的 final server Rollup/write 峰值做**新的单变量实验**，而不是叠加 E2-A/B。E3 选择关闭 Nuxt server sourcemap，验证 sourcemap 生成是否是最终写出阶段的重要内存放大器。

## 分支纪律

- 两个实验都从 E1 SHA `964911ee5c4691cc88a0ddb7672c400f3fb7ef7e` 派生，不能从彼此派生。
- 临时 PR 使用 Draft，目标 `dev`。
- 实验 PR 不合并。
- 只有经过完整验收的最小变更才回写主工作分支 / PR #11。
