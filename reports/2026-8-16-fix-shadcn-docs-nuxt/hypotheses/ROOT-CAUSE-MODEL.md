# ROOT CAUSE MODEL：Nuxt production graph、heap 与 standalone alias tracing

> 更新：2026-08-20
>
> 状态：**最终根因模型。** 本文件不再记录“下一步猜测”，只描述目前能够解释全部主要实验结果的模型。

## 1. 总览

本次故障必须拆成三个层次，其中前两层构成主要根因，第三层是测量后的运行预算：

```text
A. production graph amplification
   ↓
   使 final Nitro build 的 working set 显著增大

B. standalone npm-alias dependency closure 缺口
   ↓
   build 成功后仍可能在真实 HTTP runtime MODULE_NOT_FOUND

C. graph 收敛后的实际 heap headroom
   ↓
   4608 FAIL / 5120 PASS / 6144 PASS
```

A 与 B 是**不同生命周期的独立故障**。C 是在 A 已收敛后测得的容量边界，不应被当成 A/B 的替代解释。

## 2. 根因 A：production graph 被历史 bundling/source-alias 配置放大

历史配置同时把多个依赖和 workspace source 强制带入 bundler：

- production source alias 绕过正式 package boundary；
- blanket/wide `vite.ssr.noExternal`；
- blanket/wide `nitro.externals.inline`。

E1 是关键因果证据：移除这些配置后，server transformed modules 从历史约 4028 降到 2449，约减少 39%。

同时失败阶段发生明显后移：

```text
旧状态：prerender/final build 附近高压、边界模糊
E1：prerender 完整成功
    -> final Nitro server Rollup/write 才 OOM
```

因此最合理解释是：

> 历史 bundling/source-alias 配置让 Vite/Nitro 必须处理远大于必要范围的模块闭包，显著抬高 production build 的 working set。

### 2.1 为什么不能靠恢复 `noExternal` / `inline` 修依赖

E6-B 只 inline `element-plus`，5120 MiB build 就重新失败。这说明即使不是旧 blanket 列表，单个大型 UI package 的 forced inline 也足以产生明显 graph 回归。

因此：

- `noExternal` / `inline` 不是一般依赖修复器；
- 它们只适合 exact transform/bundle failure 的 narrow exception；
- “缺一个 runtime package → inline 整个上游库”与本仓库证据冲突。

## 3. 5120 MiB：graph 收敛后的容量边界，而不是根因

E5：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

这说明即使 production graph 已显著收敛，final Nitro server build 仍需要高于 4608 MiB 的 V8 old-space。

因此 5120 的正确定位是：

> **当前最低已测试通过的 operational headroom。**

错误定位包括：

- “根因就是 heap 太小”；
- “Nuxt 天生需要 8 GiB”；
- “以后 OOM 就继续涨到 12/16 GiB”。

未来如果 module count / RSS 明显增长，应先查 graph regression，而不是自动提高 headroom。

## 4. 根因 B：standalone output 对 npm alias 的逻辑 runtime dependency closure 不完整

5120 MiB candidate 能完成 full build，却在 `.output` 真实 HTTP 请求时报：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

依赖身份：

```text
runtime logical import: @popperjs/core
npm alias target:       @sxzz/popperjs-es
```

在 pnpm 默认 isolated/symlink 布局中：

- 逻辑 package specifier；
- 实际 npm package identity；
- `.pnpm` physical realpath；

不是同一个概念。

源码 workspace 能 resolve transitive alias，并不保证 Nitro standalone tracing/copy 会以 runtime 需要的**逻辑包名**复制完整 dependency closure。

因此最能解释 runtime 事实的模型是：

```text
npm alias logical identity
+ pnpm symlink / virtual-store layout
+ Nitro/NFT standalone trace/copy
-> logical runtime package name not preserved completely
-> HTTP runtime MODULE_NOT_FOUND
```

这与 Nitro upstream #1574 的问题边界一致。

## 5. E6 / E7 如何验证根因 B

### E6-A：app-local direct dependency 成功

在实际 deployment package 声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

使 build + runtime 全部成功。

这说明把逻辑 runtime identity 明确写入 deployment package manifest 能补齐当前 output closure。

### E6-C：traceAlias 无效

`traceAlias` 可以完成 build，但 runtime 仍然缺相同逻辑包。

因此当前版本组合下，单独启用该 tracing option 不足以修复实际 `.output`。

### E7-B：targeted public hoist 成功

只 public-hoist `@popperjs/core` 可以让 build + runtime 成功。

