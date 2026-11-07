# 2026-11-02 bumpp --dry-run 不存在导致误发版并推送到远端

## 1. 问题现象

在执行 `init-release-base-relizy-and-bumpp` 技能的验收矩阵时，运行技能文档给出的"只读校验"命令：

```log
pnpm exec bumpp --dry-run --release patch --yes
```

它没有做 dry-run，而是真实执行了一次根包发版：创建提交 `4fc87d2 📢 publish(root): release v3.7.4`、打 tag `v3.7.4`、并把提交与全部本地未推送 tag 推到了 `origin/dev`。

## 2. 实际根因

`bumpp` **没有 `--dry-run` 这个选项**。`bumpp --help` 的实际选项清单里只有：

```log
  -c, --commit [msg]   Commit message (default: true)
  -p, --push           Push to remote (default: true)
  -y, --yes            Skip confirmation (default: false)
```

三层叠加导致事故：

1. 未知 flag `--dry-run` 被 CLI 解析器**静默忽略**，不报错；
2. 我为了让命令不卡在交互提示 `? Bump? » (Y/n)` 上，补了 `--yes`；
3. `--commit` 与 `--push` 的默认值都是 `true`，于是跳过确认后直接提交并推送。

第一次运行（`--no-push --no-commit`，这两个 flag 同样不存在）弹出交互提示后被管道 EOF 终止，未产生副作用；我把它判读为"这个命令需要更多参数才能非交互"，于是加了 `--yes`——正好把唯一的安全阀拆掉。

## 3. 关键误导点

- **技能文档本身就是雷**：`init-release-base-relizy-and-bumpp` 的验收分支把 `bumpp --dry-run --release patch` 写成"只读 dry-run"，但 bumpp 从未提供该 flag。文档里同时把 `relizy-runner release --dry-run ...` 与它并列，`relizy-runner` 的 `--dry-run` 是真实存在的，这种并列制造了"bumpp 也一样安全"的错误类推。
- **"命令名里带 dry 就等于只读"是错误假设**：任何声称 dry-run 的命令，执行 `--help` 核查 flag 是否存在，成本 3 秒；我在造成后果之后才跑了 `--help`。
- **共享工作树未被察觉**：会话开始时工作树只有 `M prompts/01.prompts.md`，执行期间并发出现他人对 `docs/CHANGELOG.md`、`packages/ai-vitepress-plugins/**`、`packages/ai-vue/**` 的修改与陌生截图。`bumpp` 默认提交**全部已跟踪改动**，因此把这些并发工作和用户自己的 `prompts/01.prompts.md` 一起打包进了发布提交。

## 4. 有效修复

对本次事故，正确做法是（按优先级）：

1. **发版类命令一律先取 flag 真值**：`pnpm exec bumpp --help` 必须排在任何 bumpp/relizy/versions 命令之前，未知 flag 直接判定为"该保护不存在"。
2. **非交互授权不等于放开默认行为**：需要非交互时，应显式关闭写侧行为（`--no-commit --no-push` 在 bumpp 里不存在，所以正确写法是 `--dry`? 亦不存在 → 结论：bumpp 没有只读模式，任何情况下不得把它当校验工具；校验版本影响面只用 `relizy-runner release --dry-run --no-publish --no-provider-release --no-push --no-commit --yes`）。
3. **共享工作树下禁止使用会 `git add -A` 语义的发布命令**：先确认工作树只含本轮改动，或改用 `git commit -- <明确路径>` 的定点提交方式。

## 5. 验证方式

```log
git tag --list | wc -l      改前 14 → 事故后 15（新增 v3.7.4）
git rev-parse --short HEAD  08154b7 → 4fc87d2
git log origin/dev -1       4fc87d2 📢 publish(root): release v3.7.4   （已推送）
git ls-remote --tags origin | grep v3.7.4  4fc87d2693a75a339b23ff7d63793a00c500e8eb（远端存在）
gh release view v3.7.4      release not found（未生成 GitHub Release）
gh run list --workflow release.yaml  最新记录仍为 2026-10-31（发版工作流未被触发）
```

未受损项：根包 `private: true` 未发布 npm；`main` 分支未变动，Vercel 文档站 Production（由 `main` 的 Git Integration 触发）未受影响；并发 agent 的改动内容完整保留在 `4fc87d2` 中，未丢失。

## 6. 后续约束

未来任何 agent 在本仓库执行发版相关任务时，必须先满足：

1. `pnpm exec bumpp --help` 核实意图所用 flag 真实存在，bumpp 无只读模式，禁止用它做校验。
2. 未经授权不得 `git commit` / `git push` / 打 tag；本仓库 `AGENTS.md` 与用户当轮裁决均把提交列为禁止项。
3. 运行会提交"全部已跟踪改动"的命令前，先 `git status --porcelain` 比对会话基线，出现他人文件即停机。
4. 引用第三方技能文档里的"dry-run"命令时，把"该 flag 是否存在"列为前置验证项，而不是信任文档表述。
