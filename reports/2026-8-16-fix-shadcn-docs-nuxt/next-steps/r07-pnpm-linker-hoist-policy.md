# R07 pnpm linker / hoist 策略变更可重新触发 OOM

- **优先级**：P0
- **状态**：OPEN
- **类型**：包管理拓扑 / 构建性能

## 风险说明

本轮为验证 npm alias 可见性问题，做过全局 `nodeLinker: hoisted` 单变量实验。结果不是“修好 runtime”，而是在 5120 MiB old-space 下重新把 production build 推回 V8 OOM。

这说明 pnpm node_modules 拓扑不是纯安装细节，它会改变 Nuxt/Vite/Nitro 实际看到的 dependency graph 和 working set。

后续如果为了兼容某个包、减少 symlink 问题或模仿 npm/yarn 而全局切换 linker，可能直接破坏当前已验证的内存基线。

## 已知证据

E7-A（全局 `nodeLinker: hoisted`）：

- install 成功；
- 5120 MiB production build 失败；
- 日志出现 `FATAL ERROR: Reached heap limit`；
- max RSS 约 `5,646,292 kB`；
- runner 仍有大量可用物理内存，因此是 V8 heap/working-set 回归，不是机器 RAM 被耗尽。

E7-B（只 public-hoist `@popperjs/core`）：

- 5120 MiB full build 成功；
- runtime smoke 成功；
- 证明物理可见性参与 alias 故障，但该方案仍属于 workspace 级策略，不是当前首选生产修复。

## 建议加固任务

1. 明确记录当前 pnpm linker 策略：保持默认 isolated/symlink 模型，除非有单独证据要求改变。
2. 增加配置检查：若 `pnpm-workspace.yaml` / `.npmrc` 出现 `nodeLinker: hoisted`、`shamefully-hoist` 或等价全局扁平化配置，则 CI 要求专项基准。
3. 允许 narrow `publicHoistPattern` 作为诊断/兼容备选，但必须写清具体包名、原因和删除条件。
4. 所有 linker/hoist 改动必须同时跑：5120 full build、R02 isolated output、R03 核心功能 smoke、Vercel Preview。
5. 将 E7-A 作为仓库级负面回归样本记录在维护文档中。

## 验收标准

- [ ] 全局 linker/hoist 改动无法无审查进入 `dev`。
- [ ] CI 或静态检查能发现 `nodeLinker: hoisted` / `shamefullyHoist`。
- [ ] narrow hoist 规则有单包范围和删除条件。
- [ ] 包管理拓扑变更必须附带内存/模块数对比。

## 不要做什么

- 不要把 `MODULE_NOT_FOUND` 自动翻译成“需要 shamefullyHoist”。
- 不要因为 publicHoist 单变量曾经绿色就自动把它替换当前 direct dependency 修复。
- 不要在升级 pnpm 的同时改变 linker，避免失去因果边界。