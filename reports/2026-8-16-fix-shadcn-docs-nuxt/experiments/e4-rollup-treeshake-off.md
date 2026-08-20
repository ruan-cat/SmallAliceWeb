# E4：关闭 Nitro final Rollup tree-shaking

## 基线

固定 E1 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。

E4 独立从 E1 派生，默认 Node/V8 heap，不叠加 E2/E3。

## 唯一变量

`packages/ai-vue-doc/nuxt.config.ts`：

```ts
nitro: {
  rollupConfig: {
    treeshake: false,
  },
  // E1 原有 Windows-only trace:false 保持不变
}
```

E1 → E4 compare：ahead 1、behind 0，仅 `packages/ai-vue-doc/nuxt.config.ts`，`+3/-0`。

## 源码依据

E1 实际解析 Nitro `2.13.4`。该版本 `src/build/rollup/config.ts` 创建 final Rollup config 后，再通过：

```ts
config = defu(nitro.options.rollupConfig as any, config)
```

应用用户 Rollup override。Rollup 未显式关闭 tree-shaking 时默认启用 tree-shaking，因此 `rollupConfig.treeshake=false` 是直接改变 final Nitro Rollup 图优化行为的单变量。

## 执行信息

- Branch：`2026-8-18-nuxt-e4-rollup-treeshake-off`
- Commit：`dd77d806b1703b9cab593ca9d5a52073a5335270`
- Draft PR：#18
- Run：`32109674540`
- Job：`95626193537`
- Heap：默认 heap；未增加 `NODE_OPTIONS`

## 结果

**失败。**

GitHub Actions step 证据：checkout、pnpm/Node、依赖安装、构建前内存记录全部成功；唯一失败主体为 `生产构建`。

当前 connector 对 completed job 仍没有返回可可靠解析的完整 `/usr/bin/time -v` 日志，因此不臆造 E4 的具体 OOM 行、max RSS 或模块数。

## 结论

关闭 final Rollup tree-shaking 单独不足以让默认 heap 构建恢复绿色。

结合 E2-A、E2-B、E3，当前已独立排除四条简单结构开关能够单独根治：

- Linux `externals.trace=false`；
- `experimental.legacyExternals=true`；
- `sourcemap.server=false`；
- `rollupConfig.treeshake=false`。

因此后续不继续随机枚举 Nitro/Rollup 开关，转入基于 E1 实测峰值的最小 heap headroom 定量实验，从 4608 MiB 开始。

## 分支纪律

- PR #18 保持 Draft。
- 不合并 E4。
- 不把 `treeshake=false` 回写主工作分支。
