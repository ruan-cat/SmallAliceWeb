# KNOWN EVIDENCE：Nuxt 文档构建与 standalone runtime

> 更新：2026-08-20
>
> 本文件只记录已经由仓库 diff、GitHub Actions、runtime smoke 或 Vercel 直接支持的事实。推断和设计判断放在 `ROOT-CAUSE-MODEL.md`。

## 1. 初始 OOM 事实

- 历史默认 Node/V8 old-space 约 4 GiB 时存在稳定 OOM，典型退出码为 134；
- 8 GiB 控制组在 CI/cold runner/Vercel 可以完成，因此“额外 heap 能控制症状”已被证明；
- 8 GiB 从一开始就没有被视为根因修复。

## 2. E1：production graph 收敛

E1 功能 SHA：

```text
964911ee5c4691cc88a0ddb7672c400f3fb7ef7e
```

E1 移除：

- ai-vue production source alias；
- blanket `vite.ssr.noExternal`；
- blanket `nitro.externals.inline`；
- 8 GiB wrapper/CI heap override。

保留 Node 22、Turbo `--concurrency=1`、必要 compatibility aliases 与 Windows-only `trace:false`。

GitHub Actions 直接观察到：

- V8 heap limit：约 4144 MiB；
- client transformed modules：5409；
- server transformed modules：2449；
- 历史默认-heap 失败的 server modules 约 4028；
- server graph 约减少 39%；
- Nitro prerender 完整成功，2 routes，约 44.5s；
- `.output/public` 已生成；
- 随后进入 `[nitro] Building Nuxt Nitro server ...`；
- final server build 触发 `Reached heap limit`，exit 134；
- max RSS `4,768,884 kB`（约 4.55 GiB）；
- runner 仍有物理内存，未出现主机 RAM 耗尽证据。

因此以下两条是已证实事实：

1. 历史 source alias + blanket bundling 是 production graph 放大器；
2. graph 收敛后，默认约 4144 MiB 仍不足以完成 final Nitro server build。

## 3. E2～E4：结构性开关失败

以下单变量实验均未恢复默认 heap 绿色：

| 实验 | 变量 | PR | 结果 |
| --- | --- | --- | --- |
| E2-A | Linux `nitro.externals.trace=false` | #15 | ❌ |
| E2-B | `nitro.experimental.legacyExternals=true` | #16 | ❌ |
| E3 | `sourcemap.server=false` | #17 | ❌ |
| E4 | Rollup `treeshake=false` | #18 | ❌ |

事实边界：这些开关单独不足以解决剩余 final server build 峰值，因此没有被回写成最终修复。

## 4. E5：heap threshold

E5 结果：

```text
4608 MiB -> FAIL   (PR #19)
5120 MiB -> PASS   (PR #20)
6144 MiB -> PASS   (PR #21)
```

因此：

- 当前最低已测试通过档：5120 MiB；
- 已测试阈值夹在 `(4608, 5120] MiB`；
- 现有证据不支持声称 5120 是精确数学最小值。

## 5. 初始 5120 candidate：build 成功但 runtime 失败

初始 candidate commit：

```text
006c45a7d...
```

后续 diagnostic harness commit：

```text
c3b2ef6c84bc05d4ac2ba322fb5567f4ef7a5331
```

Diagnostic run：

```text
run 32112624222
job 95635175348
```

Server 可以正常监听：

```text
Listening on http://127.0.0.1:3010
```

