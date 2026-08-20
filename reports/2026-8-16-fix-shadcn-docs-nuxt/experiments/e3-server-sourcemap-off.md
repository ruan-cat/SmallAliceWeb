# E3：关闭 server sourcemap 诊断 final Nitro 写出峰值

## 基线

固定 E1 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。

E3 独立从 E1 派生，不叠加 E2-A / E2-B，也不提高 Node/V8 heap。

## 唯一变量

`packages/ai-vue-doc/nuxt.config.ts`：

```ts
sourcemap: {
  server: false,
},
```

E1 → E3 compare 已验证：ahead 1、behind 0、仅该文件 `+4/-0`。

## 执行信息

- Branch：`2026-8-18-nuxt-e3-server-sourcemap-off`
- Commit：`7bd1594063134655ae101b651c90a4786cb72f0e`
- Draft PR：#17
- Run：`32108987079`
- Job：`95624184590`
- Heap：默认 heap；未增加 `NODE_OPTIONS`

## 结果

**失败。**

GitHub Actions step 级证据：

1. Set up job：success
2. 检出仓库代码：success
3. 安装 pnpm：success
4. 配置 Node.js：success
5. 启用 Corepack：success
6. 安装依赖：success
7. 记录构建前内存：success
8. 生产构建：failure

workflow 的 build 命令仍使用：

```sh
cd packages/ai-vue-doc
/usr/bin/time -v pnpm run build
```

当前 GitHub connector 没有返回可可靠解析的完整 completed job log，因此本记录**不臆造** E3 的具体 OOM 行号、max RSS、heap used 或模块数。

## 上游源码补充

Nitro v2 的 Rollup 配置把 `output.sourcemap` 绑定到 `nitro.options.sourceMap`；生产环境开启 source map 时还会加入 sourcemap minification plugin。因此 E3 不是一个纯 UI 配置，它确实切断了 final server Rollup 的 sourcemap 输出/相关 minification 路径。

但 E3 仍失败，所以现有证据说明：**server sourcemap 路径不是默认 heap OOM 的唯一剩余原因，单独关闭它不足以根治。**

## 后续

E4 继续从固定 E1 SHA 独立派生，不从 E3 叠加。候选变量改为关闭 Nitro final Rollup 的 tree-shaking，以直接测试 Rollup 图优化阶段是否是剩余 heap 峰值的重要贡献者。

## 分支纪律

- PR #17 保持 Draft。
- 不合并 E3。
- 不把 `sourcemap.server=false` 回写主工作分支，除非后续出现新的独立证据支持它。
