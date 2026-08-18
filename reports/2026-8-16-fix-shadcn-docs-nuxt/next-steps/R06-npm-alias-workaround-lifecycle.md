# R06 `@popperjs/core` npm alias workaround 缺少生命周期管理

- **优先级**：P1
- **状态**：OPEN
- **类型**：依赖兼容 / 临时补丁债务

## 风险说明

当前最终候选通过在 `packages/ai-vue-doc/package.json` 显式加入：

```json
"@popperjs/core": "npm:@sxzz/popperjs-es@^2.11.7"
```

修复了 Nitro standalone output 中 Element Plus runtime 依赖缺失的问题。

这是当前版本组合下最小、已验证有效的方案，但它本质上是在部署 package 边界显式重复 Element Plus 的 transitive npm alias。未来 Element Plus、Nitro、pnpm 或 nft 修复 alias tracing 后，这个 workaround 可能变得冗余；反过来，如果 Element Plus 改变 alias target/version，而本仓库仍保留旧声明，也可能形成新的依赖分叉。

## 已知证据

- E6-A：显式 runtime alias dependency 后，5120 MiB full build + runtime smoke 全绿。
- E6-C：Nitro `traceOpts.traceAlias` 在当前组合下仍无法补齐 output。
- Nitro 上游 issue `nitrojs/nitro#1574` 记录过 pnpm symlink + npm alias tracing 边界，并包含同一组 `@popperjs/core` / `@sxzz/popperjs-es` 关系。
- 当前 `element-plus` 仍使用 semver range，依赖解析又未锁定，增加了 future drift 风险。

## 建议加固任务

1. 写一个小检查，读取已安装 `element-plus/package.json` 中 `dependencies['@popperjs/core']`，与 `packages/ai-vue-doc/package.json` 的显式 alias 做一致性比较。
2. Element Plus 升级 PR 必须运行 isolated `.output` smoke；如果 upstream alias 发生变化，不能静默继续使用旧 target。
3. 跟踪 Nitro / nft 对 pnpm npm alias tracing 的上游修复。
4. 只有在**删除本地显式 alias dependency** 后，isolated output + cold runner + Vercel 仍连续通过，才允许移除此 workaround。
5. 在 package.json 附近或项目文档记录该 dependency 为什么看似“重复”却不能随意删。

## 验收标准

- [ ] CI 能检测 Element Plus alias 与本地 workaround 是否失配。
- [ ] Element Plus/Nitro 升级流程包含 isolated output 验证。
- [ ] workaround 有明确的上游 issue / 删除条件。
- [ ] 未来移除 workaround 时有负向测试：删除后仍必须证明 standalone 不再缺包。

## 不要做什么

- 不要看到它像“重复依赖”就直接清理。
- 不要把 `traceAlias` 曾经失败的实验结果忘掉后再次当成未经验证的等价替代。
- 不要为了消除这个一行 dependency 改成全局 hoist 或 blanket inline。