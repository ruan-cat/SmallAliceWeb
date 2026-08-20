# E1：默认 heap + 最小生产 bundling graph

## 实验对象

- Draft PR：#14
- 分支：`2026-8-18-nuxt-default-heap-bundle-min`
- head SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`
- Actions run：`32081792392`
- job：`95546058440`

## 单组结构变更

E1 从 8 GiB 控制结构切回默认 heap，同时缩小生产 dependency graph：

- 删除 package-level memory wrapper；
- 恢复 `nuxt prepare` / `nuxt build`；
- CI 删除 `NODE_OPTIONS=--max-old-space-size=8192`；
- ai-vue 不再 alias 到 `../ai-vue/src`，改走 workspace package exports/dist；
- 删除 blanket `vite.ssr.noExternal`；
- 删除 blanket `nitro.externals.inline`；
- 保留 Node 22、Turbo `--concurrency=1`、内部兼容 aliases 与 Windows-only `trace:false`。

## 环境

- Node `v22.23.2`
- V8 heap limit `4144 MiB`
- Nuxt `3.21.11`
- Nitro `2.13.4`
- Vite `7.3.6`
- Vue `3.5.41`
- runner 约 15 GiB RAM，启动时约 14 GiB available
- 无 swap 使用

## 构建结果

### Workspace dependency

ai-vue 先完成构建：

- `dist/index.js` 约 8.84 kB
- CSS 约 118.97 kB

说明文档站可以消费已构建 workspace package，而不是必须把其 TS/Vue 源码整个拖进生产图。

### Vite client/server

- client：`5409 modules transformed`
- server：`2449 modules transformed`
- 历史默认 heap 失败 server 约 `4028 modules`
- server graph 减少约 39%
- client graph 基本不变

这表明主要收益集中在生产 SSR/server graph，符合 externalization/source-alias 假设。

### Nitro prerender

E1 已完整通过 prerender：

- `/api/_content/search-1787010473483`
- `/api/_content/cache.1787010473483.json`
- 2 routes
- `Prerendered 2 routes in 44.534 seconds`
- `.output/public` 已生成

### 最终 Nitro server build

随后进入：

```text
[nitro] Building Nuxt Nitro server (preset: node-server, compatibility date: 2025-05-13)
```

之后在约 4.04 GiB heap 附近持续 Scavenge/Mark-Compact，最终：

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

- exit：134
- max RSS：`4,768,884 kB`（约 4.55 GiB）

## 结论

E1 **失败，但具有强因果价值**：

1. production source alias + blanket bundling 确实是图放大器；
2. 缩图后 server modules 下降约 39%，且默认 heap 下 prerender 从失败边缘变为完整成功；
3. 根因还没有全部消除；
4. 剩余死亡点已经从模糊的“prerender 附近”收敛到 final Nitro server Rollup。

## 源码交叉定位

Nitro v2 `src/core/build/prod.ts` 在 `Building Nitro Server` 日志之后执行：

```ts
const rollupConfig = await getRollupConfig(nitro)
const build = await rollup.rollup(rollupConfig)
await build.write(rollupConfig.output)
await build.close()
```

因此后续优先检查最终 Rollup graph / externals，而不是继续调 prerender route concurrency。

## 纠偏

E1 SHA 中**没有** `components: [{ path: "../ai-vue/src" }]`。此前上下文摘要把旧配置误认为 E1 残留，已通过直接读取固定 SHA 的 `nuxt.config.ts` 纠正。E2 不再为此创建无效实验。