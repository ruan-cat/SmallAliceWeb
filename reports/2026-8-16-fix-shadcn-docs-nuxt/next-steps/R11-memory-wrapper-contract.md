# R11 5120 MiB memory wrapper 存在双重配置与脚本契约风险

- **优先级**：P1
- **状态**：OPEN
- **类型**：构建脚本 / 配置一致性

## 风险说明

当前 5120 MiB old-space 同时存在于两个地方：

1. `packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs` 中硬编码：

```js
const memoryFlag = "--max-old-space-size=5120";
```

2. `.github/workflows/ci.yaml` 的构建前内存记录与生产构建 step 中再次设置：

```yaml
NODE_OPTIONS: --max-old-space-size=5120
```

wrapper 还会过滤掉已有 `--max-old-space-size` / `--max_old_space_size` 并用自己的值覆盖。因此未来只修改 CI 或只修改 wrapper，都可能形成“日志记录的 heap 和真正子进程 heap 不一致”或本地/Vercel与CI策略分叉。

此外，root `package.json` 仍有自己的 `postinstall: npx nuxi prepare`，而 `packages/ai-vue-doc` 又有 package-level `postinstall` wrapper，需要确认这些生命周期 hook 是否存在重复 prepare、意外执行目录或额外资源成本。

## 建议加固任务

1. 为 old-space 建立单一 source of truth：
   - 可由 wrapper 常量统一；或
   - 使用明确环境变量，例如 `AI_VUE_DOC_OLD_SPACE_MB=5120`，wrapper 负责解析和默认值。
2. CI 不要同时“硬编码同一个值两遍”而缺少一致性断言；至少让 CI 输出 wrapper 实际采用的值。
3. 为 wrapper 写最小自动测试：
   - 支持 `prepare` / `build`；
   - 非法 command 拒绝；
   - 正确保留其他 `NODE_OPTIONS`；
   - 正确移除旧 old-space flag；
   - Windows 使用 `pnpm.cmd`；
   - 子进程退出码正确透传。
4. 审核 root `postinstall` 与 package `postinstall`，确认是否存在不必要的重复 `nuxi prepare`。
5. 若未来调整 5120，要求一个位置即可生效，并在 CI 中有自检。

## 验收标准

- [ ] old-space 只有一个权威配置来源。
- [ ] CI 日志明确打印最终实际 heap limit。
- [ ] wrapper 有最小单元/集成测试覆盖 NODE_OPTIONS 合并逻辑。
- [ ] Windows/Linux spawn 行为有测试或验证。
- [ ] root/package lifecycle hook 的 prepare 调用关系有说明，避免重复执行。

## 不要做什么

- 不要在 CI、Vercel、package scripts 分别维护三个不同的 heap 数字。
- 不要允许外部 `NODE_OPTIONS=8192` 静默绕过项目已验证的 5120 预算，除非明确设计为可覆盖并有日志。
- 不要为了消除 wrapper 直接退回 8 GiB 环境变量。
