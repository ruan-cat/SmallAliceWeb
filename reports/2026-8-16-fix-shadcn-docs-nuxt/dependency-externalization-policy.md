# Nuxt SSR / Nitro 依赖 externalization 策略

> 更新：2026-08-20
>
> 状态：`packages/ai-vue-doc` externalization / bundling 的当前权威规则。

## 1. 决策摘要

从 `packages/ai-vue-doc/nuxt.config.ts` 删除大规模 `vite.ssr.noExternal` 与 `nitro.externals.inline` 依赖枚举，不是为了少写配置，也不是禁止使用这两个官方能力。

当前规则是：

> **`ssr.noExternal` / `nitro.externals.inline` 只能作为 exact-error 驱动、单变量验证、可删除的最小 transform/bundle 例外；禁止把它们当成通用依赖解析器，禁止维护 Element Plus、VueUse、Popper、lodash 等传递依赖族清单。**

最终稳定路径是：

1. 删除 production source alias 和 blanket bundling graph amplifier；
2. 在 graph 收敛后使用实测 5120 MiB build budget；
3. 对 standalone 真正缺失的逻辑包 `@popperjs/core`，在实际部署 package 显式声明 npm alias dependency；
4. 用 `.output` startup + HTTP 请求验证 runtime；
5. 调查完成后恢复原生 `nuxt prepare` / `nuxt build`，退役临时 memory wrapper。

## 2. 被删除的旧模式

历史配置在 Vite 与 Nitro 两边维护高度重合的列表，例如：

```text
@ruan-cat-drill-doc/ai-vue
element-plus / @element-plus/*
@vueuse/* / vue-demi
@floating-ui/* / @popperjs/core
async-validator
lodash-unified / lodash-es
entities
...
```

这相当于人工维护第三方 UI 库的传递依赖图，而且把两个不同生命周期混成一张“兼容白名单”。

## 3. 两个配置真正负责什么

| 配置 | 职责 | 合理场景 | 不负责 |
| --- | --- | --- | --- |
| `vite.ssr.noExternal` | 让依赖进入 Vite SSR transform/build | externalized Node 路径无法直接消费发布物，而 Vite transform 能正确处理 | 安装缺包、Nitro standalone copy、npm alias identity |
| `nitro.externals.inline` | 让代码进入 Nitro/Rollup server bundle | 精确依赖必须由 Nitro bundle 才能解析应用 alias/转换 | lockfile、manifest、所有 runtime dependency tracing |
| `package.json dependencies` | 声明真实 runtime contract | 部署 package 运行时需要逻辑包名 | 控制 Vite/Nitro transform |
| Nitro/NFT tracing | 为 external dependency 生成 standalone closure | `.output`/函数依赖复制 | 不能依赖一张 bundling 清单替代正确 package identity |

因此：一个包需要 Vite transform，不代表需要 Nitro inline；一个 runtime package 在 `.output` 缺失，也不代表需要 Vite noExternal。

## 4. 为什么旧枚举方式会“看起来有效”

常见演化过程：

```text
external package 报错
→ noExternal/inline 上游包
→ 原错误消失
→ 下一个 transitive dependency 报错
→ 再加入列表
→ 最终形成几十个 matcher
```

错误消失只说明代码被改走另一条执行路径，不证明 dependency contract 修好了。

## 5. SmallAliceWeb 的直接反证

### 5.1 E1：删除列表后 graph 明显缩小

E1 移除 production source alias、blanket `vite.ssr.noExternal` 和 blanket `nitro.externals.inline` 后：

- 历史 server transformed modules：约 4028；
- E1：2449；
- 下降约 39%；
- prerender 在默认约 4144 MiB 下完整完成；
- 剩余 OOM 被收敛到 final Nitro Rollup/write。

详见 [`experiments/e1-default-heap-minimal-bundle.md`](./experiments/e1-default-heap-minimal-bundle.md)。

### 5.2 E6-B：只 inline Element Plus 也会重新 OOM

单变量：

```ts
nitro: {
  externals: {
    inline: ["element-plus"],
  },
}
```

结果：5120 MiB production build 失败，runtime smoke 无法进入。

详见 [`experiments/e6-runtime-output-package-alias.md`](./experiments/e6-runtime-output-package-alias.md)。

### 5.3 真正 runtime 故障属于 alias identity + standalone tracing

