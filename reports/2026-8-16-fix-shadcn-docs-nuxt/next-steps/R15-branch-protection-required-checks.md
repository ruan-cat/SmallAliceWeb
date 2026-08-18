# R15 `dev` / `main` 未启用 branch protection 与 required status checks

- **优先级**：P0
- **状态**：OPEN
- **类型**：仓库治理 / CI 绕过风险

## 风险说明

当前 GitHub API 对 `dev` 与 `main` 都返回：

```text
protected: false
required_status_checks: off
```

这意味着仓库虽然已经建立了高价值的 production build、V8/RSS 观测与 Nuxt `.output` HTTP smoke，但 GitHub 分支层目前没有强制机制保证这些检查必须通过才能进入关键分支。

从风险角度看，这是当前所有技术加固上方的一层“总开关”：如果允许直接 push 或在 checks 失败时仍合并，那么 R02–R14 的 CI 护栏都可能被人为或自动化流程绕过。

## 已知证据

- `dev`：`protected=false`，`required_status_checks.enforcement_level=off`。
- `main`：`protected=false`，`required_status_checks.enforcement_level=off`。
- 当前文档站 CI workflow 名称：`文档站生产构建自检`，核心 job：`生产构建链路自检`。
- 主 PR #11 当前保持 Draft，因此本轮没有利用无保护分支进行合并；风险是仓库级长期状态。

## 建议加固任务

1. 优先在 `dev` 建立 branch protection / ruleset，再评估同步到 `main`。
2. 至少要求：
   - 通过 pull request 合并；
   - required status check 包含文档站生产构建链路；
   - conversation/review 策略按项目规模决定；
   - 禁止普通自动化在 checks 失败时直接 push 覆盖。
3. 如果 Vercel Git status 足够稳定，可评估是否把 Vercel Preview 也设为 required；如果会造成外部平台 outage 阻塞开发，则先只强制 GitHub 自有 CI，再通过发布流程要求 Vercel。
4. 在启用规则前确认 status check 的稳定名称，避免 workflow rename 后分支永久无法合并。
5. 为仓库 owner 保留经过审计的 break-glass 路径，但紧急绕过后必须补跑完整验证。
6. 记录哪些 bot / release workflow 需要 bypass，避免规则上线后意外阻断正常发布。

## 验收标准

- [ ] `dev` 显示 branch protection/ruleset 已启用。
- [ ] 合并到 `dev` 前必须通过 `生产构建链路自检` 或对应稳定 check。
- [ ] `main` 有与发布策略匹配的保护规则。
- [ ] 直接 push / bypass 权限有明确边界。
- [ ] 故意制造一个失败检查的测试 PR，确认无法正常合并。
- [ ] workflow 改名时有同步 required check 的维护说明。

## 不要做什么

- 不要未经测试一次性开启过严规则，把 owner 和自动发布都锁死。
- 不要把不稳定的外部 status 直接设成唯一不可绕过门槛。
- 不要只写团队约定“请等待 CI”，而不使用 GitHub 的技术强制能力。