但 HTTP `/` 返回 500，首个可信 runtime error：

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@popperjs/core'
imported from .../.output/server/node_modules/element-plus/es/hooks/use-popper/index.mjs
```

因此：

- entrypoint 正确；
- HOST/PORT 正确；
- server startup 正确；
- failure gate 是 HTTP runtime dependency resolution；
- build success 与 standalone runtime success 不是同一验收门。

## 6. npm alias 依赖身份

Element Plus 对应依赖关系：

```text
logical package: @popperjs/core
npm alias target: @sxzz/popperjs-es
```

Nitro upstream issue #1574 记录了 pnpm symlink + npm alias tracing 问题，并涉及同一组 `@popperjs/core` / `@sxzz/popperjs-es` 身份关系。

本仓库事实只支持：standalone output 没有以运行时所需逻辑名称完整携带该 dependency；不能简化成“pnpm 完全不 hoist”。

## 7. E6：runtime 修复对照

### E6-A：direct runtime dependency

PR #25，commit：

```text
db569470b350d247c8e949f4fcb434984f183600
```

增加：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

结果：

- install ✅
- 5120 MiB full production build ✅
- `.output` HTTP runtime smoke ✅

### E6-B：inline Element Plus

PR #26：

```ts
nitro.externals.inline = ["element-plus"]
```

结果：5120 MiB production build ❌，runtime smoke 未进入。

因此 selective inline 大型 UI package 也会产生足以跨过当前内存边界的 graph/working-set 回归。

### E6-C：traceAlias

PR #27：build ✅，runtime 仍然报相同 `@popperjs/core ERR_MODULE_NOT_FOUND` ❌。

因此当前组合下 `traceAlias` 不能替代 direct runtime dependency。

## 8. 最终 candidate 重复验证

Candidate 最终 SHA：

```text
7642c1dcac756c145cf85c8b13fb770b0d158bcc
```

对应 tree 与 E6-A 一致。

验证：

| 路径 | Run / Job | build | runtime smoke |
| --- | --- | --- | --- |
| PR #22 candidate | `32114472339` / `95640781374` | ✅ | ✅ |
| cold PR #23 | `32114560960` / `95641049823` | ✅ | ✅ |
| cold PR #24 | `32114577744` / `95641098385` | ✅ | ✅ |

Candidate Vercel deployment：

```text
dpl_HAcxeBZr7CZMnTU4z6NUE9J6zXdU
```

已观察：READY、root HTTP 200、查询到的近期 error/fatal logs 为 0。

## 9. E7：pnpm topology 实验

### E7-A：global hoisted linker

PR #28：

```yaml
nodeLinker: hoisted
```

head：

```text
ed7ce2812325269e0976eb07a8f6762b22486886
```

GitHub Actions：

```text
run 32117268637 -> failure
job 95649504369 -> production build failure
```

日志确认：

- `Reached heap limit`；
- max RSS `5,646,292 kB`；
- runtime smoke 未进入。

因此 global hoisted linker 会改变 working set，并使当前 5120 MiB build budget 重新失效。

### E7-B：targeted public hoist

PR #29：

```yaml
publicHoistPattern:
  - "@popperjs/core"
```

head：

```text
39c6fef7142eb0fcd07a54faf439d17714bb1626
```

run `32117424893`：success；已验证 5120 MiB build + runtime smoke 成功。

因此 pnpm visibility/layout 确实参与 alias runtime 问题，但 targeted public hoist 只是一个较大作用域 fallback，不是最终首选。

## 10. 主工作分支最终功能验证

最终功能 commit：

```text
a021ce96534360029e579183b8b5841b785f048a
```

GitHub Actions：

```text
run 32118675630
job 95653890207
conclusion success
```

已验证：production build ✅，`.output` HTTP smoke ✅。

Vercel：

```text
deployment dpl_4CwrYxzyzRAs5zFebEFkbHUsagTs
```

已观察：

- READY；
- root HTTP 200；
- 查询到的近期 error/fatal logs：0。

## 11. 当前配置事实

`packages/ai-vue-doc/nuxt.config.ts` 当前：

- 没有旧 production source alias；
- 没有 blanket `vite.ssr.noExternal`；
- 没有 blanket `nitro.externals.inline`；
- 保留 compatibility aliases；
- 只在 Windows 条件下设置 `nitro.externals.trace=false`。

`packages/ai-vue-doc/package.json` 当前：

- build/prepare 通过 memory wrapper；
- 直接声明 `@popperjs/core` npm alias dependency。

CI 当前：

- Node 22.x；
- pnpm 10.29.2；
- install 使用 `pnpm install --no-frozen-lockfile`；
- production build 使用 5120 MiB；
- build 后启动 `.output` 并发送 HTTP 请求。

## 12. 尚未闭合但不推翻当前修复的事实边界

- 当前 CI smoke 仍在 monorepo 内启动 `.output`；尚未验证复制到仓库外后的完全隔离运行；
- runtime smoke 主要覆盖根路由；代表性 docs / Content / search route matrix 尚未建立；
- 仓库当前没有提交 `pnpm-lock.yaml`，同 Git SHA 仍不能保证 dependency resolution 完全一致。

这些边界已经进入 `next-steps/`，不应被写成“当前修复尚未完成”。
