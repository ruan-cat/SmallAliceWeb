# R01 依赖解析与工具链不可完全复现

- **优先级**：P0
- **状态**：OPEN
- **类型**：依赖供应链 / 构建可复现性

## 风险说明

当前仓库没有提交 `pnpm-lock.yaml`，GitHub Actions 使用 `pnpm install --no-frozen-lockfile`。同时根 `package.json` 与 `packages/ai-vue-doc/package.json` 中存在大量 semver range，例如 `nuxt: ^3.21.x`、`element-plus: ^2.13.5`、`vue: ^3.5.x`。

因此：**同一个 Git commit SHA 并不严格等于同一个依赖解析快照。**

本轮实验中已经出现“需要精确区分 Nuxt / Nitro / Vite 实际解析版本”的情况。如果依赖在两次实验之间发生漂移，old-space 阈值、transformed modules、Nitro tracing 行为、npm alias 解析甚至 runtime output 都可能变化。

另外，根脚本目前包含：

```json
"rm:node_modules": "rimraf node_modules pnpm-lock.yaml .nuxt .vercel"
```

如果后续正式引入 lockfile，这个脚本会把 lockfile 一并删除，是需要同时修正的隐患。

Node 也使用 `22.x` 而不是固定 patch；pnpm 虽固定为 `10.29.2`，但完整工具链仍不是完全冻结状态。

## 已知证据

- CI：`pnpm install --no-frozen-lockfile`。
- 根 `packageManager`：`pnpm@10.29.2`。
- 根 `engines.node`：`22.x`。
- E1 实际解析曾记录为 Nuxt `3.21.11` / Nitro `2.13.4` / Vite `7.3.6`。
- `packages/ai-vue-doc` 当前仍存在 range dependencies。

## 可能后果

1. 同 SHA rerun 变成“代码相同、依赖不同”的伪重复性验证。
2. 某次上游 patch/minor 发布后 5120 MiB 突然重新 OOM。
3. Nitro alias tracing 行为变化，`@popperjs/core` workaround 出现新的兼容问题。
4. GitHub Actions 与 Vercel 在不同时间安装出不同依赖树。
5. 后续 agent 难以复现实验 E1–E7 的结果。

## 建议加固任务

1. 评估并提交仓库级 `pnpm-lock.yaml`。
2. CI 改为 `pnpm install --frozen-lockfile`。
3. 修改 `rm:node_modules`，不要删除正式 lockfile。
4. 明确 Node patch 的策略：完全 pin，或至少在 CI/Vercel 中记录实际 `node -v` 并建立升级窗口。
5. 将 `node -v`、`pnpm -v`、Nuxt/Nitro/Vite 实际版本写入 CI summary / artifact。
6. 验证 Vercel Git build 确实消费相同 lockfile 与 pnpm 版本。
7. 引入 lockfile 的 PR 必须单独做 full build + isolated `.output` runtime + Vercel Preview，避免与其他框架升级混在一起。

## 验收标准

- [ ] 仓库存在受版本控制的 lockfile。
- [ ] CI 使用 frozen install，并且 lockfile 不一致时明确失败。
- [ ] 清理脚本不会删除 lockfile。
- [ ] 两次 fresh runner 安装得到相同锁定依赖版本。
- [ ] Vercel Git Preview 使用相同 lockfile / pnpm 主版本。
- [ ] 5120 MiB build、isolated output smoke、核心 docs/search smoke 全部保持绿色。

## 不要做什么

- 不要在引入 lockfile 的同一个 PR 中顺便批量升级 Nuxt/Nitro/Element Plus。
- 不要因为 frozen install 暴露问题就退回 `--no-frozen-lockfile`。
- 不要把“同 SHA”继续当作“同软件输入”的充分证明，直到 lockfile 和工具链策略真正落地。