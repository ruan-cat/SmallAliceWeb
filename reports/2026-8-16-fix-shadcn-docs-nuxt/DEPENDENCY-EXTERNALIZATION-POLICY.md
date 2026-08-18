# Nuxt SSR / Nitro 依赖 externalization 策略

> 日期：2026-08-19
>
> 状态：**本轮 `packages/ai-vue-doc` 依赖 externalization / bundling 的权威决策说明。**
>
> 适用范围：`packages/ai-vue-doc` 及后续与 Nuxt 3 / Nitro 2 / Vite SSR / pnpm workspace 相关的依赖兼容修复。

## 1. 决策摘要

本轮从 `packages/ai-vue-doc/nuxt.config.ts` 删除大规模 `vite.ssr.noExternal` 与 `nitro.externals.inline` 依赖枚举，不是为了“少写配置”，也不是认为这两个官方能力永远不应该使用。

真正的决策是：

> **禁止把 `ssr.noExternal` / `nitro.externals.inline` 当成通用依赖解析器，禁止通过不断罗列 Element Plus、VueUse、Popper、lodash 等传递依赖来维持文档站。只有当一个精确、可复现的 transform/bundle 问题证明某个具体包必须进入对应构建阶段时，才允许增加最小例外。**

当前生产配置恢复为框架默认 externalization 行为，只保留已有证据支持的配置和兼容层。

本轮最终修复没有依赖重新扩充 `noExternal` / `inline` 列表，而是：

1. 移除 production source alias 与大范围 bundling 图放大器；
2. 以 5120 MiB 作为当前最低已测试通过的 old-space 档位；
3. 对 Nitro standalone output 实际缺失的逻辑 runtime package `@popperjs/core`，在真正部署的 `packages/ai-vue-doc` 中显式声明对应 npm alias dependency；
4. 用 `.output/server/index.mjs` + HTTP 请求验证产物，而不是只看 `nuxt build` 是否绿色。

## 2. 被删除的旧配置是什么

历史 `vite.ssr.noExternal` 曾按依赖族罗列：

```ts
vite: {
  ssr: {
    noExternal: [
      "@ruan-cat-drill-doc/ai-vue",
      /element-plus/,
      /@element-plus/,
      /@vueuse/,
      /vue-demi/,
      /@ctrl\/tinycolor/,
      /@floating-ui/,
      /@popperjs\/core/,
      /async-validator/,
      /escape-html/,
      /lodash-unified/,
      /lodash-es/,
      /memoize-one/,
      /normalize-wheel-es/,
      /entities/,
    ],
  },
}
```

Nitro 又维护了一份高度重合的 `externals.inline`：

```ts
nitro: {
  externals: {
    inline: [
      "@ruan-cat-drill-doc/ai-vue",
      /element-plus/,
      /@element-plus/,
      /@vueuse/,
      /vue-demi/,
      /@ctrl\/tinycolor/,
      /@floating-ui/,
      /@popperjs\/core/,
      /async-validator/,
      /escape-html/,
      /lodash-unified/,
      /lodash-es/,
      /memoize-one/,
      /normalize-wheel-es/,
      /entities/,
    ],
  },
}
```

这两份列表看起来像“依赖兼容白名单”，但实际上把两个不同生命周期的构建控制混成了一个人工维护的传递依赖清单。

## 3. 两个配置真正负责什么

| 配置 | 真正职责 | 合理使用场景 | **不负责** |
| --- | --- | --- | --- |
| `vite.ssr.noExternal` | 阻止指定依赖在 Vite SSR 阶段被 externalize，使它进入 Vite SSR transform / build | 某个依赖确实需要 Vite 转换，例如发布物包含未转译、必须经过 Vite pipeline 的代码 | 安装缺失 runtime dependency；修 Nitro standalone copy；修 npm alias identity |
| `nitro.externals.inline` | 在 Nitro server bundling 阶段把匹配代码留在 bundle 中，而不是走 external dependency 路径 | 某个精确依赖的代码必须由 Nitro/Rollup 处理，例如依赖内部使用只有 bundle 后才能解析的应用 alias | 修 pnpm lockfile；修 package manifest；保证所有 externalized runtime package 被正确 trace/copy |
| `package.json dependencies` | 声明应用真实 runtime dependency 边界与逻辑包名 | 部署包在运行时确实 import/需要该逻辑 package | 控制 Vite/Nitro 如何 transform 代码 |
| Nitro/NFT tracing | 为 externalized server dependency 找到并复制 standalone runtime closure | 生成 `.output` / serverless 运行依赖 | 不能依赖一张人工 bundling 列表替代正确 package identity |

