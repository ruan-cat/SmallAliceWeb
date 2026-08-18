# R05 production bundling graph 可能被历史配置重新放大

- **优先级**：P0
- **状态**：OPEN
- **类型**：构建配置 / 回归防护

## 风险说明

E1 已经提供强证据：历史 production source alias、blanket `vite.ssr.noExternal` 和 blanket `nitro.externals.inline` 会显著放大文档站 production graph。

收敛这些配置后，server transformed modules 从历史约 4028 降到 2449，约减少 39%，并把默认 heap 下的死亡点推迟到完整 prerender 之后。

当前问题已经修复，但仓库没有任何自动化护栏阻止未来 agent 或依赖兼容修复再次加入类似的“大范围 inline / noExternal / 直接消费 workspace src”配置。由于这些配置短期常能解决某些 ESM/SSR 兼容问题，因此具有很强的诱惑性。

## 高风险模式

后续变更若出现以下模式，应默认触发专项审查：

- `vite.ssr.noExternal` 使用大量包名或宽泛正则；
- `nitro.externals.inline` 使用大量包名、宽泛正则或接近 blanket 的规则；
- production alias 把 workspace package 指向 `../*/src`；
- 为修一个 runtime dependency 把整个 UI 库 inline；
- 为解决 pnpm alias 问题改成大范围 bundling。

## 已知反例

- E1 移除历史 source alias / blanket bundling 后 graph 明显缩小。
- E6-B 仅 inline `element-plus` 就让 5120 MiB production build 失败，说明即使“只 inline 一个大 UI 包”也可能重新跨过内存边界。

## 建议加固任务

1. 写一个轻量静态检查脚本，扫描 `packages/ai-vue-doc/nuxt.config.ts` 与相关配置：
   - 对 blanket/wide regex `noExternal` / `inline` 给出 failure；
   - 对 production alias 指向 workspace `src` 给出 failure 或强警告。
2. 若确实需要某个 narrow exception，要求在代码旁写清对应 issue/实验和删除条件。
3. 将 R04 的 module count / RSS 基线作为第二层动态护栏。
4. 对 UI 库兼容问题优先尝试明确 runtime dependency / 精确 alias，而不是扩大 bundling 范围。
5. 在 AGENTS 或项目级构建说明中加入一句高信号约束：不要恢复 E1 已移除的图放大器。

## 验收标准

- [ ] CI 能识别明显 blanket `noExternal` / `externals.inline`。
- [ ] production source alias 指向 workspace `src` 时会被检查发现。
- [ ] narrow exception 有理由、证据和回滚条件。
- [ ] 任意相关配置变更都伴随 module count / RSS 对比。

## 不要做什么

- 不要把静态规则写成完全禁止 Nuxt 官方支持的 `noExternal` / `inline`；真正目标是禁止无边界使用。
- 不要为了通过 guard 把宽泛正则拆成几十个包名，实质 graph 若一样大仍然是同一风险。
- 不要仅以“CI 现在能过”证明 bundling 方案健康。