初始 5120 candidate full build 成功，但 HTTP `/`：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
imported from .output/server/node_modules/element-plus/...
```

依赖身份：

```text
logical package: @popperjs/core
real package:    @sxzz/popperjs-es
relationship:    npm alias
```

这是 npm alias logical identity + pnpm symlink layout + Nitro standalone tracing/copy 边界问题，不是“Element Plus 必须整体 bundle”。

### 5.4 最小修复位于 deployment package manifest

最终采用：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

结果：5120 full build、`.output` startup、HTTP smoke、Vercel 都成功。

## 6. 为什么不能在 Vite 和 Nitro 复制同一列表

1. 生命周期不同：SSR transform 与 final server bundling/tracing 不是一层。
2. wide matcher 会扩大 graph 和 V8 working set。
3. bundling 可能暂时掩盖缺失/错误 manifest contract。
4. bundling 不能自动修 npm alias 的逻辑身份。
5. 第三方内部依赖不是应用应长期维护的稳定 API。
6. 多 matcher 同时变化会破坏因果定位。
7. build 绿色仍可能 runtime 失败。

## 7. `ssr.noExternal` 准入条件

只有同时满足才允许：

- exact error 明确发生在 Vite SSR transform/load；
- 已证明 externalized Node 路径失败且确实需要 Vite transform；
- 单变量只加一个精确 package/path；
- 不自动追加 transitive dependency；
- module count/RSS/build time 有前后对比；
- full build + standalone HTTP + Vercel 均通过；
- 记录删除条件。

宽 regex 必须额外解释为什么不会把依赖族整体拖入 graph。

## 8. `nitro.externals.inline` 准入条件

只有同时满足才允许：

- exact error 位于 Nitro/server externalized code path；
- 已证明代码必须由 Nitro/Rollup bundle；
- 单变量只 inline 最小 package/path；
- 5120 MiB full build 仍通过；
- module count/RSS/output size 无不可接受退化；
- standalone HTTP + Vercel 通过；
- 记录 upstream issue/删除条件。

**Vite 中存在 matcher 不能作为 Nitro 复制同一 matcher 的理由，反之亦然。**

## 9. 决策树

```text
Vite SSR transform/syntax/module-format 明确失败？
→ 测一个最小 noExternal

Nitro external code 必须 bundle 才能转换？
→ 测一个最小 inline

nuxt build 成功但 .output HTTP MODULE_NOT_FOUND？
→ 查 logical package / manifest / alias / symlink / output closure
→ 优先修 deployment package 或 tracing boundary

final Nitro build OOM？
→ 查 module count / RSS / source alias / wide noExternal / wide inline
→ 不要用更多 inline 修内存
```

## 10. 明确禁止的回归模式

- Vite/Nitro 两边维护高度重合的依赖家族列表；
- `/element-plus/`、`/@vueuse/` 等宽 matcher 作为“保险”；
- 一个 MODULE_NOT_FOUND 就 inline 整个 UI 库；
- production alias 到 workspace `src` 再靠 noExternal/inline 兜底；
- 为“避免漏包”手工枚举 transitive dependency；
- 用 `shamefullyHoist` / global `nodeLinker: hoisted` 隐藏局部 contract 缺陷；
- 只看 build complete，不做真实 runtime 验证。

## 11. 新 exception 的验收清单

- [ ] first failing gate 与 exact error 已记录；
- [ ] 已说明为什么必须 transform/bundle，而不是修更小 dependency boundary；
- [ ] 只有一个主要变量；
- [ ] Vite/Nitro 没有机械复制 matcher；
- [ ] module count/RSS/heap/build time 有对照；
- [ ] 5120 MiB full build 成功；
- [ ] `.output` HTTP smoke 成功；
- [ ] Vercel exact-SHA deployment 成功；
- [ ] 有删除条件。

## 12. 历史文档纠偏

2026-08-01 的事故报告记录另一个仓库曾通过 narrow noExternal/inline 处理其特定 externalization 问题；该事实不能推广为 SmallAliceWeb 的依赖族清单。

详细勘误：[`../2026-08-01-nuxt-content-monorepo-build-fragility-incident-errata-2026-08-19.md`](../2026-08-01-nuxt-content-monorepo-build-fragility-incident-errata-2026-08-19.md)。

## 13. 相关内部证据

- [`experiments/e1-default-heap-minimal-bundle.md`](./experiments/e1-default-heap-minimal-bundle.md)
- [`experiments/e5-minimal-heap-headroom.md`](./experiments/e5-minimal-heap-headroom.md)
- [`experiments/e6-runtime-output-package-alias.md`](./experiments/e6-runtime-output-package-alias.md)
- [`next-steps/r05-production-bundling-regression-guard.md`](./next-steps/r05-production-bundling-regression-guard.md)
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`

## 14. 最终原则

优先修依赖身份、package boundary、artifact tracing 和真实失败生命周期。`noExternal` / `inline` 是精确工具，不是人工重建整个传递依赖图的机制。
