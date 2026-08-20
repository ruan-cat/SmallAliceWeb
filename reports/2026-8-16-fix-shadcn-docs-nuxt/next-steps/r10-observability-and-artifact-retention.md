# R10 构建诊断证据留存不足

- **优先级**：P1
- **状态**：OPEN
- **类型**：可观测性 / 事故取证

## 风险说明

本轮多次遇到 GitHub connector 无法稳定返回 completed job 的完整日志，只能通过 step summary 或 failure artifact 继续调查。为了定位 runtime smoke，后来才新增 `nuxt-runtime-smoke-diagnostics` artifact。

当前这个 artifact 只保留 `1` 天：

```yaml
retention-days: 1
```

这对长周期 AI agent 协作非常脆弱：下一次会话、第二天复盘或上游 issue 需要证据时，关键 server log / response body 可能已经消失。

此外，成功构建的关键指标目前主要散落在 console log 中，没有稳定的机器可读汇总。

## 已知影响

- E2–E4 因完整 job log 获取不稳定，只能严谨记录“主体 build failure”，不能补写具体 OOM 行和 max RSS。
- runtime alias 故障最终依赖 artifact 才取得 `ERR_MODULE_NOT_FOUND` 的直接证据。
- 如果 artifact 当时过期，根因定位会明显更困难。

## 建议加固任务

1. 将 failure diagnostics artifact retention 从 1 天提升到合理周期，例如 7–14 天；具体值由仓库成本策略决定。
2. 每次 production build 生成机器可读 summary，例如 JSON / Markdown：
   - commit SHA；
   - Node/pnpm/Nuxt/Nitro/Vite；
   - V8 heap limit；
   - max RSS；
   - client/server module count；
   - prerender 结果；
   - runtime smoke route/status。
3. 将关键摘要写入 `$GITHUB_STEP_SUMMARY`，避免必须下载完整日志才能判断阶段。
4. failure artifact 继续保存 server log、headers、body；R03 扩大路由后按路由分别保存诊断。
5. 对成功 run 也可保留小型 summary artifact，而不是只在 failure 时有证据。

## 验收标准

- [ ] 一周后仍能复核一次失败的关键 runtime/build 证据，或仓库另有等价持久化方式。
- [ ] 不依赖 connector 完整 job log，也能知道失败生命周期阶段。
- [ ] max RSS / heap / versions / smoke result 有机器可读记录。
- [ ] GitHub UI 的 step summary 能快速判断是否是 install、build、startup、HTTP runtime 失败。

## 不要做什么

- 不要把大体积 `.output` 永久上传作为默认方案；目标是保存高信号诊断，不是归档整个构建目录。
- 不要在用户响应体可能包含敏感信息时无脑长期保存 body；先确认文档站内容的安全边界。
- 不要用“connector 以后应该能拿到日志”替代仓库自身的可观测性。