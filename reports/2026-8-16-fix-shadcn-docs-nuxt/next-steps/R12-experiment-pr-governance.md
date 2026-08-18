# R12 Draft 实验 PR / 分支缺少统一生命周期治理

- **优先级**：P2
- **状态**：OPEN
- **类型**：实验治理 / 误合并风险

## 风险说明

本轮为了保持单变量实验，创建了大量独立 Draft PR 和分支。这个策略在调查阶段是正确的，但实验结束后如果不做统一收尾，会留下以下风险：

- 新 agent 不知道哪些 PR 是失败反例、哪些是候选、哪些已经 superseded；
- 某个历史实验分支可能被误当作“更完整的修复”继续开发；
- Draft PR 数量长期增长，GitHub UI 信噪比下降；
- 已否定的 `trace:false`、legacyExternals、treeshake、inline、hoisted linker 等配置存在被误合并的可能。

## 本轮典型实验集合

至少包括：

- E0 控制组与 cold PR；
- E1 graph 缩减；
- E2-A / E2-B；
- E3 / E4；
- E5-A / B / C；
- candidate / cold-runner；
- E6-A / B / C；
- E7-A / B。

具体 PR / SHA 应以 `experiments/` 和主调查记录为准，不在本卡重复维护第二份可能漂移的完整列表。

## 建议加固任务

1. 建立实验 PR manifest：实验 ID、PR、branch、base SHA、唯一变量、结果、是否进入最终候选。
2. 对已完成且不会继续使用的实验 PR：
   - 保持“不合并”；
   - body 顶部明确写 `FAILED / DIAGNOSTIC ONLY / SUPERSEDED`；
   - 在证据落盘后考虑关闭 PR。
3. 对最终候选与 cold-runner PR 明确写 `VALIDATION ONLY`，避免与主 PR #11 混淆。
4. 分支删除策略要晚于报告落盘和 commit SHA 固化；不要先删证据入口。
5. 如果仓库支持 labels，可增加 `experiment`、`diagnostic`、`do-not-merge`。
6. 后续 AI agent 创建新实验时必须从固定基线派生并在 manifest 登记，禁止在旧实验分支上继续叠变量。

## 验收标准

- [ ] 所有历史实验 PR 都能一眼看出结果和是否允许合并。
- [ ] 已否定实验不再占据“待处理修复”的视觉位置。
- [ ] 报告中保存 commit SHA，即使分支删除也能追溯。
- [ ] 新实验有统一命名和 manifest 登记。
- [ ] 主 PR #11 与实验 PR 的角色边界明确。

## 不要做什么

- 不要为了清理 UI 直接删除尚未落盘的实验分支。
- 不要合并失败实验 PR 来“保留历史”；历史应由报告与 commit SHA 保存。
- 不要把多个单变量失败方案叠加成一个“碰碰运气”的新 PR。