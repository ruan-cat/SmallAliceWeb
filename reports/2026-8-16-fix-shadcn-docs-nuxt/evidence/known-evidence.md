# 已知证据：Nuxt 文档构建与 standalone runtime

> 更新：2026-08-20
>
> 本文件只记录由仓库 diff、GitHub Actions、runtime smoke 或 Vercel 直接支持的事实；推断放在 [`../hypotheses/root-cause-model.md`](../hypotheses/root-cause-model.md)。

## 1. 初始 OOM

- 默认约 4 GiB old-space 时存在稳定 OOM，典型 exit 134；
- 8 GiB 控制组可完成，因此额外 heap 能控制症状；
- 8 GiB 从未证明是根因或合理永久值。

## 2. E1：production graph 收敛

E1 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。

移除：

- ai-vue production source alias；
- blanket `vite.ssr.noExternal`；
- blanket `nitro.externals.inline`；
- 8 GiB wrapper/CI override。

观察：

- V8 heap limit 约 4144 MiB；
- client modules 5409；
- server modules 2449；历史失败约 4028；
- server graph 约 -39%；
- Nitro prerender 完成；
- final server build `Reached heap limit`，exit 134；
- max RSS `4,768,884 kB`（约 4.55 GiB）。

事实：历史 source alias + blanket bundling 是 graph amplifier；graph 收敛后默认 heap 仍不足 final Nitro build。

## 3. E2～E4

以下单变量都未恢复默认 heap：

| 实验 | 变量 | 结果 |
| --- | --- | --- |
| E2-A | Linux `nitro.externals.trace=false` | ❌ |
| E2-B | `legacyExternals=true` | ❌ |
| E3 | `sourcemap.server=false` | ❌ |
| E4 | `treeshake=false` | ❌ |

## 4. E5 heap threshold

```text
4608 MiB -> FAIL
5120 MiB -> PASS
6144 MiB -> PASS
```

当前最低已测试通过档为 5120 MiB；现有证据不支持称其为精确数学最小值。

E5-B (`88d17073a5937cb17c992b1940404034152ea2e0`) 的 package scripts 是原生 `nuxt prepare` / `nuxt build`，GitHub 只在 workflow build step 提供 5120 MiB，production build 仍成功。

对应 Vercel `dpl_631K2XorTLoUSX7Sg9pcUYT5HbAY`：READY；日志写明 `Previous build caches not available`，fresh install 后执行原生 `nuxt prepare`，最终 build/deploy 完成。

## 5. 初始 5120 candidate：build 成功、runtime 失败

诊断 commit：`c3b2ef6c84bc05d4ac2ba322fb5567f4ef7a5331`。

Run/job：`32112624222 / 95635175348`。

Server 已监听，但 HTTP `/` 返回 500：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@popperjs/core'
imported from .../.output/server/node_modules/element-plus/...
```

事实：entrypoint、HOST/PORT、server startup 正确；第一个失败门是 HTTP runtime dependency resolution。

## 6. npm alias identity

```text
logical package: @popperjs/core
real package:    @sxzz/popperjs-es
relationship:    npm alias
```

Nitro upstream #1574 记录 pnpm symlink + npm alias tracing 边界，并涉及同一对 logical/real package。

本仓库证据只支持 standalone output 未稳定保留运行时所需 logical identity，不能简化成“pnpm 完全不 hoist”。

## 7. E6 对照

### E6-A direct runtime alias dependency

PR #25 / commit `db569470b350d247c8e949f4fcb434984f183600`：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

结果：install ✅ / 5120 build ✅ / HTTP runtime ✅。

### E6-B inline Element Plus

`nitro.externals.inline = ["element-plus"]`：5120 build ❌。

### E6-C traceAlias

build ✅ / runtime 仍缺 `@popperjs/core` ❌。

## 8. Candidate 重复验证

最终 candidate SHA：`7642c1dcac756c145cf85c8b13fb770b0d158bcc`。

| 路径 | Run / Job | build | runtime |
| --- | --- | --- | --- |
| PR #22 | `32114472339 / 95640781374` | ✅ | ✅ |
| PR #23 | `32114560960 / 95641049823` | ✅ | ✅ |
| PR #24 | `32114577744 / 95641098385` | ✅ | ✅ |

Vercel `dpl_HAcxeBZr7CZMnTU4z6NUE9J6zXdU`：READY，root HTTP 200。

## 9. E7 pnpm topology

E7-A global `nodeLinker: hoisted`：

- run `32117268637` failure；
- V8 OOM；
- max RSS `5,646,292 kB`。

E7-B targeted `publicHoistPattern: ["@popperjs/core"]`：run `32117424893` success，5120 build + runtime smoke success。

事实：layout/visibility 参与 alias 问题，但 global topology change 会显著回归 working set。

## 10. 主功能修复

功能 commit：`a021ce96534360029e579183b8b5841b785f048a`。

GitHub：`32118675630 / 95653890207` success，production build ✅，`.output` HTTP smoke ✅。

Vercel：`dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs` READY，root HTTP 200。

## 11. 临时 memory wrapper 已退役

退役 commit：

```text
ba810875c7680a3a0631a0b5e1880259aba67fac
```

变化：

- 删除 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`；
- package scripts 恢复原生 `nuxt prepare` / `nuxt build`；
- 保留 Popper alias dependency；
- GitHub workflow build step 继续直接设置 5120 MiB。

Exact-SHA GitHub：

```text
run 32335097226
job 96323008840
result success
```

已通过 production build + `.output` startup + HTTP smoke。

Exact-SHA Vercel：

```text
deployment dpl_CbwmamLrnhCXjAKU1dVh7zb5NoXt
state READY
```

Vercel build log 明确显示 package postinstall 直接 `nuxt prepare`，package build 直接 `nuxt build`。因此 wrapper 不再是当前运行链的一部分。

## 12. 当前配置事实

`nuxt.config.ts`：

- 无 production source alias；
- 无 blanket `vite.ssr.noExternal`；
- 无 blanket `nitro.externals.inline`；
- Windows-only `nitro.externals.trace=false` 仍保留。

`packages/ai-vue-doc/package.json`：

- 原生 Nuxt scripts；
- 直接声明 `@popperjs/core` npm alias dependency。

CI：

- Node 22.x；
- pnpm 10.29.2；
- install `--no-frozen-lockfile`；
- production build 5120 MiB；
- build 后实际启动 `.output` 并发 HTTP 请求。

## 13. 尚未闭合但不推翻当前修复

- `.output` 尚未在 monorepo 外做完全 isolated smoke；
- runtime route matrix 仍有限；
- 仓库没有正式提交 lockfile，同 SHA 不严格等于同依赖快照；
- memory/module-count 尚未形成持续预算门禁。

后续技术风险见 [`../next-steps/readme.md`](../next-steps/readme.md)。
