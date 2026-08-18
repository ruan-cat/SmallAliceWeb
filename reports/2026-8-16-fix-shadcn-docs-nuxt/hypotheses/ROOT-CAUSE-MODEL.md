# 根因模型与待验证假设

## 当前模型

当前证据支持一个“多阶段高工作集 + 图放大”的模型，而不是单一 Markdown 内容量问题，也没有足够证据证明经典 memory leak：

```text
shadcn-docs-nuxt / Nuxt Content 的基础生产构建成本
  + production 直接消费 workspace 源码（历史配置）
  + blanket Vite SSR noExternal（历史配置）
  + blanket Nitro externals.inline（历史配置）
  = 被放大的 Vite SSR / Nitro dependency graph

E1 移除上述主要放大器后：
  server transform 4028 -> 2449（约 -39%）
  prerender 可在默认 4.1 GiB heap 下完整完成

但随后：
  Nitro final server Rollup
  + modern externals / NFT tracing 与依赖遍历
  + 前序生命周期仍存活的对象/缓存
  = 峰值仍略超过默认 V8 old-space ceiling
```

## H1：生产依赖图放大是实质性根因之一

**状态：已获得强支持。**

E1 在默认 heap 下显著减少 server modules，并把死亡点推迟到完整 prerender 之后。说明 source alias + blanket bundling 不是无关配置，而是实际扩大工作集。

但 E1 仍 exit 134，因此 H1 不是完整解释。

## H2：prerender route 并发是主要根因

**状态：基本否定。**

理由：

- Nitro v2 默认 prerender concurrency 本身为 1；
- E1 两条 Content prerender route 已全部完成；
- OOM 在随后 final Nitro server build 才发生。

因此不应以 `prerender.concurrency=1` 作为主修复。

## H3：Nuxt Content 内容数量直接导致 OOM

**状态：证据不足，当前优先级低。**

项目内容量并不大。Nuxt Content 的 indexed search、cache、Shiki 等确实构成基础负载，但没有证据表明“文件太多”本身解释了 4 GiB 峰值。

除非 E2/E3 反证，否则不应通过关闭全文搜索等用户功能换取绿色。

## H4：Nitro v2 modern externals / NFT tracing 是 E1 剩余峰值的重要来源

**状态：领先但未证实。**

源码依据：Nitro v2 最终 production build 进入 Rollup；现代 externals plugin 使用 NFT tracing/依赖遍历。E1 正是在 final Nitro server Rollup 阶段 OOM。

验证方法：

- E2-A：只把 `externals.trace=false` 扩展到 Linux。若默认 heap 绿色，则确认 tracing/NFT 是重要贡献者。
- E2-A 仅用于归因，不能直接成为最终修复，因为跳过 tracing 可能让 node-server 输出依赖宿主环境中的 node_modules。

## H5：legacyExternals 可以在保留可部署输出的同时降低峰值

**状态：待验证的结构候选。**

Nitro v2 仍保留 legacy externals 路径，其实现与 NFT tracing 不同。若 E2-A 证明 NFT 路径昂贵，则 E2-B 用 `experimental.legacyExternals=true` 测试是否能在默认 heap 下完成，同时保留依赖复制/输出打包。

只有 `.output` sanity、重复 CI 和 Vercel 均通过后，H5 才能升级为候选最终修复。

## H6：默认 4.1 GiB 对该框架组合本身就略显不足

**状态：不可排除，但暂不接受为结论。**

E1 最大 RSS 约 4.55 GiB，V8 heap 紧贴 4.1 GiB ceiling。这可能意味着即使图已较健康，Nuxt 3.21 + Nitro 2.13 + Content/shadcn 的真实生产峰值仍略高于默认 old-space。

只有在 E2/E3 结构性措施穷尽后，才进入 E4 测试 4608/5120/6144 等最小阈值；禁止直接回到 8192 并宣称修复。

## 误判记录

### `components: [{ path: "../ai-vue/src" }]` 残留

早期上下文合并时曾把旧配置误记为 E1 SHA 的残留源码扫描项。重新读取 E1 固定 SHA 后确认不存在。

处理原则：

- 不删除一个实际不存在的变量；
- 报告明确纠偏，防止后续复盘把无效实验误算为证据；
- 后续实验统一从 E1 固定 SHA 派生，并先检查真实 diff。