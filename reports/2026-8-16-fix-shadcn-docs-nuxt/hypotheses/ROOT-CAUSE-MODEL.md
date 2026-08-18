# 根因模型与待验证假设

## 当前模型

现有证据支持“**历史 production graph 被人为放大 + 框架 final server build 本身仍需要略高于默认 V8 old-space 的峰值工作集**”，而不是单一 Markdown 内容量问题，也没有足够证据证明经典 memory leak。

```text
历史配置：
shadcn-docs-nuxt / Nuxt Content 基础生产成本
  + production 直接消费 workspace 源码
  + blanket Vite SSR noExternal
  + blanket Nitro externals.inline
  = 被显著放大的 Vite SSR / Nitro dependency graph

E1 移除主要图放大器后：
  server transform 约 4028 -> 2449（约 -39%）
  prerender 在默认约 4.1 GiB heap 下完整完成
  final Nitro server build 才触发 heap OOM
  maximum RSS 约 4.55 GiB

E2–E4 又分别排除：
  externals trace=false 单独不足
  legacy externals 单独不足
  server sourcemap=false 单独不足
  final Rollup treeshake=false 单独不足

当前下一问题：
  E1 健康图基础上，最小稳定 old-space 是 4608 / 5120 / 6144 中的哪一档？
```

## H1：生产依赖图放大是实质性根因之一

**状态：强支持，已证实为重要贡献者。**

E1 删除 source alias 与 blanket bundling 配置后，server transformed modules 下降约 39%，并把死亡点推迟到完整 prerender 之后。这些配置不是无关噪声，而是实际扩大 production working set。

但 E1 仍 exit 134，因此 H1 不是完整解释。

## H2：prerender route 并发是主要根因

**状态：基本否定。**

- Nitro v2 默认 prerender concurrency 本身为 1；
- E1 两条 Content prerender route 已完整完成；
- OOM 位于随后 final Nitro server build。

因此不应把 `prerender.concurrency=1` 写成修复。

## H3：Nuxt Content 内容数量直接导致 OOM

**状态：证据不足，低优先级。**

Content/search、Shiki 等构成基础负载，但现有证据没有证明“文档文件太多”直接解释 4 GiB 峰值。当前也没有必要通过关闭全文搜索等用户功能换取 CI 绿色。

## H4：modern externals tracing 是唯一剩余根因

**状态：否定“唯一根因”版本。**

E2-A 从 E1 独立派生，仅将 Linux `nitro.externals.trace=false`，默认 heap 的主体 production build 仍失败。因此 tracing 可能仍贡献内存，但单独关闭它不足以根治。

此外，全局 `trace=false` 可能改变 node-server 输出的依赖追踪/复制语义，本来也不适合作为未经产物验收的长期修复。

## H5：legacy externals 能单独降低峰值到默认 heap 以下

**状态：否定。**

E2-B 从 E1 独立派生，仅启用 `nitro.experimental.legacyExternals=true`，主体 production build 仍失败。

源码复核还确认 legacy implementation 同样使用 dependency tracing，因此不能再描述为“绕过 NFT”。

## H6：server sourcemap 是主要剩余峰值来源

**状态：否定“单独足以根治”版本。**

E3 仅设置：

```ts
sourcemap: {
  server: false,
}
```

主体 production build 仍失败。因此 server sourcemap 不是唯一剩余原因。

## H7：final Rollup tree-shaking 是主要剩余峰值来源

**状态：否定“单独足以根治”版本。**

E4 使用 Nitro `2.13.4` 的实际 Rollup override 能力，仅设置：

```ts
nitro: {
  rollupConfig: {
    treeshake: false,
  },
}
```

主体 production build 仍失败。因此关闭 tree-shaking 不能单独把峰值压到默认 heap 以下，且该开关不应回写长期配置。

## H8：E1 结构缩减后，默认 4.1 GiB 只是略低于真实稳定需求

**状态：当前领先假设，正在定量。**

直接证据：

- E1 V8 heap limit：约 4144 MiB；
- final Nitro server build 触发 `Reached heap limit` / exit 134；
- maximum RSS：`4,768,884 kB`，约 4.55 GiB；
- runner 物理内存仍充足，无 swap 压力；
- E2–E4 四条独立结构开关均未把默认 heap 恢复为绿色。

因此当前不再随机枚举低信号 Nitro/Rollup 开关，而是独立测量：

- 4608 MiB：PR #19；
- 5120 MiB：PR #20；
- 若 5120 仍失败，再测 6144 MiB。

若较小阈值稳定通过，最终方案也不能退化成 CI-only 环境变量，而应复用 E0 已验证的跨平台 Nuxt memory wrapper，并将 8192 降到有证据支持的最小稳定值。

## 可复现性风险：依赖解析没有锁定

当前仓库没有提交 `pnpm-lock.yaml`，CI 又执行：

```sh
pnpm install --no-frozen-lockfile
```

同时 Nuxt 等依赖存在 semver range。因此“同 Git SHA”不必然等于“同一依赖解析快照”。

这不是 E5 阈值实验的变量，暂不混入；但在最终重复性结论中必须明确处理或记录，否则不能把一次同 SHA rerun 解释为完全相同的软件输入。

## 误判记录

### `components: [{ path: "../ai-vue/src" }]` 残留

早期上下文合并时曾把旧配置误记为 E1 SHA 的残留源码扫描项。重新读取 E1 固定 SHA 后确认不存在，因此没有为一个不存在的变量创建实验。

### `legacyExternals` 会绕过 NFT

E2 设计初稿曾如此描述。源码复核后确认 legacy externals 仍包含 dependency tracing，这一表述已纠正。

### `nitro.minify=false` 应作为下一实验

核对 Nitro `2.13.4` 与 shadcn-docs-nuxt `1.1.9` 后，没有得到“当前 production server bundle 已默认开启该 minify 且设置 false 会形成可靠单变量”的充分证据，因此没有创建这个可能为空操作的实验。
