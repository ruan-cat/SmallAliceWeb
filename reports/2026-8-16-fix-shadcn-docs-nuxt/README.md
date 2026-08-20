# 2026-08-18～20 Nuxt 文档构建与 standalone runtime 稳定化调查

> 状态：**调查已完成，当前修复已通过 GitHub Actions 与 Vercel 验证。**
>
> 主 PR：#11 `fix(ci): 稳定 Nuxt 文档构建内存`，当前保持 Draft / open / 未合并。
>
> 本文件是当前调查的**权威状态入口**。各 `experiments/` 文件保留单次实验历史，不再承担“当前进度”说明职责。

## 1. 最终结论

这次故障不是一个单一的“Nuxt 需要更大内存”问题，而是两条相互独立的故障轴叠加：

1. **production graph 被历史 bundling/source-alias 配置显著放大。** 移除 production source alias、blanket `vite.ssr.noExternal` 与 blanket `nitro.externals.inline` 后，server transformed modules 从历史约 4028 降至 2449，约减少 39%。
2. **Nitro standalone output 对 pnpm npm alias 的 runtime dependency tracing/copy 不完整。** 初始 5120 MiB candidate 可以完成 full build，但真实 `.output` HTTP 请求因 `@popperjs/core` 缺失而 500；最终通过在实际部署 package 显式声明逻辑 runtime dependency 修复。

在 graph 收敛后，构建内存实测边界为：

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

因此当前准确说法是：

> **5120 MiB 是最低已测试通过档，已测稳定边界位于 `(4608, 5120] MiB`；它是必要 headroom，不应被描述成全部根因。**

## 2. 最终采用的修复

最终功能提交：

```text
a021ce96534360029e579183b8b5841b785f048a
🐞 fix: 收敛 Nuxt 文档构建与运行时依赖
```

功能变更只涉及 4 个文件：

1. `.github/workflows/ci.yaml`
2. `packages/ai-vue-doc/nuxt.config.ts`
3. `packages/ai-vue-doc/package.json`
4. `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`

核心策略：

- 删除 production source alias；
- 删除 blanket `vite.ssr.noExternal`；
- 删除 blanket `nitro.externals.inline`；
- 保留必要的兼容 aliases 与 Windows-only `nitro.externals.trace=false`；
- build/prepare wrapper 使用当前已验证的 5120 MiB old-space；
- 在 `packages/ai-vue-doc` 中显式声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

- CI 在 production build 后真实启动 `.output/server/index.mjs` 并执行 HTTP smoke。

## 3. 完整实验矩阵

| 实验 | 变量 | 结果 | 当前结论 |
| --- | --- | --- | --- |
| E0 | 8 GiB 控制组 | ✅ build 稳定 | 证明额外 heap 能控制症状，但不是根修复。 |
| E1 | 删除 source alias + blanket noExternal/inline，回到默认 heap | ❌ final Nitro OOM；server modules 约 -39% | 历史 bundling 配置是确定的 graph amplifier。 |
| E2-A | Linux `externals.trace=false` | ❌ | modern NFT trace 不是单独根因；不采用。 |
| E2-B | `legacyExternals=true` | ❌ | legacy externals 不能恢复默认 heap；不采用。 |
| E3 | `sourcemap.server=false` | ❌ | server sourcemap 不是决定性峰值来源。 |
| E4 | `treeshake=false` | ❌ | 不采用。 |
| E5 | 4608 / 5120 / 6144 MiB | ❌ / ✅ / ✅ | 5120 为最低已测试通过档。 |
| E6-A | app-local `@popperjs/core` npm alias dependency | ✅ build + runtime | **采用。** 修复实际 standalone runtime dependency boundary。 |
| E6-B | inline `element-plus` | ❌ 5120 MiB build OOM | selective large-package inline 仍会重新放大 working set。 |
| E6-C | `traceOpts.traceAlias` | ✅ build / ❌ runtime | 不能修复当前 alias output 缺包。 |
| E7-A | `nodeLinker: hoisted` | ❌ 5120 MiB build OOM | 全局扁平化爆炸半径过大。 |
| E7-B | public-hoist `@popperjs/core` | ✅ build + runtime | 证明 layout/visibility 参与故障；作为 fallback，不作为首选。 |

