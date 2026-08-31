# 2026-09-01 Vercel 项目绑定误判与生产浏览器验收缺口事故

## 1. 问题现象

在 AI RAG 三期发布验收中，曾报告 `NITRO_DATABASE_URL`、`NITRO_SYNC_DATABASE_URL`、`POSTGRES_URL_NON_POOLING` 缺失，并据此怀疑 Neon/Vercel 资源没有配置。同时，代码虽然已经具备生产 API 能力，但没有完成“Git commit 触发 Production → 真实 Chrome 使用 → 结果与失败路径验收”的完整链路。

这造成两个表面结果：环境变量结论与仓库根目录 README 及既有 Vercel 双项目架构不一致；部署状态和本地/API 级验证被误认为接近生产用户验收。

## 2. 实际根因

环境变量并未缺失，根因是查询时没有先确认 Vercel CLI 的项目绑定槽位。根目录 `.vercel/project.json` 实际绑定的是 Nitro 项目 `smallalice-docs-ai-nitro-api`，而不是文档站 `small-alice-web-odse`。在正确项目执行 `vercel env ls` 后，三个变量均可见，Production/Preview 敏感值显示为 `Hidden`。

生产验收缺口来自发布链路没有按仓库约束执行：没有先把全部修改分类提交并推送 `dev/main`，也没有等待 Git Integration 以同一 SHA 构建两套 Production，再使用有头 Agent Browser 验证真实页面、真实 API、来源锚点和停止生成行为。

## 3. 关键误导点

- 把某个 Vercel 项目或错误 CLI 绑定槽位中的变量列表，当成整个仓库的资源事实。
- 没有把根目录 `.vercel/project.json`、项目名和 `vercel env ls` 作为环境变量核验的第一组证据。
- 本地测试、HTTP 200、Preview 或构建成功只能证明局部链路，不能证明 Git-triggered Production 和用户浏览器体验已经闭环。
- AI 对话出现参考资料或请求处于 loading，不等于完整回答流已经成功；停止生成必须单独验证。
- `main` 已被独立 worktree `D:\code\ruan-cat\SmallAliceWeb-main-sync` 占用时，直接在当前工作树切换分支会制造额外风险；应使用现有 main worktree rebase/push。

## 4. 有效修复

先核对项目边界：确认根目录绑定为 `smallalice-docs-ai-nitro-api`，仅列出变量名和目标环境，不读取或输出密钥。随后将全部工作区修改按职责拆成 7 个 Conventional Commit，推送 `dev`，在独立 main worktree 执行 `git rebase dev` 并推送 `main`。

以同一 SHA `752fa45cde7f3fed0c50891a79dcec15e764d90c` 触发两套 Git Integration Production。文档站和 Nitro API 的 Vercel 构建日志均显示从 `main` 克隆该 SHA、构建成功并达到 `Ready`。

最后使用命名的有头 Agent Browser session，在真实生产域名完成 Nitro 搜索 API、文档站搜索与目标锚点跳转、AI 对话来源链接渲染和停止生成验证。对仍在 loading 的回答执行真实取消，并明确记录“取消链路通过、完整回答流未在本次尝试中结束”，没有把部分证据包装成完整成功。

## 5. 验证方式

- 项目绑定证据：根目录 `.vercel/project.json` 的 `projectName` 为 `smallalice-docs-ai-nitro-api`；`vercel env ls` 显示三个数据库变量存在，敏感值不外泄。
- Git 证据：`git log -7 --oneline` 显示 7 个分类提交；`git status --short --branch` 输出 `## dev...origin/dev`，工作树干净；`git diff --check` 无输出。
- Vercel 证据：文档站 Deployment `dpl_ENS7dJy7K4WE4cGGtdTEvTHKU8Y4` 与 Nitro Deployment `dpl_4sX4NfCkif5DURGAR8FbieSXaE7t` 均为 `Ready`，日志包含 `Cloning ... Commit: 752fa45` 和部署完成信息。
- 浏览器证据：生产 `/v1/search` 返回 HTTP 200、`success: true`、10/10 目标结果和 5 个标题命中；文档搜索可打开“1）特征设定”；AI 参考资料生成 5 个 `#rag-heading-*` 链接；点击“停止生成”后停止按钮消失、输入恢复。
- 进程证据：关闭 Agent Browser session 后，按本次 session 标识审计没有残留进程；浏览器 session 状态为 inactive 且无 PID。

## 6. 后续约束

- 任何 Vercel 环境变量结论，必须先检查 `.vercel/project.json` 或显式执行 `vercel link --project <name> --yes`，再在目标项目执行 `vercel env ls`；禁止跨项目推断“缺失”。
- 仓库存在多 Vercel 项目时，Production 验收必须记录项目名、Root Directory、Build Command、部署 SHA、Deployment ID 和最终状态；本地 build、Preview、CLI 上传不能替代 Git Integration 证据。
- 文档站正式 Production 只由 `main` 有意义提交触发；如果 `main` 已被其他 worktree 占用，复用该 worktree 完成 rebase/push，不强行切换或破坏用户工作树。
- Agent Browser 验收至少覆盖真实页面导航、真实 API、来源锚点和停止/失败路径；参考资料出现或 HTTP 200 不得替代完整回答流的结论。
- 外部模型响应未结束时，必须区分“请求已发出”“来源已渲染”“取消成功”“完整回答完成”四种状态，按证据逐项报告。
- 未来若出现同类误判，第一可信信号应来自 fresh Vercel CLI 项目绑定、fresh Git-triggered 构建日志和 fresh 有头浏览器，而不是历史缓存或口头状态。