Vite 官方文档明确说明：SSR dependencies 默认 externalize；当依赖**需要 Vite pipeline 转换**时才应加入 `ssr.noExternal`。因此 `noExternal` 是 SSR transform/bundling 开关，不是一般意义上的“依赖找不到修复器”。

Nitro/Nuxt 上游也存在需要 `externals.inline` 的真实场景：例如一个 external package 内部使用 Nuxt 应用 alias，代码必须被 Nitro bundler 处理后 alias 才能生效。这说明 `inline` 是合法的**窄例外工具**，但不能推出“复杂 monorepo 应把整个 UI 依赖族都 inline”。

上游参考：

- Vite SSR externalization：<https://vite.dev/guide/ssr.html#ssr-externals>
- Vite `ssr.noExternal`：<https://vite.dev/config/ssr-options#ssr-noexternal>
- Nuxt issue #31616（Nitro alias / narrow inline 场景）：<https://github.com/nuxt/nuxt/issues/31616>
- Nitro issue #1574（pnpm npm alias tracing）：<https://github.com/nitrojs/nitro/issues/1574>

## 4. 为什么旧的依赖枚举方式当时“看起来合理”

这种配置很容易在短期调试中产生正反馈：

1. 某个 external package 因 ESM/CJS、应用 alias、linked workspace source 等原因无法直接由 Node runtime 加载；
2. 把它加入 `noExternal` 或 `inline` 后，bundler 接管它；
3. 原来的 module-resolution 错误消失；
4. 接着遇到它的下一个传递依赖，再把下一个包加入列表；
5. 最后形成十几个包名/正则的“兼容清单”。

这种方法的问题是：**错误消失并不证明 dependency contract 被修好，只证明代码被改走了另一条执行路径。**

当列表逐渐包含 `element-plus -> @vueuse -> floating-ui -> popper -> lodash -> entities ...` 时，配置已经从“一个精确 bundling exception”退化成“手工重建整个传递依赖图”。

## 5. 本轮为什么必须删除这些列表

### 5.1 E1 直接证明它们是 production graph 放大器

E1 同时收敛 production source alias、blanket `vite.ssr.noExternal` 和 blanket `nitro.externals.inline` 后：

- 历史 server transformed modules：约 `4028`；
- E1 server transformed modules：`2449`；
- 下降约 **39%**；
- Nitro prerender 在默认约 4144 MiB heap 下完整完成；
- 剩余 OOM 被精确后移到 final Nitro server Rollup build/write。

这说明旧配置不是无害“保险项”，而是实际扩大了构建 working set。

详细证据：[`experiments/E1-default-heap-minimal-bundle.md`](./experiments/E1-default-heap-minimal-bundle.md)。

### 5.2 E6-B 证明即使只 inline 一个大包也会重新跨过内存边界

为了修复 `.output` 中 `@popperjs/core` 缺失，本轮做过严格单变量实验：

```ts
nitro: {
  externals: {
    inline: ["element-plus"],
  },
}
```

结果不是 runtime 变绿，而是 **5120 MiB production build 先失败**，runtime smoke 根本无法执行。

因此“只把 Element Plus inline，应该比旧大列表温和”也已经被本仓库的 CI 反证。

详细证据：[`experiments/E6-runtime-output-package-alias.md`](./experiments/E6-runtime-output-package-alias.md)。

### 5.3 真正的 runtime 故障不在 bundling 列表这一层

