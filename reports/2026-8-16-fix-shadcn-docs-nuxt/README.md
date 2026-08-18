# 2026-08-18 Nuxt 文档构建 OOM：结构性修复调查

## 目标

修复 `@ruan-cat-drill-doc/ai-vue-doc` 在 GitHub Actions、Vercel 与本地环境中的 Node/V8 heap OOM，同时避免把长期方案简化成不断提高 `--max-old-space-size`。

当前要求是：**先缩小生产依赖图并定位 final Nitro server build 的真实峰值来源，再决定是否仍需要最小、可解释的 heap headroom。**

## 文档索引

- [`TEST-PLAN.md`](./TEST-PLAN.md)：实验矩阵、控制变量、指标、停止条件和最终验收门槛。
- [`evidence/KNOWN-EVIDENCE.md`](./evidence/KNOWN-EVIDENCE.md)：只记录 CI/仓库/上游源码直接支持的事实。
- [`hypotheses/ROOT-CAUSE-MODEL.md`](./hypotheses/ROOT-CAUSE-MODEL.md)：当前根因模型、待验证假设和误判纠偏。
- [`experiments/E0-8G-control.md`](./experiments/E0-8G-control.md)：8 GiB 稳定控制组。
- [`experiments/E1-default-heap-minimal-bundle.md`](./experiments/E1-default-heap-minimal-bundle.md)：默认 heap 下缩小 production bundling graph 的结果。
- [`experiments/E2-final-nitro-rollup-externals.md`](./experiments/E2-final-nitro-rollup-externals.md)：final Nitro Rollup / externals 单变量实验。
- [`final/FINAL-FIX.md`](./final/FINAL-FIX.md)：最终修复与重复性验收；当前明确标记为“未完成”。

## 当前阶段结论

### E0：8 GiB 是稳定控制组，不是根修复

已确认：

- 主 PR #11 首次 CI 成功；
- 同功能 SHA rerun 成功；
- 独立临时 PR #12、#13 成功；
- Vercel 同功能 SHA 成功。

功能基线 SHA：`9864aaea67394e2db1e917b1ee0ea86c6ddfd0e1`。

这证明提高 V8 old-space 可以稳定控制症状，但不能证明 production graph 健康，也不能证明 8 GiB 是真实最低需求。

### E1：生产依赖图放大器被证实，但还不是全部根因

E1 Draft PR #14：

- 分支：`2026-8-18-nuxt-default-heap-bundle-min`
- head：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`
- run：`32081792392`
- job：`95546058440`

E1 在默认 V8 heap `4144 MiB` 下：

- 移除 ai-vue production source alias；
- 移除 blanket `vite.ssr.noExternal`；
- 移除 blanket `nitro.externals.inline`；
- 恢复标准 `nuxt prepare` / `nuxt build`；
- 移除 8 GiB wrapper/CI heap override；
- 保留 Node 22、Turbo `--concurrency=1`、内部兼容 aliases 和 Windows-only `trace:false`。

结果：

- client：5409 modules；
- server：2449 modules；历史默认-heap 失败约 4028 modules，下降约 **39%**；
- Nitro prerender 两条 Content route **完整成功**，44.534s；
- `.output/public` 已生成；
- 随后进入 `[nitro] Building Nuxt Nitro server ...`；
- 最终在约 4.1 GiB heap ceiling 触发 `Reached heap limit`，exit 134；
- maximum RSS `4,768,884 kB`（约 4.55 GiB）。

因此不能再把“prerender 本身”写成 E1 的死亡点。更精确的定位是：**final Nitro server Rollup build/write path**。

## 上游源码定位

Nitro v2 `src/core/build/prod.ts` 在打印 `Building Nitro Server` 后依次执行：

```ts
const rollupConfig = await getRollupConfig(nitro)
const build = await rollup.rollup(rollupConfig)
await build.write(rollupConfig.output)
await build.close()
```

Nitro v2 的 modern externals 路径还会使用基于 `@vercel/nft` 的 tracing/依赖遍历。因此当前领先假设已经从“prerender concurrency”转为：**final Rollup + externals/NFT tracing 是否构成 E1 剩余峰值的重要部分。**

## 已纠正的误判

早期上下文摘要曾声称 E1 仍存在：

```ts
components: [{ path: "../ai-vue/src" }]
```

重新直接读取 E1 固定 SHA 的 `packages/ai-vue-doc/nuxt.config.ts` 后确认：**不存在该项。**

因此不会创建一个“删除 components source scan”的无效 E2。该错误已写入证据与根因模型文档，避免后续复盘继续传播。

## 下一阶段：E2

### E2-A：trace-off diagnostic

从 E1 固定 SHA 派生，只把 `nitro.externals.trace=false` 临时扩展到 Linux，在默认 heap 下运行。

用途：判断 modern NFT tracing 是否是 final Nitro Rollup 峰值的重要贡献者。

**即使绿色也不作为最终修复**，因为关闭 tracing 可能改变 node-server 输出的可移植性/依赖复制语义。

### E2-B：legacyExternals structural candidate

同样从 E1 固定 SHA独立派生，只开启：

```ts
nitro: {
  experimental: {
    legacyExternals: true,
  },
}
```

Linux 保持正常外部依赖打包语义。若默认 heap 绿色，再验证 `.output`、runtime、重复 CI 和 Vercel，才有资格成为最终候选。

## 禁止的“假修复”

当前证据不支持直接采用：

- 把 heap 从 8 GiB 继续加到 12/16 GiB；
- `nitro.prerender.concurrency=1`；
- Linux/Vercel 永久全局 `trace=false`；
- 为了 CI 绿色直接关闭 docs search / Nuxt Content 功能；
- 强行跨大版本覆盖到 Nitro 3；
- 把单次偶发绿色写成“彻底修复”。

## 最终验收

最终候选必须：

1. 完成 full Nitro server build；
2. `.output` 可运行/可部署；
3. docs 页面、组件与 search 无已知回归；
4. 同 SHA rerun 成功；
5. 两个独立 cold-runner PR 成功；
6. Vercel 成功；
7. 最小必要配置回写主工作分支；
8. 最终经验写入 `.agents/skills/fix-bug/record-bug-fix-memory/`。

## PR / 分支纪律

- 主 PR：#11 `fix(ci): 稳定 Nuxt 文档构建内存`
- 主工作分支：`2026-8-16-fix-shadcn-docs-nuxt`
- 主 PR 保持 Draft；**不合并**。
- 实验 PR 使用独立分支、Draft、目标 `dev`；实验结束不合并。
- 最终只把有证据支持的最小变更回写主工作分支。

## 工具状态

当前 GitHub 连接器可正常执行仓库读写、PR 和 Actions 操作。Skill Router MCP 在本会话不可用，因此 commit/PR message 按项目既有习惯与 Conventional Commits 编写，不伪造 Skill Router 调用。