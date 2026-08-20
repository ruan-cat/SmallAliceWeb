# 根因模型：Nuxt production graph、heap 与 standalone alias tracing

> 更新：2026-08-20
>
> 状态：最终根因模型。当前模型需要同时解释 graph OOM、runtime alias 缺包，以及临时 wrapper 为何可以退役。

## 1. 总览

```text
A. production graph amplification
   ↓
   final Nitro build working set 增大

B. standalone npm-alias dependency closure 缺口
   ↓
   build 成功后仍可能 HTTP runtime MODULE_NOT_FOUND

C. graph 收敛后的实际 heap headroom
   ↓
   4608 FAIL / 5120 PASS / 6144 PASS

D. 临时 process wrapper
   ↓
   只控制构建环境，不属于 A/B 根因
```

A 与 B 是不同生命周期的独立故障；C 是容量边界；D 是调查工具。

## 2. 根因 A：production graph 被历史配置放大

历史存在：

- production source alias 绕过 package dist/exports；
- blanket/wide `vite.ssr.noExternal`；
- blanket/wide `nitro.externals.inline`。

E1 删除后 server modules 约：

```text
4028 -> 2449
约 -39%
```

prerender 在默认约 4144 MiB 下完整成功，失败被明确后移到 final Nitro Rollup/write。

最合理解释：旧 source/bundling 配置让 Vite/Nitro 处理远大于必要范围的模块闭包，显著提高 working set。

E6-B 只 inline `element-plus` 就让 5120 MiB build 重新失败，进一步证明大型 forced bundling 不是低成本 runtime 缺包修复。

## 3. C：5120 MiB 的正确定位

E5：

```text
4608 -> FAIL
5120 -> PASS
6144 -> PASS
```

因此 5120 是当前最低已测试通过的 operational headroom，而不是：

- “根因就是 heap 太小”；
- “Nuxt 天生需要 5/8 GiB”；
- “以后 OOM 就继续涨 heap”。

未来如果 module count/RSS 增长，应先查 graph regression。

## 4. 根因 B：npm alias logical identity 在 standalone closure 中不完整

初始 5120 candidate build 成功，但 HTTP runtime：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

身份关系：

```text
runtime logical import: @popperjs/core
npm alias target:       @sxzz/popperjs-es
```

pnpm isolated/symlink 下 logical specifier、真实 package identity、physical realpath 不等价。

最能解释事实的模型：

```text
npm alias logical identity
+ pnpm symlink / virtual-store layout
+ Nitro/NFT standalone trace/copy
→ logical runtime name 未稳定进入 output closure
→ HTTP runtime MODULE_NOT_FOUND
```

## 5. E6/E7 验证 B

### E6-A direct dependency 成功

部署 package 显式声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

build + HTTP runtime 成功。说明 manifest 显式化 logical runtime identity 能补齐当前 closure。

### E6-C traceAlias 无效

build 成功但 runtime 仍缺同一逻辑包，说明当前版本组合下该选项不足以修 actual output copy。

### E7-B targeted public hoist 成功

说明 pnpm visibility/layout 参与问题。

### E7-A global hoisted linker 回归

5120 MiB OOM，max RSS `5,646,292 kB`。说明不能把结论简化成“全部扁平化即可”。

最终选择 app-local dependency，因为责任边界小于 workspace-wide topology policy。

## 6. A/B/C 为什么必须分开

只提高 heap：B 仍可能 runtime 缺包。

只 inline Element Plus：可能绕开 external runtime path，但重新放大 A，build 先 OOM。

全局 hoist：可能改变 B 的可见性，同时改变 A 的 working set。

最终形态：

```text
A -> 收敛 production graph
B -> deployment package 显式 runtime dependency
C -> GitHub build step 使用实测 5120 MiB
```

## 7. D：为什么 memory wrapper 可以退役

`run-nuxt-with-memory.mjs` 的职责只是：

- 注入 5120 MiB NODE_OPTIONS；
- 固定 cwd；
- Windows 使用 `pnpm.cmd`；
- 继承 stdout/stderr；
- 透传退出码。

它没有改变 A 的 production graph，也没有修 B 的 alias identity。

根因修复完成后，package 恢复原生 `nuxt prepare` / `nuxt build`，CI build step 直接提供 5120 MiB 即可。

退役 SHA `ba810875...`：

- GitHub `32335097226 / 96323008840`：build + `.output` HTTP smoke success；
- Vercel `dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt`：READY，日志确认原生 Nuxt commands。

因此 D 是控制工具，不是最终依赖。

## 8. 已排除的主要假设

| 假设 | 证据 | 判断 |
| --- | --- | --- |
| prerender concurrency 是主因 | E1 prerender 完成 | ❌ |
| modern NFT trace 单独导致 OOM | E2-A | ❌ |
| legacy externals 可解决 | E2-B | ❌ |
| server sourcemap 是决定性来源 | E3 | ❌ |
| treeshake off 可解决 | E4 | ❌ |
| inline Element Plus 成本低 | E6-B OOM | ❌ |
| traceAlias 可直接修 alias closure | E6-C runtime fail | ❌ |
| global hoist 是安全根治 | E7-A OOM | ❌ |
| build success 等于可部署 | initial candidate build ✅ / HTTP ❌ | ❌ |
| memory wrapper 是长期必要条件 | `ba810...` GitHub/Vercel 无 wrapper 成功 | ❌ |

## 9. 与旧 H3/Content 事故的关系

旧 H3/Content 事故属于：

```text
compatibility matrix
+ phantom/undeclared runtime dependency
+ wrong runtime instance
```

本次 Popper 属于：

```text
npm alias identity
+ pnpm layout
+ standalone tracing/copy
```

共享方法论，但不能复制具体 workaround。

## 10. 平台差异

Windows 当前仍条件化：

```text
process.platform === "win32"
→ nitro.externals.trace=false
```

它是历史平台 workaround，不是 Linux/Vercel 根因。E2-A 已证明不能推广到 Linux。

## 11. 当前模型的预测能力

模型可以解释：

- 删除 blanket bundling 后 module count 大幅下降；
- 默认 heap 仍在 final build OOM；
- 5120 让 build 通过；
- build 通过后仍 runtime 缺 alias；
- direct logical dependency 与 targeted hoist 都能改善 runtime；
- global hoist / inline Element Plus 会重新 OOM；
- 删除 memory wrapper 后，只要 CI 仍提供 5120，GitHub/Vercel 仍能构建。

因此不再寻找一个同时替代 A/B/C 的“神秘开关”。

## 12. 维护原则

1. production graph 保持最小；
2. 5120 必须结合 module/RSS 趋势看待；
3. post-build MODULE_NOT_FOUND 优先查 manifest、logical identity、alias、symlink、artifact closure；
4. workspace-wide hoist/linker 只作为高爆炸半径实验；
5. 可部署结论必须跨过真实 HTTP runtime；
6. 临时 wrapper/shim 必须有删除条件并在根因修复后退役；
7. 通用方法见 [`../complex-dependency-troubleshooting-methodology.md`](../complex-dependency-troubleshooting-methodology.md)。
