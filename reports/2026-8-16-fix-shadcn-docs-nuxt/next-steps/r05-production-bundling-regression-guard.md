# R05 production bundling graph 可能被历史配置重新放大

- **优先级**：P0
- **状态**：OPEN
- **类型**：构建配置 / 回归防护
- **权威策略**：[`../dependency-externalization-policy.md`](../dependency-externalization-policy.md)

## 风险说明

E1 已证明历史 production source alias、blanket `vite.ssr.noExternal` 和 blanket `nitro.externals.inline` 会显著放大 server graph。

收敛后 server transformed modules 从历史约 4028 降到 2449，约 -39%。E6-B 又证明仅 inline `element-plus` 就能让 5120 MiB production build 重新 OOM。

风险不是“出现 noExternal/inline 字段”，而是它们退化成持续增长、在 Vite/Nitro 间复制的传递依赖清单。

## 高风险模式

- `ssr.noExternal` 使用大量包名或宽正则；
- `nitro.externals.inline` 使用大量包名或宽正则；
- Vite/Nitro 镜像同一 package-family 列表；
- production alias 指向 workspace `src`；
- runtime MODULE_NOT_FOUND 就 inline 整个上游 UI 库；
- 一次加入一串 transitive dependency 作为“保险”。

## 已知反例

- E1：移除 historical source alias/blanket bundling，server graph 约 -39%；
- E6-B：只 inline Element Plus，5120 build OOM；
- E6-A：只在部署 package 显式声明 Popper logical alias dependency，build + runtime success；
- E7-A：global hoisted linker 同样使 5120 OOM。

## narrow `ssr.noExternal` 准入

必须同时满足：

1. exact error 位于 Vite SSR transform/load；
2. 已证明 external Node path 失败且需要 Vite transform；
3. 单变量只加一个精确 package/path；
4. 不自动追加 transitive dependency；
5. modules/RSS/build time 有对照；
6. full build + `.output` HTTP + Vercel 通过；
7. 有删除条件。

## narrow `nitro.externals.inline` 准入

必须同时满足：

1. exact error 位于 Nitro/server externalized path；
2. 已证明代码必须由 Nitro/Rollup bundle；
3. 单变量只 inline 最小 package/path；
4. 5120 MiB build 仍通过；
5. modules/RSS/output size 有对照；
6. standalone HTTP + Vercel 通过；
7. 有上游 issue/删除条件。

**Vite 中存在 matcher 不能作为 Nitro 复制同一 matcher 的理由。**

## 建议加固

1. 对 `packages/ai-vue-doc/nuxt.config.ts` 增加轻量静态 guard，发现 wide matcher/production source alias 时失败或强警告；
2. narrow exception 必须在代码或报告中记录 exact error、实验、删除条件；
3. 结合 R04 的 modules/RSS 基线做动态 guard；
4. runtime MODULE_NOT_FOUND 优先查 package identity、direct dependency、alias、artifact closure。

## 验收标准

- [ ] CI 能发现明显 blanket/wide noExternal/inline；
- [ ] 能发现 Vite/Nitro 高度镜像的大列表；
- [ ] production source alias 到 workspace src 会被检测；
- [ ] narrow exception 有单变量证据；
- [ ] 相关配置变更均通过 5120 build + HTTP runtime。

## 不要做什么

- 不要完全禁止官方支持的 noExternal/inline；
- 不要把宽正则拆成几十个包名来规避 guard；
- 不要用 bundling 隐藏 manifest/runtime contract；
- 不要仅以 build success 证明方案健康。
