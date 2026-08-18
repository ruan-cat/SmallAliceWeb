# 2026-08-18 Nuxt 文档构建 OOM：结构性修复调查

## 目标

修复 `@ruan-cat-drill-doc/ai-vue-doc` 在 GitHub Actions、Vercel 与本地环境中的 Node/V8 heap OOM，同时避免把长期方案简化成不断提高 `--max-old-space-size`。

当前要求是：**先缩小生产依赖图并定位 final Nitro server build 的真实峰值来源，再决定是否仍需要最小、可解释的 heap headroom。**

## 文档索引

- [`TEST-PLAN.md`](./TEST-PLAN.md)：实验矩阵、控制变量、指标、停止条件和最终验收门槛。
- [`evidence/KNOWN-EVIDENCE.md`](./evidence/KNOWN-EVIDENCE.md)：只记录 CI/仓库/上游源码直接支持的事实。
- [`hypotheses/ROOT-CAUSE-MODEL.md`](./hypotheses/ROOT-CAUSE-MODEL.md)：当前根因模型、待验证假设和误判纠偏。
- [`experiments/E0-8G-control.md`](./experiments/E0-8G-control.md)：8 GiB 稳定控制组。
- [`experiments/E1-default-heap-minimal-bundle.md`](./experiments/E1-default-heap-minimal-bundle.md)：默认 heap 下缩小 production bundling graph 的结果。
- [`experiments/E2-final-nitro-rollup-externals.md`](./experiments/E2-final-nitro-rollup-externals.md)：final Nitro Rollup / externals 单变量实验及失败结论。
- E3：server sourcemap 单变量实验，Draft PR #17，当前执行中。
- [`final/FINAL-FIX.md`](./final/FINAL-FIX.md)：最终修复与重复性验收；当前明确标记为“未完成”。

## 当前阶段结论

### E0：8 GiB 是稳定控制组，不是根修复

已确认：

- 主 PR #11 首次 CI 成功；
- 同功能 SHA rerun 成功；
- 独立临时 PR #12、#13 成功；
- Vercel 同功能 SHA 成功。

功能基线 SHA：`9864aaea67394e2db1e917b1ee0ea86c6ddfd0e1`。

这证明提高 V8 old-space 可以稳定控制症状，但不能证明 production graph 健康，也不能证明 8 GiB 是真实最低需求。

### E1：生产依赖图放大器被证实，但还不是全部根因

E1 Draft PR #14：

- 分支：`2026-8-18-nuxt-default-heap-bundle-min`
- head：`964911ee5c4691cc88a0ddb7672c400f3fb7ef7e`
- run：`32081792392`
- job：`95546058440`

E1 在默认 V8 heap `4144 MiB` 下：

- 移除 ai-vue production source alias；
- 移除 blanket `vite.ssr.noExternal`；
- 移除 blanket `nitro.externals.inline`；
- 恢复标准 `nuxt prepare` / `nuxt build`；
- 移除 8 GiB wrapper/CI heap override；
- 保留 Node 22、Turbo `--concurrency=1`、内部兼容 aliases 和 Windows-only `trace:false`。

结果：

- client：5409 modules；
- server：2449 modules；历史默认-heap 失败约 4028 modules，下降约 **39%**；
- Nitro prerender 两条 Content route **完整成功**，44.534s；
- `.output/public` 已生成；
- 随后进入 `[nitro] Building Nuxt Nitro server ...`；
- 最终在约 4.1 GiB heap ceiling 触发 `Reached heap limit`，exit 134；
- maximum RSS `4,768,884 kB`（约 4.55 GiB）。

因此不能再把“prerender 本身”写成 E1 的死亡点。更精确的定位是：**final Nitro server Rollup build/write path**。

### E2：externals 两条简单路径均不足以根治

两个实验都从固定 E1 SHA `964911ee5c4691cc88a0ddb7672c400f3fb7ef7e` 独立派生、使用默认 heap、保持 Draft 且不合并：

| 实验 | 唯一变量 | PR | Run / Job | 结论 |
| --- | --- | --- | --- | --- |
| E2-A | Linux `nitro.externals.trace=false` | #15 | `32106327534` / `95616407587` | ❌ `Run documentation build` failure |
| E2-B | `nitro.experimental.legacyExternals=true` | #16 | `32106392146` / `95616598844` | ❌ `Run documentation build` failure |

GitHub Actions step 证据能够稳定确认：checkout、Node/pnpm setup、依赖安装成功，主体 documentation build 失败。当前 connector 没有返回可可靠解析的完整 job log，因此**不把具体 OOM 行号、max RSS、模块数写成已证实的 E2 指标**。

