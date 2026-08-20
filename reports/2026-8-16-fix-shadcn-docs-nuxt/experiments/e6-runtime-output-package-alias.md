# E6：Nitro output runtime package alias 缺失

## 前置状态

E5 已确认：

- 4608 MiB：production build 失败；
- 5120 MiB：production build 成功；
- 6144 MiB：production build 成功；
- 当前最低已验证 old-space 档位为 5120 MiB。

初始候选 SHA `006c45a7d725595a833e72df8b516ab5122391a5` 在 PR #22 / #23 / #24 三个独立 Actions 上均完成 full production build，但新增的 `.output` runtime smoke 均失败。

为取得可靠证据，候选分支追加了仅修改 CI 诊断 harness 的 commit：

`c3b2ef6c84bc05d4ac2ba322fb5567f4ef7a5331`

诊断 run：`32112624222` / job `95635175348`。

该 run 再次证明 5120 MiB full build 成功，随后 runtime smoke 失败，failure artifact `nuxt-runtime-smoke-diagnostics` 上传成功。

## 直接 runtime 证据

下载 artifact 后得到 server log：

```text
Listening on http://127.0.0.1:3010
[request error] [unhandled] [GET] http://127.0.0.1:3010/
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@popperjs/core'
imported from .../.output/server/node_modules/element-plus/es/hooks/use-popper/index.mjs
```

HTTP 证据：

```text
HTTP/1.1 500 Server Error
```

因此此前 smoke failure 不是：

- `.output/server/index.mjs` 启动入口错误；
- `PORT` / `HOST` 设置错误；
- server process 无法监听；
- `/` route 不存在。

而是**Nitro output 中 externalized Element Plus 缺少它通过 npm alias 声明的 Popper runtime package**。

## 上游依赖事实

Element Plus 2.13.5 的 package metadata 声明：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

Nitro 官方 issue #1574 还明确记录：pnpm package alias 会使 externals tracing 难以识别；该 issue 的示例恰好使用 `@sxzz/popperjs-es` 与 `@popperjs/core`。

Nitro 2.13.4 当前配置类型/文档确认 alias tracing 选项位于 `traceOpts.traceAlias`。

## E6-A：显式补齐 runtime alias dependency

唯一变量：在 `packages/ai-vue-doc/package.json` 增加：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

执行：

- PR：#25 Draft
- Commit：`db569470b350d247c8e949f4fcb434984f183600`
- Run / Job：`32113486816` / `95637799944`
- 相对诊断基线：仅 `package.json` `+1/-0`

结果：

- install：✅
- 5120 MiB full production build：✅
- `.output/server/index.mjs` 启动：✅
- HTTP runtime smoke：✅
- failure artifact：skipped（无失败）

**E6-A 完整绿色。**

## E6-B：只 inline `element-plus`

唯一变量：

```ts
nitro: {
  externals: {
    inline: ["element-plus"],
    ...(process.platform === "win32" ? { trace: false } : {}),
  },
}
```

没有恢复历史 blanket `inline: [/.*/]`。

执行：

- PR：#26 Draft
- Commit：`d16b0f330f1267226dc74404ff31bcb82a6c418b`
- Run / Job：`32113506043` / `95637854322`

结果：

- install：✅
- 5120 MiB production build：❌
- runtime smoke：skipped

结论：即使只选择性 inline Element Plus，也重新放大 build working set 到 5120 MiB 无法稳定完成；**不得把该方案回写最终候选。**

## E6-C：Nitro `traceOpts.traceAlias`

根据 Nitro issue #1574 与 Nitro 2.13.4 当前配置接口，唯一变量：

```ts
nitro: {
  traceOpts: {
    traceAlias: {
      "@sxzz/popperjs-es": "@popperjs/core",
    },
  },
  // E1 Windows-only externals.trace=false 保持不变
}
```

执行：

- PR：#27 Draft
- Commit：`dbd6b874f4e6be193ceec0e57c0fee6173471abf`
- Run / Job：`32113783387` / `95638688903`

结果：

- install：✅
- 5120 MiB full production build：✅
- runtime smoke：❌
- failure artifact：✅

artifact 中错误与原始候选完全相同：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@popperjs/core'
```

因此在本项目当前 Nuxt 3.21.11 / Nitro 2.13.4 / pnpm 10.29.2 / nf3 组合中，该 `traceAlias` 配置**未能修复实际 output copy**。

## 选型结论

三条单变量比较：

| 方案 | 5120 build | runtime smoke | 结论 |
| --- | --- | --- | --- |
| E6-A 显式 runtime alias dependency | ✅ | ✅ | **当前最小可用方案** |
| E6-B inline `element-plus` | ❌ | — | 重新放大 bundling，排除 |
| E6-C `traceOpts.traceAlias` | ✅ | ❌ | 当前版本组合下无效 |

因此最终候选采用 E6-A，不带入 E6-B / E6-C。

## 回写候选

候选 PR #22 已在诊断基线 `c3b2ef6...` 上只增加 E6-A 的 `package.json +1`：

- Candidate commit：`7642c1dcac756c145cf85c8b13fb770b0d158bcc`
- E6-A green commit：`db569470b350d247c8e949f4fcb434984f183600`
- 两个 commit 的 Git tree SHA 均为：`6e11034f33d90f67a1a4fd5f4655a76780a0f94c`

因此 #25 已经为候选**完全相同代码树**提供一份 full-build + runtime-smoke 绿色证据。

#23 / #24 cold-runner 分支已 fast-forward 到候选 commit `7642c1d...`，继续进行同 SHA 独立验证。

## 当前最终候选组成

保持 E1 结构缩减，并增加：

1. 5120 MiB 跨平台 Nuxt memory wrapper；
2. `@popperjs/core` → `npm:@sxzz/popperjs-es@^2.11.7` 显式 runtime dependency；
3. CI full build 的 heap/RSS 观测；
4. `.output/server/index.mjs` HTTP runtime smoke；
5. failure-only runtime diagnostics artifact。

仍需完成候选自身、两个 cold-runner 同 SHA、Vercel 与最终回写验证后，才能宣布最终修复完成。