详细实验见 [`experiments/`](./experiments/)。E7 已补齐为独立记录。

## 4. 最终验证证据

### GitHub Actions

最终功能 SHA `a021ce96534360029e579183b8b5841b785f048a`：

- run `32118675630`：`completed / success`；
- job `95653890207`：成功；
- production build：成功；
- `.output` server startup + HTTP smoke：成功。

最终候选相同 tree 还通过：

- PR #22 candidate；
- cold PR #23；
- cold PR #24。

这三条验证都覆盖 full build + runtime smoke。

### Vercel

最终功能 SHA 对应 deployment：

```text
dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs
```

结果：

- deployment：READY；
- Preview `/`：HTTP 200；
- 查询到的近期 `error` / `fatal` runtime logs：0。

因此当前结论同时建立在 build、standalone runtime 和真实云部署上，而不是只看编译日志。

## 5. 当前配置应如何理解

### `nuxt.config.ts`

当前没有：

- production alias 到 `../ai-vue/src`；
- blanket/wide `vite.ssr.noExternal`；
- blanket/wide `nitro.externals.inline`。

这不是禁止 Nuxt/Vite 官方能力，而是禁止把它们当成“传递依赖白名单”。任何未来 narrow exception 必须由 exact error + 单变量实验支持。

专项规则：[`DEPENDENCY-EXTERNALIZATION-POLICY.md`](./DEPENDENCY-EXTERNALIZATION-POLICY.md)。

### pnpm / npm alias

`@popperjs/core -> npm:@sxzz/popperjs-es` 的 direct dependency 是当前最小生产 workaround。E7-B 已证明 targeted public hoist 也能绕过问题，但其作用域是整个 workspace，因此当前不采用。

### 5120 MiB

5120 是当前测得的 build budget，不是永久常数。未来任何 graph 增长都应同时比较 transformed modules、RSS、heap 与 duration，不能直接继续上调 heap。

## 6. 文档索引

### 当前结论

- [`final/FINAL-FIX.md`](./final/FINAL-FIX.md)：最终修复、拒绝方案、验证结果。
- [`evidence/KNOWN-EVIDENCE.md`](./evidence/KNOWN-EVIDENCE.md)：只记录可复核事实。
- [`hypotheses/ROOT-CAUSE-MODEL.md`](./hypotheses/ROOT-CAUSE-MODEL.md)：最终根因模型。
- [`TEST-PLAN.md`](./TEST-PLAN.md)：已完成实验矩阵与验收结果。

### 可复用方法

- [`DEPENDENCY-EXTERNALIZATION-POLICY.md`](./DEPENDENCY-EXTERNALIZATION-POLICY.md)：`noExternal` / `inline` 专项边界。
- [`COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md`](./COMPLEX-DEPENDENCY-TROUBLESHOOTING-METHODOLOGY.md)：复杂依赖通用排障方法论。
- `.agents/skills/fix-bug/record-bug-fix-memory/2026-08-18-nitro-pnpm-alias-tracing.md`：本次 standalone alias 事故经验。

### 后续真正技术风险

- [`next-steps/README.md`](./next-steps/README.md)：只保留尚未完成的构建/runtime/依赖技术风险。

## 7. 当前剩余边界

当前修复已经满足本轮生产构建和基础 runtime 验收，但仍有后续加固项：

- 将 `.output` 复制到 monorepo 外再做 isolated smoke；
- 扩大 runtime route/Content/search 覆盖；
- 提升 dependency resolution 可复现性；
- 建立 memory/module-count 回归预算；
- 持续验证 Windows/Linux 与 CI/Vercel 工具链差异。

这些事项不推翻当前修复，只是进一步提高可复现性和覆盖面。

## 8. 当前状态

调查阶段已经结束。后续如果出现新的 Nuxt/pnpm 依赖问题，应从最终根因模型和通用排障方法论开始，不要从已经被否定的 E2/E3/E4 或旧依赖枚举表重新试起。