现有证据只支持：

- 单独关闭 modern externals tracing 不足以恢复默认 heap 绿色；
- 单独切换 legacy externals 实现也不足以恢复默认 heap 绿色；
- 不应继续把 E2-A/B 叠加到后续实验中。

### E3：关闭 server sourcemap，诊断 final write 峰值

E3 从固定 E1 SHA 独立派生，唯一有效变量：

```ts
sourcemap: {
  server: false,
}
```

执行信息：

- Branch：`2026-8-18-nuxt-e3-server-sourcemap-off`
- Commit：`7bd1594063134655ae101b651c90a4786cb72f0e`
- Draft PR：#17
- Run：`32108987079`
- Job：`95624184590`
- 当前状态：依赖安装与构建前内存记录均成功，`生产构建` 正在执行。

E1 → E3 compare 已验证：ahead `1`、behind `0`，只有 `packages/ai-vue-doc/nuxt.config.ts` 一个文件，`+4/-0`，未夹带 E2-A/B 或主工作分支中的其他实验配置。

## 上游定位与 E3 理由

E1 已把问题定位到 prerender 之后的 final Nitro server Rollup/write。Nuxt 3 默认生成 server sourcemap，而 Nuxt 官方也明确指出 sourcemap 有生成成本，不使用时可关闭。因此 E3 选择 `sourcemap.server=false` 作为与最终 server write 阶段直接相关、且不会同时改 externals/依赖图的单变量诊断。

如果 E3 失败，则继续从固定 E1 SHA 派生新的单变量，不在 E3 上叠加；如果 E3 绿色，则先进行 `.output` / runtime、同 SHA 重跑、cold-runner PR 与 Vercel 验收，仍不直接回写主分支。

## 已纠正的误判

早期上下文摘要曾声称 E1 仍存在：

```ts
components: [{ path: "../ai-vue/src" }]
```

重新直接读取 E1 固定 SHA 的 `packages/ai-vue-doc/nuxt.config.ts` 后确认：**不存在该项。**

因此不会创建一个“删除 components source scan”的无效实验。

## 可复现性噪声：当前无 pnpm lockfile

仓库当前没有提交 `pnpm-lock.yaml`，CI 使用：

```sh
pnpm install --no-frozen-lockfile
```

同时 `packages/ai-vue-doc/package.json` 中包含例如 `nuxt: "^3.21.2"` 等 range dependency。故“同 Git SHA”并不自动等价于“完全相同的依赖解析快照”。

该项**暂不混入 E3**，否则会破坏单变量实验；但最终重复性验收必须把依赖解析漂移作为独立噪声源处理或记录。

## 禁止的“假修复”

当前证据不支持直接采用：

- 把 heap 从 8 GiB 继续加到 12/16 GiB；
- `nitro.prerender.concurrency=1`；
- Linux/Vercel 永久全局 `trace=false`；
- 为了 CI 绿色直接关闭 docs search / Nuxt Content 功能；
- 强行跨大版本覆盖到 Nitro 3；
- 把单次偶发绿色写成“彻底修复”。

## 最终验收

最终候选必须：

1. 完成 full Nitro server build；
2. `.output` 可运行/可部署；
3. docs 页面、组件与 search 无已知回归；
4. 同 SHA rerun 成功；
5. 两个独立 cold-runner PR 成功；
6. Vercel 成功；
7. 最小必要配置回写主工作分支；
8. 最终经验写入 `.agents/skills/fix-bug/record-bug-fix-memory/`。

## PR / 分支纪律

- 主 PR：#11 `fix(ci): 稳定 Nuxt 文档构建内存`
- 主工作分支：`2026-8-16-fix-shadcn-docs-nuxt`
- 主 PR 保持 Draft；**不合并**。
- 实验 PR 使用独立分支、Draft、目标 `dev`；实验结束不合并。
- 最终只把有证据支持的最小变更回写主工作分支。

## 工具状态

本轮 GitHub 与 Skill Router MCP 均可用：

- GitHub：仓库读写、分支/PR、compare、Actions run/job/step 查询均已实际调用；
- Skill Router MCP：已从 snapshot `8a6bf845eff1e3f42f7e01fa5a5b3f0715468929` 加载 `init-shadcn-docs-nuxt`、`do-long-task`、`git-commit`；
- `git-commit` 技能要求的 commit type authority 已读取，当前文档提交使用仓库定义的 `📃 docs`，构建实验使用 `🔨 build`。

旧报告中“Skill Router MCP 本会话不可用”的记录已经失效，以本节为准。
