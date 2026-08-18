# 最终修复记录

> 状态：**尚未达到最终修复验收标准。**

本文件只在候选方案完成默认 heap 构建、产物验证、重复 CI、cold runner 与 Vercel 验证后填写“最终修复”。在此之前不把诊断性绿色写成彻底修复。

## 当前已确认

- E0 8 GiB 控制组稳定成功，但属于症状控制。
- E1 移除 production source alias 与 blanket bundling 后，server graph 约减少 39%。
- E1 在默认 4144 MiB V8 heap 下已完整完成 prerender。
- E1 仍在 final Nitro server Rollup 阶段 exit 134。
- 下一候选集中在 Nitro v2 externals/NFT 路径：E2-A 先做 trace 因果诊断，E2-B 再验证 legacyExternals 是否可作为可部署结构方案。

## 最终修复必须满足

- [ ] 不盲目依赖 `--max-old-space-size=8192`
- [ ] final Nitro server build 完成
- [ ] `.output` 可运行且依赖完整
- [ ] 文档页面正常
- [ ] 组件展示正常
- [ ] Content/search API 正常
- [ ] 同 SHA rerun 成功
- [ ] cold-runner 临时 PR #1 成功
- [ ] cold-runner 临时 PR #2 成功
- [ ] Vercel 部署成功
- [ ] 主 PR 仅包含已证实的最小必要配置
- [ ] 最终经验写入 `.agents/skills/fix-bug/record-bug-fix-memory/`

## 最终方案

待 E2/E3/E4 证据完成后填写。

## 验证矩阵

| 验证 | Run / Job / Deploy | 结果 |
| --- | --- | --- |
| 主候选首次 CI | 待执行 | 待执行 |
| 同 SHA rerun | 待执行 | 待执行 |
| cold runner #1 | 待执行 | 待执行 |
| cold runner #2 | 待执行 | 待执行 |
| Vercel | 待执行 | 待执行 |
| output runtime sanity | 待执行 | 待执行 |

## 回退策略

如果最终证明框架组合在结构已经最小化后仍稳定需要略高于默认 old-space，应记录最小实测阈值及其重复性，并优先采用最小有证据的 headroom，而不是直接回退到 8/12/16 GiB。