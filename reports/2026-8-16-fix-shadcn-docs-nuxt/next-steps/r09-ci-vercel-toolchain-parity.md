# R09 GitHub Actions 与 Vercel 工具链/环境可能漂移

- **优先级**：P1
- **状态**：OPEN
- **类型**：部署环境一致性

## 风险说明

GitHub Actions 当前显式设置 pnpm `10.29.2`、Node `22.x`，并在仓库内运行 production build；Vercel 则依赖 Git integration、Project Settings、平台镜像与环境变量共同决定安装/构建行为。

本轮已经要求同一候选同时通过 GitHub Actions 与 Vercel，说明两者是两个独立验收门。但关键环境信息还没有全部代码化或结构化比较，未来 Project Settings 变化、Corepack 开关、Node patch 更新、Build Command 变化都可能造成“CI 绿、Vercel 红”或反向漂移。

仓库已有历史事故记录 `2026-08-10-vercel-pnpm-corepack-meta-fetch-fail.md`，证明 Vercel 自定义 pnpm 安装与 Corepack 配置曾经真实影响部署。

## 建议加固任务

1. 在 CI 和 Vercel build 日志都输出：`node -v`、`pnpm -v`、`nuxi info` 或等价 Nuxt/Nitro/Vite 版本信息。
2. 记录 Vercel Project 的 Build Command、Install Command、Root Directory、Node 版本和 Corepack 相关设置；能代码化的尽量放入仓库配置。
3. 引入 R01 lockfile 后，验证 Vercel 确实使用 frozen/lockfile 驱动安装，而不是重新自由解析。
4. 对每个最终候选确认 Vercel deployment metadata 的 `githubCommitSha` 与 GitHub Actions 验证 SHA 完全一致。
5. 若 Vercel 平台会自动选择 Nitro preset，记录最终 preset，不要仅凭本地 node-server 行为推断云端。
6. 建立一个简短“环境差异表”，升级 Node/pnpm/Nuxt 时同步维护。

## 验收标准

- [ ] GitHub CI 与 Vercel 都能查到实际 Node/pnpm/Nuxt/Nitro 版本。
- [ ] Vercel Project 关键构建设置有可审计记录。
- [ ] Vercel Preview 明确绑定 exact Git SHA。
- [ ] lockfile 与 packageManager 策略在两边一致。
- [ ] CI 与 Vercel 的差异项有文档，不依赖口头记忆。

## 不要做什么

- 不要把 GitHub Actions 绿色当成 Vercel 自动绿色。
- 不要用 Vercel prebuilt upload 替代 Git integration 安装链验收。
- 不要在平台设置里静默修改 Node/pnpm/Install Command 而不记录。