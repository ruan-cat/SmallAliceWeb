# 已确认的证据

> 只记录已经由仓库、源码或 CI 日志直接支持的事实；推断放在 `hypotheses/ROOT-CAUSE-MODEL.md`。

## E0：8 GiB 控制组

- 主 PR：#11。
- 功能基线 SHA：`9864aaea67394e2db1e917b1ee0ea86c6ddfd0e1`。
- 主 PR 初次成功：run `32074711921` / job `95525290142`。
- 同功能 SHA rerun：job `95537958369`，成功。
- 独立临时 PR #12：run `32079043977` / job `95538188859`，成功。
- 独立临时 PR #13：run `32079230457` / job `95538748834`，成功。
- Vercel 同功能 SHA 成功。
- 控制措施包含 8 GiB old-space、Turbo `--concurrency=1`、Node 22 对齐及资源诊断。

这组证据只证明“额外 heap headroom 能稳定控制症状”，不能证明根因消失。

## 历史默认 heap 失败

- 历史重点失败：run `31272689831` / job `93141201150`。
- 近期 `dev` 失败：run `31930697012` / job `95124914691`。
- 失败类型：V8 heap OOM / exit 134，而非 exit 137。
- 近期失败约：client 5414 modules、server 4028 modules；失败发生于 late Nuxt/Nitro build 生命周期。

## E1：默认 heap + 最小 bundling graph

- Draft PR：#14。
- 分支：`2026-8-18-nuxt-default-heap-bundle-min`。
- 固定 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。
- Actions run：`32081792392`。
- job：`95546058440`。
- Node：`v22.23.2`。
- V8 heap limit：`4144 MiB`。
- runner 启动时约 15 GiB RAM、约 14 GiB available；无证据表明是物理内存先耗尽。
- ai-vue 在 docs 前完成构建：`dist/index.js` 约 8.84 kB，CSS 约 118.97 kB。
- Nuxt 3.21.11 / Nitro 2.13.4 / Vite 7.3.6 / Vue 3.5.41。
- client：`5409 modules transformed`。
- server：`2449 modules transformed`，相对历史约 4028 减少约 39%。
- server Vite build 成功。
- Nitro prerender 成功：2 routes。
- 具体 Content 路由：`/api/_content/search-1787010473483`、`/api/_content/cache.1787010473483.json`。
- prerender 耗时：`44.534 seconds`。
- `.output/public` 已生成。
- 随后打印 `[nitro] Building Nuxt Nitro server (preset: node-server, compatibility date: 2025-05-13)`。
- 之后 V8 在约 4.04 GiB heap 附近 Mark-Compact/Scavenge 并触发 `Reached heap limit`。
- exit：134。
- `/usr/bin/time -v` max RSS：`4,768,884 kB`（约 4.55 GiB）。
- swap 未使用。

## E1 精确改动边界

PR #14 实际移除了：

- CI `NODE_OPTIONS=--max-old-space-size=8192`；
- package-level 8 GiB wrapper；
- ai-vue -> `../ai-vue/src` 的 production source aliases；
- blanket `vite.ssr.noExternal`；
- blanket `nitro.externals.inline`。

保留：

- 根 Turbo `--concurrency=1`；
- Node 22；
- shadcn-docs-nuxt 内部兼容 aliases；
- Windows-only Nitro `trace:false`。

## 已纠正的误判：E1 不存在 components source scan

曾有一个中间摘要声称 E1 仍包含：

```ts
components: [{ path: "../ai-vue/src" }]
```

重新直接读取 E1 SHA `964911...` 的 `packages/ai-vue-doc/nuxt.config.ts` 后确认：**该项不存在**。

因此不能再把“移除 components source scan”作为 E2 单变量。该错误假设必须与真实 E1 配置区分。

## Nitro v2 最终 build 源码证据

Nitro v2 `src/core/build/prod.ts` 的生产构建顺序为：

1. 打印 `Building Nitro Server`；
2. `getRollupConfig(nitro)`；
3. `rollup.rollup(rollupConfig)`；
4. `build.write(rollupConfig.output)`；
5. `build.close()`。

结合 E1 日志，剩余 OOM 已被定位在最终 Nitro Rollup build/write 路径，而不是 prerender route queue。

Nitro v2 Rollup config 的现代 externals 路径包含基于 `@vercel/nft` 的 tracing plugin；`trace:false` 会显著绕过该 tracing/copy 路径。Legacy externals 是另一套依赖分类/复制实现。

## 当前能够下的最强结论

- blanket bundling + source alias 是真实的内存放大器；E1 的 server module 数下降约 39% 是直接证据。
- prerender 本身不是 E1 的最终死亡点；E1 已完整 prerender。
- 剩余默认-heap OOM 位于最终 Nitro server Rollup 阶段。
- 现代 externals/NFT tracing 是下一阶段需要用单变量实验验证的领先假设，但在 E2 结果出来前不能写成已证实根因。