5120 MiB 初始候选已经能完成 full build，但 `.output/server/index.mjs` 在真实 HTTP `/` 上返回 500：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
imported from .output/server/node_modules/element-plus/...
```

Element Plus 的逻辑依赖是：

```text
@popperjs/core -> npm:@sxzz/popperjs-es
```

这属于 **npm alias logical package identity + pnpm symlink layout + Nitro standalone tracing/copy** 的边界问题。

Nitro 上游 #1574 对同一 `@sxzz/popperjs-es` / `@popperjs/core` alias 关系也指出：pnpm 通过 symlink 暴露 alias 时，external package tracing 很难自动识别逻辑别名。

把 Element Plus 或其整个传递依赖族重新 bundle，只是在绕开 externalized runtime path；它没有修复“standalone output 应该以哪个逻辑包名携带 runtime dependency”这一依赖契约。

### 5.4 E6-A 的局部 dependency 修复更符合真实故障边界

最终采用：

```json
{
  "dependencies": {
    "@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
  }
}
```

它把修复放在实际部署 package 的 runtime dependency 边界，而不是修改整个 server bundling 策略。

结果：

- 5120 MiB full build：✅
- `.output/server/index.mjs`：✅
- HTTP runtime smoke：✅
- Vercel Git Preview：✅

这也是为什么最终配置选择**删除旧 externalization 列表 + 显式补齐精确 runtime dependency**。

## 6. 为什么“Vite 和 Nitro 各抄一份依赖列表”是错误模型

### 6.1 两个生命周期不是同一个问题

Vite SSR transform 与 Nitro final server bundling/output tracing 是不同阶段。

一个包需要 Vite transform，不代表它也必须被 Nitro inline；反过来也一样。把同一张列表复制到两个配置中，只是把“我们不知道哪一层有问题”固化成配置。

### 6.2 会持续放大 graph 与 V8 working set

宽正则如 `/element-plus/`、`/@vueuse/` 会把整族代码纳入 bundler 管理。依赖升级后新增的内部模块也会自动被匹配，blast radius 会在没有显式代码 diff 的情况下继续增长。

### 6.3 会掩盖 package manifest / runtime dependency 缺陷

如果应用缺少一个实际 runtime dependency，而 bundler 恰好把它和上游代码一起卷入产物，本地可能“看起来好了”。未来只要 externalization、preset、平台或版本改变，同一缺陷会重新暴露。

### 6.4 无法修复 npm alias 的逻辑身份

`@popperjs/core` 是运行时代码使用的逻辑 package name，物理包是 `@sxzz/popperjs-es`。是否 bundle Element Plus 与 Nitro tracer 是否正确保留这个逻辑 identity 是两个问题。

### 6.5 列表会随传递依赖无限增长

Element Plus、VueUse、floating-ui、lodash 等内部依赖不是应用应手工维护的稳定 API。上游每次改依赖图，都可能让“兼容清单”过时。

### 6.6 会破坏因果定位

一次改十几个 package matcher 后，即使 CI 绿色，也无法知道真正需要 transform 的到底是哪一个包。后续 agent 只能继续复制这张神秘列表。

### 6.7 build 绿色仍可能 runtime 失败

本轮初始 5120 候选已经三次 full build 成功，但 runtime smoke 确定性失败。这证明 bundling/build 验收不能替代 standalone runtime 验收。

## 7. 什么时候仍然允许 `ssr.noExternal`

只有满足以下条件，才允许增加一个 narrow `ssr.noExternal` 例外：

1. 有 exact SSR error，证明该 dependency 以 external 方式进入 Node 时失败；
2. 失败原因确实需要 Vite transform，例如未转译语法、Vite-specific transform、linked package 发布形态不满足 Node runtime；
3. 单变量实验只加入一个精确 package/path matcher 后恢复；
4. 不把该包的所有传递依赖同步加入列表；
5. 同时记录 module count / RSS / build 时间变化；
6. `.output` runtime 与 Vercel 仍需单独通过。

优先包名或精确路径；宽 regex 必须额外解释为什么不会匹配整个依赖族。

## 8. 什么时候仍然允许 `nitro.externals.inline`

只有满足以下条件，才允许增加一个 narrow `nitro.externals.inline` 例外：

1. exact Nitro/server error 证明该代码必须由 Nitro/Rollup bundle；
2. 例如 external package 内使用应用 alias，externalized 运行时无法解析，而 bundle 后可以由 Nitro 正确转换；
3. 单变量实验只 inline 最小 package/path；
4. 5120 MiB build 仍需通过；
5. 必须比较 module count、RSS 和 output size；
6. standalone HTTP smoke 与 Vercel 必须通过；
7. 代码旁或报告内必须记录上游 issue、责任人和删除条件。

**禁止因为某包出现在 `vite.ssr.noExternal` 中，就自动把它复制到 `nitro.externals.inline`。**

## 9. 遇到复杂依赖错误时的决策树

```text
出现 Nuxt / SSR / Nitro 依赖错误
|
+-- Vite SSR transform / syntax / module-format 明确失败？
|   |
|   +-- 是 -> 测试一个最小 ssr.noExternal 例外
|   +-- 否 -> 不改 noExternal
|
+-- Nitro external package 内部依赖应用 alias，必须 bundle 才能转换？
|   |
|   +-- 是 -> 测试一个最小 externals.inline 例外
|   +-- 否 -> 不改 inline
|
+-- nuxt build 成功，但 .output HTTP 报 MODULE_NOT_FOUND？
|   |
|   +-- 检查 exact logical package name
|   +-- 检查 package.json / lockfile / npm alias / pnpm symlink
|   +-- 检查 .output 是否真的携带对应 runtime dependency
|   +-- 优先修 deployment package dependency 或 tracer/layout 边界
|   +-- 不要先 inline 整个上游库
|
+-- final Nitro build OOM？
    |
    +-- 比较 production graph / module count / RSS
    +-- 查 source alias、wide noExternal、wide inline 等图放大器
    +-- 不要用更多 inline 来修内存问题
