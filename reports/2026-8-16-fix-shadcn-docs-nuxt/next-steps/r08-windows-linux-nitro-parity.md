# R08 Windows 与 Linux/Vercel 的 Nitro externals 行为不一致

- **优先级**：P1
- **状态**：OPEN
- **类型**：跨平台一致性 / runtime output

## 风险说明

当前 `packages/ai-vue-doc/nuxt.config.ts` 保留平台分支：

```ts
nitro: {
  ...(process.platform === "win32"
    ? {
        externals: {
          trace: false,
        },
      }
    : {}),
}
```

也就是说 Windows 本地 build 与 GitHub Actions Linux / Vercel 的 Nitro external dependency tracing 不是同一条路径。

这个分支来自历史 Windows 兼容约束，当前不能贸然删除；但本轮又刚刚证明 Nitro dependency tracing / output copy 对 pnpm alias 非常敏感，因此平台分叉本身需要被明确测试，而不能长期依赖“Windows 大概也没问题”。

## 可能后果

1. Windows 本地构建的 `.output` 依赖完整性与 Linux CI 不同。
2. 某个问题只在 Windows 开发者环境出现或被 Windows `trace:false` 掩盖。
3. 本地“build 成功”不能代表 Vercel，反之亦然。
4. 后续 agent 为统一配置直接删除 Windows workaround，重新触发既有 Windows 问题。

## 建议加固任务

1. 先追溯 Windows-only `trace:false` 的原始 bug 与证据，确认它现在是否仍必要。
2. 建立最小 Windows CI job，至少覆盖 `packages/ai-vue-doc` production build 与 standalone output 启动；如果成本过高，可先设为手动/定期 job。
3. 比较 Windows 与 Linux `.output/server/package.json`、主要 external dependency 和 runtime smoke 行为。
4. 对 `@popperjs/core` / Element Plus 页面做 Windows runtime smoke。
5. 若未来尝试删除 `trace:false`，必须单独 PR，不能与 Nuxt/Nitro 升级混在一起。

## 验收标准

- [ ] Windows build 有自动或可重复的验证入口。
- [ ] Windows `.output` HTTP smoke 通过。
- [ ] Windows 与 Linux 的关键 external dependency 差异有记录。
- [ ] 能回答 `trace:false` 是否仍必要，并有对应证据。
- [ ] 如果保留平台分支，代码旁有原因和回归测试；如果删除，也有 fresh Windows 证据。

## 不要做什么

- 不要为了“配置看起来更干净”直接删除 Windows workaround。
- 不要把 Linux/Vercel 绿色推断成 Windows 绿色。
- 不要把 Windows `trace:false` 推广到 Linux/Vercel；E2-A 已证明这不是当前 OOM 的根治方案，而且会改变 output tracing 语义。