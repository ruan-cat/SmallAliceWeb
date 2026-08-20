# E5：最小 Node/V8 old-space headroom 定量

## 基线

固定 E1 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。

E1 已完成 production graph 缩减，并把默认 heap 下的死亡点定位到 prerender 完成后的 final Nitro server build/write。E2–E4 的四条独立结构开关均不足以让默认 heap 恢复绿色，因此 E5 不再修改 Nuxt/Nitro bundling 行为，只量化 old-space 最小稳定档位。

## 控制变量

三档实验都从 E1 固定 SHA 独立派生：

- 不叠加 E2/E3/E4；
- 不恢复 8 GiB wrapper；
- 仅在 GitHub Actions 的“记录构建前内存”和“生产构建”步骤设置 `NODE_OPTIONS=--max-old-space-size=<threshold>`；
- 相对 E1 均为 ahead 1 / behind 0，仅 `.github/workflows/ci.yaml` `+4/-0`。

## 结果

| 实验 | old-space | PR | Commit | Run / Job | 生产构建 |
| --- | ---: | --- | --- | --- | --- |
| E5-A | 4608 MiB | #19 | `7a352c6a19e556531a70695dec9090983da79796` | `32110065241` / `95627350757` | ❌ failure |
| E5-B | 5120 MiB | #20 | `88d17073a5937cb17c992b1940404034152ea2e0` | `32110185098` / `95627705862` | ✅ success |
| E5-C | 6144 MiB | #21 | `4d8fa5d415fcda1c2edb6139eb95394a41bd93e0` | `32110538401` / `95628774801` | ✅ success |

因此当前实测结论是：

```text
4608 MiB  <  最小稳定需求  <=  5120 MiB
```

5120 MiB 是当前**最低已验证成功档位**。6144 MiB 虽成功，但没有理由优先于更低且已通过的 5120 MiB；8192 MiB 继续只保留为历史 E0 稳定控制组，不作为默认候选值。

## 候选实现

候选 Draft PR #22 从 E1 固定基线派生，初始候选 SHA：

`006c45a7d725595a833e72df8b516ab5122391a5`

候选保持 E1 已验证有效的 production graph 缩减，并：

1. 恢复跨平台 `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs`；
2. 将 old-space 从 E0 的 8192 降为 5120 MiB；
3. `predev` / `prebuild` / `build` / `postinstall` 统一通过 wrapper，覆盖 package-level Nuxt prepare/build；
4. CI 显式记录 5120 MiB heap，并用 `/usr/bin/time -v` 执行 full build；
5. full build 后独立启动 `.output/server/index.mjs` 做 HTTP runtime smoke。

## 候选构建重复性

初始候选 SHA `006c45a...` 已在三个独立 PR / Actions 上得到同样结果：

| PR | Run / Job | full production build | runtime smoke |
| --- | --- | --- | --- |
| #22 candidate | `32110830747` / `95629684666` | ✅ success | ❌ failure |
| #23 cold-runner 1 | `32111169924` / `95630728896` | ✅ success | ❌ failure |
| #24 cold-runner 2 | `32111182661` / `95630763661` | ✅ success | ❌ failure |

这三次独立结果强烈支持：**E1 graph 缩减 + 5120 MiB 已经稳定解决构建期 OOM。**

但不能据此宣布最终修复完成，因为三次都在新增的 `.output` runtime smoke 上确定性失败。

## runtime smoke 当前证据边界

已通过 Nitro `2.13.4` 官方文档/源码确认：

- `.output/server/index.mjs` 是 node-server preset 的正确启动入口；
- `PORT` / `HOST` 是正式支持的环境变量别名；
- 当前站点存在 `content/index.md`，而 catch-all 页面按 `route.path` 查询 content，因此 `/` 是合理的 smoke route。

所以当前不能把 smoke failure 简单归因于“启动命令写错”或“根路由不存在”。

由于 GitHub connector 对这些 completed jobs 没有稳定返回可解析的完整日志，不能臆造 server error。候选分支已追加一个**仅修改 CI 诊断 harness** 的提交 `c3b2ef6c84bc05d4ac2ba322fb5567f4ef7a5331`：

- 打印 server process / exit status；
- 打印 HTTP status、headers 和 response body 前 120 行；
- 打印 server log；
- failure 时上传 `nuxt-runtime-smoke-diagnostics` artifact；
- 不改变 5120 wrapper、Nuxt/Nitro 配置或 production dependency graph。

该诊断 run：`32112624222`，执行中。

## 后续判定

1. 如果诊断证明只是 smoke harness 假设错误：修正 harness，保持应用候选不变；
2. 如果 server process 立即退出或 `/` 返回 5xx：根据确切错误做最小 runtime dependency/output 修复；
3. runtime smoke 绿色后，把两个 cold-runner 分支 fast-forward 到同一最终候选 SHA，再做独立复验；
4. 同一候选 SHA rerun、Vercel、docs/search 验收全部通过后，才回写主 PR #11。

## 结论

E5 已把“8 GiB 才能构建”的粗粒度假设收敛为：

- 结构性 graph 缩减是重要修复；
- 默认约 4.1 GiB old-space 与 4608 MiB 都不足；
- 5120 MiB 与 6144 MiB 均成功；
- 当前最低已验证稳定档位为 5120 MiB；
- 构建期 OOM 已有三次独立 5120 MiB 成功证据；
- 最终阻塞项已从 OOM 转为 `.output` runtime smoke 的确定性失败诊断。