```

## 10. 明确禁止的模式

在 `packages/ai-vue-doc` 中，以下写法默认视为需要阻止的回归：

- 在 Vite 与 Nitro 维护两份高度重合的依赖家族列表；
- 用 `/element-plus/`、`/@vueuse/` 等宽规则作为“保险”；
- 遇到一个 `MODULE_NOT_FOUND` 就把整个 UI 库 inline；
- 把 workspace package production alias 回 `../*/src`，再靠 noExternal/inline 兜底；
- 为了“避免遗漏”把所有 transitive dependency 都加入 noExternal/inline；
- 把一次绿色 CI 当成 bundling 配置正确的充分证据；
- 通过 `shamefullyHoist`、全局 `nodeLinker: hoisted` 或大范围 bundling 隐藏依赖边界缺陷。

## 11. 任何新 exception 的验收清单

新增 `noExternal` 或 `inline` 前必须在 PR / 实验报告回答：

- [ ] exact error 是什么？发生在 Vite SSR、Nitro build，还是 `.output` runtime？
- [ ] 为什么该 package 必须 transform/bundle，而不是补 dependency contract？
- [ ] 是否只改了一个 package/path matcher？
- [ ] 是否证明另一个阶段不需要复制同一 matcher？
- [ ] server transformed modules 是否显著增长？
- [ ] maximum RSS / heap 是否退化？
- [ ] 5120 MiB full build 是否仍成功？
- [ ] `.output/server/index.mjs` HTTP smoke 是否成功？
- [ ] Vercel Git Preview 是否成功？
- [ ] 是否记录 upstream issue / 删除条件？

没有这些证据，不得恢复旧式依赖枚举表。

## 12. 历史文档纠偏

### `reports/2026-08-01-nuxt-content-monorepo-build-fragility-incident.md`

该报告记录了另一个仓库 `eams-component-lib` 曾通过 `vite.ssr.noExternal` + 精准 `nitro.externals.inline` 处理其当时的 SSR externalization / Vercel dependency-copy 故障，并在专项建议中写过“保留”这些配置。

这段内容应按**历史、仓库特定 workaround**理解，不能再推广为 SmallAliceWeb 的长期依赖策略。

本轮 E1/E6 已提供更直接的 SmallAliceWeb 反证：

- 大范围列表会放大 graph；
- selective inline `element-plus` 也会使 5120 MiB build 失败；
- 当前 npm alias runtime 缺包最终由精确 app dependency 修复，而不是由 inline 修复。

对应勘误见：[`../2026-08-01-nuxt-content-monorepo-build-fragility-incident-ERRATA-2026-08-19.md`](../2026-08-01-nuxt-content-monorepo-build-fragility-incident-ERRATA-2026-08-19.md)。

### `.agents/.../2026-08-01-nuxt-content-monorepo-compatibility.md`

原经验中的 `8 GiB` 是 2026-08-01 当时的构建控制结果，不再是当前推荐基线。后续 E1/E5 已把 production graph 缩小，并测得 4608 MiB 失败、5120/6144 MiB 成功；当前最低已测试通过档为 5120 MiB。

该 memory 已补充 2026-08-19 后续纠偏，禁止从旧事故类比出“恢复 noExternal/inline 依赖族列表”的规则。

## 13. 相关内部证据

- [`experiments/E1-default-heap-minimal-bundle.md`](./experiments/E1-default-heap-minimal-bundle.md)
- [`experiments/E5-minimal-heap-headroom.md`](./experiments/E5-minimal-heap-headroom.md)
- [`experiments/E6-runtime-output-package-alias.md`](./experiments/E6-runtime-output-package-alias.md)
- [`.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`](../../.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md)
- [`next-steps/R05-production-bundling-regression-guard.md`](./next-steps/R05-production-bundling-regression-guard.md)

## 14. 最终原则

对于复杂 Nuxt/pnpm monorepo 依赖问题，优先修**依赖身份、package boundary、产物 tracing 和真实失败生命周期**。

`ssr.noExternal` 与 `nitro.externals.inline` 是有价值的构建控制工具，但它们必须是**有证据、单变量、可删除的最小例外**，不能再承担“人工枚举整个传递依赖图”的职责。
