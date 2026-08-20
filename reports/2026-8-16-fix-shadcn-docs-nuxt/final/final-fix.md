# 最终修复：Nuxt 文档构建与 standalone runtime 稳定化

> 更新：2026-08-20
>
> 状态：功能根因修复与临时 memory wrapper 退役均已通过 GitHub Actions / Vercel 验证。

## 1. 功能修复基线

功能提交：

```text
a021ce96534360029e579183b8b5841b785f048a
🐞 fix: 收敛 Nuxt 文档构建与运行时依赖
```

核心功能变更：

1. `.github/workflows/ci.yaml`：5120 MiB build budget + `.output` HTTP smoke；
2. `packages/ai-vue-doc/nuxt.config.ts`：删除 production source alias / blanket noExternal / blanket inline；
3. `packages/ai-vue-doc/package.json`：显式声明 Popper logical runtime alias dependency。

调查期曾有 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`，但它是临时 process wrapper，现已退役，不属于最终设计。

## 2. 根因轴 A：production graph amplification

历史配置存在：

- production source alias 直接消费 workspace src；
- blanket/wide `vite.ssr.noExternal`；
- blanket/wide `nitro.externals.inline`。

E1 删除这些 graph amplifier 后：

```text
server transformed modules
约 4028 -> 2449
约 -39%
```

默认约 4144 MiB 下 Nitro prerender 已完整完成，OOM 被定位到 final Nitro server Rollup/write。

因此旧 bundling/source-alias 配置是实测 graph amplifier。

专项规则：[`../dependency-externalization-policy.md`](../dependency-externalization-policy.md)。

## 3. 5120 MiB 是实测 headroom，不是根因

E5：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

正确表述：**5120 是当前最低已测试通过档**。

当前最终形态由 GitHub workflow build step 直接设置：

```text
NODE_OPTIONS=--max-old-space-size=5120
```

package 自身不再通过 wrapper 强制修改 `NODE_OPTIONS`。

## 4. 根因轴 B：standalone npm alias closure

5120 candidate full build 成功，但真实 HTTP runtime：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

依赖身份：

```text
@popperjs/core -> npm:@sxzz/popperjs-es
```

在 pnpm isolated/symlink 布局与 Nitro standalone tracing/copy 边界，源码 workspace 可见不等于最终产物保留逻辑 package identity。

最终修复位于实际部署 package：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

这比重新 inline Element Plus 或改变全局 linker 具有更小责任边界。

## 5. 明确拒绝的方案

| 方案 | 结果 | 结论 |
| --- | --- | --- |
| Linux `externals.trace=false` | ❌ | 不采用 |
| legacy externals | ❌ | 不采用 |
| server sourcemap off | ❌ | 不采用 |
| treeshake off | ❌ | 不采用 |
| 8/12/16 GiB 作为默认解 | 只能控制症状 | 不采用 |
| inline Element Plus | 5120 build OOM | 不采用 |
| `traceOpts.traceAlias` | build ✅ / runtime ❌ | 不采用 |
| global `nodeLinker: hoisted` | 5120 OOM | 不采用 |
| targeted public hoist | build/runtime ✅ | 仅 fallback |

## 6. CI 的长期验收升级

CI 不能停在 `nuxt build` 成功。当前流程：

1. production build；
2. 确认 `.output/server/index.mjs`；
3. 启动 server；
4. 发真实 HTTP 请求；
5. 5xx/异常时打印 server process/log、headers、bounded response body；
6. failure 时上传 diagnostics artifact。

这一步直接发现了原 candidate 的 runtime alias 缺包。

## 7. 临时 wrapper 退役

退役提交：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
🐞 fix: 退役 Nuxt 临时内存包装脚本
```

退役后 `packages/ai-vue-doc/package.json` 恢复原生：

```json
"predev": "nuxt prepare",
"prebuild": "nuxt prepare",
"build": "nuxt build",
"postinstall": "nuxt prepare"
```

并删除 `run-nuxt-with-memory.mjs`。

### GitHub exact-SHA

```text
run 32335097226
job 96323008840
result success
```

production build、`.output` startup、HTTP smoke 全部成功。

### Vercel exact-SHA

```text
deployment dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt
state READY
```

日志确认直接执行 `nuxt prepare` / `nuxt build`，wrapper 未参与。

这证明：wrapper 是调查控制工具，不是生产根修复；长期观测应留在 CI/test harness。

## 8. 历史重复验证

最终 candidate tree 通过 PR #22/#23/#24 full build + HTTP smoke。

功能 SHA `a021ce...`：

- GitHub `32118675630 / 95653890207`：success；
- Vercel `dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs`：READY、root HTTP 200。

E5-B 无 wrapper 对照 `88d17073...`：GitHub 5120 build 成功；对应 Vercel `dpl_631K2XorTLoUSX7Sg9pcUYT5HbAY` 无 previous build cache、fresh install、原生 Nuxt 命令后 READY。

## 9. 为什么最终方案比历史依赖枚举健康

```text
错误模型：
缺包/SSR 错误
→ noExternal/inline 上游库
→ 再补传递依赖
→ graph 继续扩大

最终模型：
定位 first failing gate
→ graph OOM：缩 production graph
→ runtime MODULE_NOT_FOUND：查 logical identity/artifact closure
→ 修 deployment package contract
→ 真实 artifact HTTP 验证
→ 退役临时 wrapper
```

## 10. 当前剩余技术加固

见 [`../next-steps/readme.md`](../next-steps/readme.md)，当前只保留真正尚未完成的技术问题：

- dependency resolution 可复现性；
- isolated standalone output；
- runtime route coverage；
- memory/module-count regression budget；
- bundling graph guard；
- npm alias workaround lifecycle；
- pnpm linker/hoist；
- Windows/Linux parity；
- CI/Vercel parity；
- observability/diagnostics retention；
- framework compatibility matrix。

临时 wrapper 已退役，不再作为风险卡。

## 11. 当前稳定基线

- production graph 默认最小；
- runtime alias 在 deployment package manifest 显式化；
- 5120 MiB 仅是当前 build budget；
- package scripts 使用原生 Nuxt 命令；
- CI 用真实 HTTP runtime 证明 artifact；
- PR #11 仍保持 Draft / open / 未合并。