这证明 **pnpm visibility/layout 参与了故障**。

### E7-A：global hoisted linker 产生严重回归

全局 `nodeLinker: hoisted` 让 5120 MiB production build OOM，max RSS `5,646,292 kB`。

因此不能把根因简化成：

> “pnpm 不够扁平，所以全部 hoist 即可。”

更准确的是：

> layout 会影响 alias visibility/tracing，但全局改变 topology 会同时改变整个 production working set。

这解释了为什么最终选择 app-local dependency，而不是 workspace-wide linker policy。

## 6. 为什么 A 与 B 必须分开

如果把它们混为一个“依赖问题”，会得到错误方案：

### 只加 heap

```text
A 仍可能 graph 膨胀
B 仍然 runtime 缺包
```

### 只 inline Element Plus

```text
可能绕过 B 的 externalized runtime path
但重新放大 A
-> 5120 MiB build 先 OOM
```

### 全局 hoist

```text
可能改变 B 的可见性
但同时改变 A 的 working set
-> build regression
```

最终修复之所以稳定，是因为两个问题分别在自己的责任边界处理：

```text
A -> 收敛 bundling/source graph
B -> 显式 deployment runtime dependency
C -> 使用实测 5120 MiB headroom
```

## 7. 已排除的主要假设

当前证据足以降低或排除以下假设：

| 假设 | 证据 | 当前判断 |
| --- | --- | --- |
| prerender concurrency 是主要剩余根因 | E1 prerender 已完整成功 | ❌ |
| modern NFT trace 单独导致默认 heap OOM | E2-A 失败 | ❌ |
| legacy externals 可直接解决 | E2-B 失败 | ❌ |
| server sourcemap 是决定性峰值来源 | E3 失败 | ❌ |
| 关闭 treeshake 可解决 | E4 失败 | ❌ |
| inline Element Plus 可修 runtime 且成本低 | E6-B build OOM | ❌ |
| traceAlias 可直接补齐 runtime alias | E6-C runtime 失败 | ❌ |
| 全局 hoisted linker 是安全根治 | E7-A build OOM | ❌ |
| build success 可以代表可部署 | initial 5120 candidate build ✅ / runtime ❌ | ❌ |

## 8. 与旧 H3 / Content 事故的关系

本仓库此前还发生过 Nuxt Content/H3 世代失配：Content runtime import H3，但 package metadata 没有完整表达兼容边界，导致 Nuxt 3 runtime 解析到不兼容 H3 v2。

那次事故属于：

```text
compatibility matrix
+ phantom/undeclared runtime dependency
+ wrong runtime instance
```

本次 Popper 事故属于：

```text
npm alias identity
+ pnpm layout
+ standalone tracing/copy
```

两者可以共享“先识别 dependency identity / failure gate”的方法论，但不能互相复制具体 workaround。

## 9. 平台差异的正确位置

Windows 当前仍有条件化：

```ts
process.platform === "win32"
  -> nitro.externals.trace = false
```

它是一个平台特定 compatibility workaround，不是本次 Linux/Vercel production 根因的一部分。

E2-A 已证明把 `trace:false` 扩展到 Linux 并不能解决剩余默认-heap问题，因此不得把 Windows workaround 泛化成生产规则。

## 10. 最终模型的可预测性

一个根因模型只有能预测实验结果才有价值。当前模型能够解释：

- 为什么移除 blanket bundling 后 module count 大幅下降；
- 为什么默认 4 GiB 仍会在 final server build OOM；
- 为什么 5120 能让 build 通过；
- 为什么 build 通过后仍会出现 runtime MODULE_NOT_FOUND；
- 为什么 direct logical dependency 能修 runtime；
- 为什么 targeted public hoist 也能修 runtime；
- 为什么 global hoist 反而让 build OOM；
- 为什么 inline Element Plus 也让 build OOM。

因此当前不需要继续寻找一个能够同时替代 A/B/C 的“单一神秘开关”。

## 11. 当前维护原则

1. production graph 默认保持最小，不恢复依赖族 noExternal/inline 列表；
2. 5120 作为测得的 build budget，未来必须配合 module/RSS 趋势看待；
3. post-build `MODULE_NOT_FOUND` 优先检查 deployment package manifest、logical package identity、alias、symlink 与 artifact closure；
4. workspace-wide linker/hoist 只作为高爆炸半径实验，不作为局部缺包第一选择；
5. 所有“可部署”结论必须跨过真实 `.output` HTTP runtime；
6. 更一般的方法见 [`../COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md`](../COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md)。
