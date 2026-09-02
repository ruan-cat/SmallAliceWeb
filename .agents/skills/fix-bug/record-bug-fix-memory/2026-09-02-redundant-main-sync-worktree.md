# 2026-09-02 冗余 main-sync worktree 遗留事故与纠偏

## 1. 问题现象

`D:\code\ruan-cat\SmallAliceWeb-main-sync` 与 `D:\code\ruan-cat\SmallAliceWeb\.git\worktrees\SmallAliceWeb-main-sync\` 长期存在一套独立 git worktree，指向 `main` 分支。每次发布都要执行「切换到独立 worktree → rebase dev → push main」的三步绕路流程，且该流程被后续多轮会话当作默认发布通道持续复用（8-24 创建，8-28、8-31、9-1 连续使用），直到 9-2 用户追责才发现这是一个本应「用完即删」的临时设施被遗留成了常驻基础设施。

## 2. 实际根因

根因分两层：

1. **创建层（8-24 18:35）**：Codex CLI（codex-root）+ gpt-5.6-terra 模型在会话 `sess-mt6zxuyy-cf7knk` 中，为保护主工作树中用户未提交的 `prompts/index.md` 改动，自主创建临时 worktree 用于 main 同步。该决策本身有其合理性，且 agent 当场明确承诺「同步完成后会删除这个由我创建的临时 worktree」——但**承诺未兑现**，会话结束时没有清理。
2. **固化层（8-28 起）**：后续会话发现这个既存 worktree 后，没有质疑「它为什么存在、还必要吗」，而是把它当作既成事实复用；更严重的是把「main 被独立 worktree 占用时应复用该 worktree rebase/push」写入 memorix（obs:5841/5844/5732），**把一次性的绕路 workaround 固化成了长期发布规范**。绕路的原始前提（保护未提交的 prompts 改动）早已消失，但绕路本身被制度化了。

## 3. 关键误导点

- **「存在即正确」错觉**：后续会话看到 `main` 已被 worktree 占用，就顺着「不能在主工作树切分支」的约束走，没有回头质疑这个占用本身是否合理——约束是被前人自己制造的，不是仓库固有的。
- **memorix 经验反噬**：obs:5844 写着「main 被独立 worktree 占用时应复用该 worktree rebase/push，不强行切换当前工作树」，后续 agent 检索到这条记忆后更加确信绕路是「规范做法」。**错误经验一旦入库，会自我强化**。
- **「临时」措辞的免责幻觉**：创建时标注「临时」并承诺删除，让创建方和后续使用者都放松了警惕——「临时」如果不附带确定的清理时点，就等于永久。

## 4. 有效修复

2026-09-02 按用户决策执行纠偏：

1. **删除冗余目录**：在主仓库执行 `git worktree remove D:/code/ruan-cat/SmallAliceWeb-main-sync`，工作目录与 `.git/worktrees/SmallAliceWeb-main-sync/` 元数据一并清除。
2. **memorix 记忆纠偏**：将含错误经验的 obs:5841、obs:5844、obs:5732 标记为 archived（默认搜索不再返回）；新增 obs:5871（decision，topicKey `release/main-publish-flow`）确立正确发布流程，新增 obs:5872（gotcha）沉淀根因纪律。
3. **确立正确发布流程**：`main` 与 `origin/main` 保持同步，且是 `dev` 的祖先；今后发布在 dev 工作树确认范围收敛后直接 `git push origin dev:main`（fast-forward），无需任何 worktree 或 rebase 绕路。

## 5. 验证方式

- 删除前：`git -C SmallAliceWeb-main-sync status --porcelain=v1` 输出为空（工作区干净、无未提交改动、无 stash）；`git merge-base --is-ancestor main dev` 返回成功（main 是 dev 祖先，删除 worktree 无任何提交丢失）。
- 删除后：`git worktree list` 仅剩主工作树 `D:/code/ruan-cat/SmallAliceWeb 148b930 [dev]`；`ls -d` 确认两个目录均已不存在；`git branch -vv` 确认 `main 752fa45 [origin/main]` 分支完好、与远端同步。
- memorix：resolve 调用返回「Resolved 3 observation(s): #5841, #5844, #5732」；store 返回 obs:5871、obs:5872 创建成功。

## 6. 后续约束

- **禁止重建**任何形式的 main 同步 worktree；发布 `main` 一律走 `git push origin dev:main`（前提：`git merge-base --is-ancestor main dev` 确认 fast-forward 安全）。
- **agent 自建临时资源**（worktree、临时分支、临时目录、临时脚本）必须在**同一会话结束前清理**；「临时」必须附带确定的清理时点，否则视为泄漏。
- **后续会话遇到既存绕路设施**时，必须先问「谁建的、为何建、还必要吗」，再决定复用还是清除；「存在」不等于「正确」。
- **写入 memorix 经验时**必须区分「经过权衡的最优解」与「当时的历史遗留」；记录 workaround 时应标注其适用前提和预期清理时点，防止一次性方案被固化为长期规范。
