# Nuxt 文档构建 OOM：实验与验收计划

## 1. 研究问题

本轮不再把“提高 V8 heap”当作根修复。需要回答：

1. 哪些项目配置实际放大了 Nuxt/Vite/Nitro 的生产构建图？
2. 默认 Node 22 V8 heap（约 4.1 GiB）下，OOM 最终发生在哪个生命周期阶段？
3. Nitro v2 最终 server Rollup 中，现代 externals / NFT tracing 是否是剩余峰值的重要贡献者？
4. 是否存在既保持 `.output` 可部署性，又显著降低峰值内存的结构性配置？
5. 若结构性缩减后仍略高于默认 heap，最小、可解释的 heap 阈值是多少？

## 2. 已确认事实

- 历史默认 heap 失败为 Node/V8 exit 134，不是 runner exit 137。
- E0：8 GiB heap + Turbo `--concurrency=1` 可稳定完成 CI；同功能 SHA rerun、两个独立临时 PR 与 Vercel 均成功。
- E1：移除 ai-vue 源码 alias、blanket `vite.ssr.noExternal`、blanket `nitro.externals.inline`，恢复标准 Nuxt scripts，并取消 8 GiB heap。
- E1 默认 heap 为 4144 MiB；server transform 从历史约 4028 modules 降至 2449（约 -39%）。
- E1 prerender 两条 Content 路由完整完成；OOM 出现在随后 `[nitro] Building Nuxt Nitro server ...` 阶段，exit 134。
- E1 最大 RSS 为 4,768,884 kB；runner 仍有充足物理内存且无 swap 使用。
- Nitro v2 `buildProduction()` 在打印 `Building Nitro Server` 后执行 `rollup.rollup(rollupConfig)`，随后才 `build.write()`；因此剩余 OOM 已缩小到最终 Nitro Rollup build/write 路径。
- E1 固定 SHA `964911ee5c4691cc88a0ddb7672c400f3fb7ef7e` 中不存在 `components: [{ path: "../ai-vue/src" }]`。此前把该旧配置当成 E1 残留是误判，不再据此设计实验。

## 3. 固定环境/控制变量

除单变量实验明确说明外：

- Node：项目声明的 22.x；
- pnpm：项目现行版本；
- Nuxt/Nitro/Vite：lockfile 实际解析版本；
- 根 docs build：继续 `--concurrency=1`；
- 默认 V8 heap，不设置 8 GiB wrapper / `NODE_OPTIONS=8192`；
- 不关闭全文搜索、文档页面、Shiki 或其他用户功能换取绿色；
- 不把 `nitro.prerender.concurrency=1` 当修复（Nitro v2 默认即为 1）；
- Windows-only `externals.trace=false` 在候选修复中仍仅限 Windows，除非某实验明确标记为诊断；
- 所有 E2+ 分支从 E1 固定 SHA 派生，避免变量串联。

## 4. 实验矩阵

| 实验 | 单变量 | 目的 | 是否允许成为最终修复 |
| --- | --- | --- | --- |
| E0 | 8 GiB heap + 串行 | 稳定控制组 | 否，除非最终仅作为有证据的回退 |
| E1 | 缩小源码/blanket bundling 图，恢复默认 heap | 验证依赖图放大效应 | 部分；E1 本身仍 OOM |
| E2-A | Linux 也设置 `nitro.externals.trace=false` | 诊断现代 NFT tracing 对最终 Rollup 峰值的贡献 | **否**，只做因果定位 |
| E2-B | `nitro.experimental.legacyExternals=true`，保留正常 Linux tracing/打包语义 | 测试可部署的 externals 替代路径 | 是，需通过输出与部署验收 |
| E3 | 仅在 E2-B 失败后继续单变量检查最终 Rollup plugin/config | 继续缩小剩余峰值来源 | 视结果 |
| E4 | 在最小结构图上测 4608/5120/6144 等阈值 | 量化框架真实最低 heap headroom | 仅结构措施穷尽后考虑 |
| E5 | 同 SHA rerun + 两个 cold-runner PR + Vercel | 排除偶发绿色 | 必须 |

## 5. E2-A：externals trace 诊断

从 E1 SHA 派生，只把 Linux/所有平台的 Nitro `externals.trace` 临时设为 `false`。

判定：

- 若默认 heap 直接通过最终 Nitro server build，说明现代 externals/NFT tracing 是剩余峰值的重要因果因素；
- 若仍在相同位置 OOM，则 tracing 不是主要剩余来源，转向 E3；
- 即使通过，也**不得**直接回写主 PR 作为最终修复，因为 node-server 输出可能依赖被跳过的 tracing/copy 行为。

## 6. E2-B：legacy externals 结构候选

从 E1 SHA 独立派生，只开启 Nitro v2 `experimental.legacyExternals=true`，保持 Linux 正常 tracing/外部依赖打包语义。

若通过，需要额外验证：

- `.output/server` 生成完整；
- `.output/server/package.json` / node_modules 或对应依赖复制结果合理；
- 使用产物启动时没有 module resolution failure；
- docs 搜索/API/页面行为没有明显回归；
- Vercel 构建部署成功。

## 7. 必须记录的指标

每次 GitHub Actions 实验记录：

- commit SHA / PR / run ID / job ID；
- Node / pnpm / Nuxt / Nitro / Vite 版本；
- V8 heap limit；
- runner `MemTotal` / `MemAvailable` / swap；
- client modules transformed + duration；
- server modules transformed + duration；
- prerender 是否初始化、是否完成；
- prerender route 数量与耗时；
- final Nitro server build 是否开始、是否完成；
- exit code；
- `/usr/bin/time -v` maximum resident set size；
- 成功时的 `.output` sanity 结果。

## 8. 失败分类

- exit 134：Node/V8 heap limit abort；
- exit 137：kernel/cgroup kill，转查 RSS/runner 总内存；
- module-resolution：externalization/packaging 兼容问题；
- runtime/output packaging：构建绿色但产物不可运行，视为失败；
- timeout：单独记录，不与 OOM 混淆。

## 9. 最终成功标准

必须同时满足：

1. 不盲目依赖 8 GiB；
2. 结构性图放大器已经识别并移除/最小化；
3. full Nitro server build 完成；
4. `.output` 可运行/可部署；
5. 同一 SHA rerun 成功；
6. 两个独立 cold-runner 临时 PR 成功；
7. Vercel 成功；
8. 文档页面、组件展示、全文搜索等功能无已知回归。

## 10. 停止条件与主 PR 采纳规则

- 诊断性绿色不等于最终修复；E2-A 只用于归因。
- 任何候选在没有 output sanity + repeatability 前不得写成“已彻底修复”。
- 实验 PR 不合并；通过后只把最小必要变更回写主工作分支。
- 主 PR #11 保持 Draft，不自动合并。
- 若所有结构措施穷尽后仍只比默认 heap 高少量，再用 E4 数据决定是否接受小幅、固定且有证据的 heap headroom。