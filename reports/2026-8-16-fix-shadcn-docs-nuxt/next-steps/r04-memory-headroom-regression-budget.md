# R04 5120 MiB headroom 缺少长期回归预算

- **优先级**：P0
- **状态**：OPEN
- **类型**：构建资源 / 性能回归

## 风险说明

E5 已经证明：4608 MiB production build 失败，5120 MiB 成功，6144 MiB 也成功。因此当前只能严谨地说：

```text
4608 MiB < 最小稳定需求 <= 5120 MiB
```

5120 MiB 是**最低已测试通过档位**，不是精确数学最小值，也不是永久安全值。

当前修复通过 E1 把 server transformed modules 从历史约 4028 降到 2449，释放了大量 working-set 压力。但未来新增依赖、文档组件、Content 插件、图标集合或 bundling 配置变化，都可能逐步吃掉这部分 headroom，直到 5120 再次变成脆弱边界。

## 已知证据

- 默认约 4144 MiB：E1 final Nitro build OOM。
- 4608 MiB：E5-A 失败。
- 5120 MiB：E5-B 成功，并在多个候选/cold-runner 构建中重复成功。
- 6144 MiB：E5-C 成功。
- 全局 `nodeLinker: hoisted` 实验在 5120 MiB 下重新 OOM，证明安装/解析拓扑改变足以让已通过的内存档位失效。

## 可能后果

1. 小幅依赖增长累计后突然在 final Nitro Rollup 再次 OOM。
2. 团队只能看到“5120 以前能过、现在不能过”，但不知道 graph 从何时开始增长。
3. 遇到回归时再次用 8/12/16 GiB 掩盖问题。
4. GitHub Actions 绿色但 Vercel build working set 更高，环境间出现边界差异。

## 建议加固任务

1. 将每次 docs production build 的关键资源指标结构化保存：
   - V8 heap limit；
   - `/usr/bin/time -v` maximum RSS；
   - client/server transformed modules；
   - prerender route 数与耗时；
   - final Nitro build 是否完成。
2. 以当前最终候选建立基线，至少收集多次 fresh runner 数据，不要根据一次 run 硬编码阈值。
3. 设计相对回归预算，例如 module count / max RSS 比基线显著增长时发 warning 或 failure；具体百分比应由重复样本确定，不在本卡预设。
4. 当依赖升级或 bundling 配置修改时，自动对比基线。
5. 保留 5120 MiB 上限作为硬约束，任何要求上调 old-space 的 PR 都必须附带 graph / RSS 解释和独立实验。

## 验收标准

- [ ] CI 可机器读取至少 V8 limit、max RSS、server modules 三项指标。
- [ ] 有固定基线 SHA 与重复样本。
- [ ] 有明确的“增长多少需要人工调查”的预算规则。
- [ ] 任意提高 `--max-old-space-size` 的改动会触发显式审查或测试。
- [ ] 能从一次回归快速判断是 graph 增长还是单纯 runner 波动。

## 不要做什么

- 不要把 5120 MiB 写成“框架永远需要 5 GiB”。
- 不要因为还有物理 RAM 就无限提高 old-space。
- 不要用关闭 Content/search/SSR 功能来满足预算。