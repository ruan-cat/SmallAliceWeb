# Nuxt 文档构建 OOM：实验与验收计划

## 1. 研究问题

本轮不把“提高 V8 heap”当作第一反应，而按以下顺序回答：

1. 哪些项目配置实际放大 Nuxt/Vite/Nitro production graph？
2. 默认 Node 22 V8 heap 下，OOM 最终发生在哪个生命周期阶段？
3. final Nitro server Rollup 中，externals / sourcemap / tree-shaking 等单变量能否显著降低剩余峰值？
4. 若结构措施仍不足，最小、可解释且可跨 CI/Vercel 复现的 old-space headroom 是多少？

## 2. 已确认事实

- 历史默认 heap 失败为 Node/V8 exit 134，不是 runner exit 137。
- E0：8 GiB heap + Turbo `--concurrency=1` 可稳定完成 CI；同功能 SHA rerun、两个独立临时 PR 与 Vercel 均成功。
- E1：移除 ai-vue production source alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline`，恢复标准 Nuxt scripts，并取消 8 GiB heap。
- E1 默认 V8 heap limit 约 4144 MiB；server transform 从历史约 4028 modules 降至 2449（约 -39%）。
- E1 prerender 两条 Content 路由完整完成；OOM 出现在随后 final Nitro server build，exit 134。
- E1 maximum RSS `4,768,884 kB`（约 4.55 GiB）；runner 物理内存仍充足且无 swap 使用。
- E1 实际解析 Nuxt `3.21.11` / Nitro `2.13.4` / Vite `7.3.6`。
- E1 固定 SHA：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`。
- 仓库当前没有提交 `pnpm-lock.yaml`，CI 使用 `pnpm install --no-frozen-lockfile`；同 Git SHA 仍可能出现依赖解析漂移，最终重复性验收必须单独记录这一噪声。

## 3. 固定环境与控制变量

除单变量实验明确说明外：

- Node：22.x；
- pnpm：10.29.2；
- root docs build：Turbo `--concurrency=1`；
- 默认 V8 heap；
- 不关闭全文搜索、文档页面、Shiki 等用户功能换取绿色；
- 不把 `nitro.prerender.concurrency=1` 当修复（Nitro v2 默认即为 1，且 E1 prerender 已完成）；
- Windows-only `externals.trace=false` 保持 E1 行为；
- 所有 E2+ 实验从 E1 固定 SHA 独立派生，禁止变量串联；
- 实验 PR 均为 Draft，目标 `dev`，不合并。

## 4. 已执行实验矩阵

| 实验 | 唯一变量 | 结果 | 结论 |
| --- | --- | --- | --- |
| E0 | 8 GiB heap + 串行 | ✅ 稳定通过 | 成功控制组，不是根修复 |
| E1 | 缩小 source/blanket bundling graph，恢复默认 heap | ❌ final Nitro Rollup OOM | 图放大器得到强证据；剩余峰值略高于默认 heap |
| E2-A | Linux `nitro.externals.trace=false` | ❌ build failure | 单独关闭 tracing 不足 |
| E2-B | `nitro.experimental.legacyExternals=true` | ❌ build failure | 单独切 legacy externals 不足 |
| E3 | `sourcemap.server=false` | ❌ build failure | server sourcemap 单独不是根因 |
| E4 | `nitro.rollupConfig.treeshake=false` | ❌ build failure | tree-shaking 单独不是根因 |
| E5-A | CI old-space = 4608 MiB | 运行中 | 量化最低 headroom |
| E5-B | CI old-space = 5120 MiB | 运行中 | 与 4608 并行夹逼阈值 |

E2–E4 都没有把对应诊断开关回写主工作分支。

## 5. E5：最小 old-space headroom 定量

E5-A / E5-B 都只在 `.github/workflows/ci.yaml` 的“构建前内存记录”和“生产构建” step 设置 `NODE_OPTIONS`，不改变应用或 Nitro 配置：

```yaml
env:
  NODE_OPTIONS: --max-old-space-size=<threshold>
```

阈值：

- E5-A：4608 MiB，Draft PR #19，head `7a352c6a19e556531a70695dec9090983da79796`；
- E5-B：5120 MiB，Draft PR #20，head `88d17073a5937cb17c992b1940404034152ea2e0`。

两者相对 E1 均为 ahead 1 / behind 0，仅 `.github/workflows/ci.yaml` `+4/-0`。

判定：

- 4608 通过：优先以 4608 为候选，不因 5120 也通过而自动上调；
- 4608 失败、5120 通过：最低稳定阈值位于 `(4608, 5120] MiB`；
- 5120 也失败：再独立测试 6144 MiB；
- 单次绿色只证明阈值候选，不等于最终修复。

## 6. 候选落地方式

阈值确认后，不直接把 CI-only `NODE_OPTIONS` 当最终方案。应从 E1 派生候选实现：

1. 复用 E0 已验证的跨平台 `run-nuxt-with-memory.mjs` wrapper；
2. 将 wrapper 的 old-space 从 8192 降到已证实的最小阈值；
3. package-level `prepare/build/postinstall` 通过 wrapper，确保 Vercel 与本地生产构建也获得同样 headroom；
4. CI 继续明确记录实际 V8 heap limit 与 `/usr/bin/time -v`；
5. 不恢复 E1 已移除的 source alias / blanket bundling 配置。

## 7. 必须记录的指标

每次实验尽可能记录：

- commit SHA / PR / run ID / job ID；
- Node / pnpm / Nuxt / Nitro / Vite 版本；
- V8 heap limit；
- runner RAM / swap；
- client/server transformed modules；
- prerender 是否完成；
- final Nitro server build 是否开始/完成；
- exit code；
- `/usr/bin/time -v` maximum RSS；
- 成功时 `.output` sanity。

若 connector 无法返回完整 job log，必须明确标记字段“未取得可靠数据”，禁止臆造。

## 8. 最终重复性验收（E6）

最终候选必须同时满足：

1. full Nitro server build 完成；
2. `.output` 存在且可启动/可部署；
3. docs 页面、组件展示、Content/search 无已知回归；
4. 同一候选 SHA rerun 成功；
5. 两个独立 cold-runner Draft PR 成功；
6. Vercel 成功；
7. 只把有证据的最小配置回写主工作分支；
8. 最终经验写入 `.agents/skills/fix-bug/record-bug-fix-memory/`。

## 9. 停止条件

- 不继续随机枚举 Nitro/Rollup 开关制造低信号实验；E2–E4 已完成四条高信号结构诊断。
- 不恢复 8 GiB 作为默认方案，除非更低阈值全部经证据否定。
- 不通过关闭搜索/Content 等用户功能换取绿色。
- 不把单次 CI 成功写成“彻底修复”。
- 主 PR #11 始终保持 Draft，实验 PR 不合并。
