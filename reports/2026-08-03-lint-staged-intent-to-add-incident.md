<!-- 有参考意义 -->

# 2026-08-03 lint-staged 对业务代码误报事故复盘报告

## 1. 事故概述

在执行 `cz` 提交 `prompts/index.md` 时，终端显示 `lint-staged` 报告：

```log
Entry 'packages/ai-rag-api/server/runtime/rag-assembly.ts' not uptodate. Cannot merge.
Cannot save the current worktree state
```

表面上看，错误像是 `packages/ai-rag-api/server/runtime/rag-assembly.ts` 被错误纳入了 lint-staged 的格式化范围；实际情况不是业务代码触发了 Prettier，也不是 `lint-staged` 配置把未暂存文件匹配进来了，而是 lint-staged 在提交前创建自动备份时，Git 无法保存当前工作区状态。

## 2. 影响范围

1. 本次提交没有完成，`cz` 流程被 pre-commit hook 中的 `lint-staged` 拦截。
2. `prompts/index.md` 是本次唯一真正进入暂存区、并被 lint-staged 识别的文件。
3. `packages/ai-rag-api/server/runtime/rag-assembly.ts` 和 `packages/ai-rag-api/tests/runtime-assembly.test.ts` 没有被 lint-staged 的任务匹配，也没有被 Prettier 执行。
4. 失败发生在 lint-staged 的 Git 工作流备份阶段，未进入正常的“运行暂存文件任务”阶段。

## 3. 现场证据

### 3.1 lint-staged 配置没有扩大文件来源

当前项目的配置位于 `lint-staged.config.js`：

```js
export default {
	"*": "prettier --experimental-cli --write",
};
```

`"*"` 是 lint-staged 的匹配模式。它只会对 Git 暂存区已经识别出来的文件进行匹配，不等价于把整个工作区递归传给 Prettier。

本次执行 `pnpm exec lint-staged --debug` 时，调试输出明确显示：

```log
Found 1 staged file in git:
  prompts/index.md
Generated task:
  pattern: '*'
  commands: 'prettier --experimental-cli --write'
  fileList:
    prompts/index.md
```

因此，业务文件没有进入 Prettier 的任务参数。

### 3.2 业务文件处于 intent-to-add 状态

在失败现场执行 `git ls-files --debug`，两个业务文件的 index flags 均为 `20004000`，index 中的 blob 大小为 0；同时 `git status --short` 显示：

```log
 M docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md
 A packages/ai-rag-api/server/runtime/rag-assembly.ts
 A packages/ai-rag-api/tests/runtime-assembly.test.ts
MM prompts/index.md
```

这里的 `A` 不是“已经把完整业务代码暂存了”，而是文件被执行过 `git add -N`（`--intent-to-add`）：Git 只在 index 中登记了“这个路径以后会被添加”，并没有把文件内容写入 index。

对应的 index 原始差异为：

```log
:000000 100644 0000000 0000000 A packages/ai-rag-api/server/runtime/rag-assembly.ts
:000000 100644 0000000 0000000 A packages/ai-rag-api/tests/runtime-assembly.test.ts
```

### 3.3 错误发生在备份，不是 lint 任务

`lint-staged --debug` 的关键执行顺序如下：

```log
Found partially staged files: ['prompts/index.md']
Running git command: ['stash', 'create']
error: Entry 'packages/ai-rag-api/server/runtime/rag-assembly.ts' not uptodate. Cannot merge.
Cannot save the current worktree state
```

失败日志没有进入真正的 `Running tasks for staged files` 阶段。也就是说，Git 在 lint-staged 为保护用户未暂存修改而创建自动备份时失败了。

这是 lint-staged 的保护机制与 Git intent-to-add 状态之间的兼容边界问题：lint-staged 默认会创建备份 stash，并且会隐藏部分暂存文件的未暂存修改；当前工作区中存在“index 只有空占位、工作区却有完整内容”的 intent-to-add 文件，Git 无法按 lint-staged 预期保存和合并该工作区状态。

## 4. 根因分析

### 4.1 直接根因

`packages/ai-rag-api/server/runtime/rag-assembly.ts` 和 `packages/ai-rag-api/tests/runtime-assembly.test.ts` 被置于 Git 的 intent-to-add 状态，导致 lint-staged 执行 `git stash create` 备份工作区时失败。

### 4.2 不是根因的因素

1. 不是 `packages/ai-rag-api` 包的源码规范问题。业务文件内容没有被 lint-staged 传给 Prettier。
2. 不是 `lint-staged.config.js` 的 `"*"` 把整个仓库文件扫描进来了。调试输出证明本次只有 `prompts/index.md` 被匹配。
3. 不是 `simple-git-hooks` 调用了错误的文件范围。`simple-git-hooks.mjs` 的 pre-commit 只执行 `npx lint-staged`，文件筛选仍由 lint-staged 基于暂存区完成。
4. 不是 stash 残留导致的恢复失败。本次失败现场没有可用的自动备份 stash，错误发生在 `stash create` 保存阶段。

### 4.3 诱发条件

本次工作区同时存在：

- `prompts/index.md` 的部分暂存状态（`MM`）；
- 两个业务新文件的 intent-to-add 状态（`A`）；
- lint-staged 默认开启自动 stash 备份。

单独存在普通未暂存新文件不会被 lint-staged 当作暂存文件处理；真正触发故障的是 intent-to-add 把新文件放进了 index 的特殊状态。

## 5. 修复过程

本次没有修改业务代码，也没有修改 `lint-staged.config.js` 或 Git hook 配置，因为它们不是根因。

执行了最小范围的状态修复：

```powershell
git reset -- packages/ai-rag-api/server/runtime/rag-assembly.ts packages/ai-rag-api/tests/runtime-assembly.test.ts
```

该命令只移除了两个文件的 intent-to-add index 记录，没有删除或回滚工作区文件。修复后它们恢复为普通未跟踪文件：

```log
?? packages/ai-rag-api/server/runtime/rag-assembly.ts
?? packages/ai-rag-api/tests/runtime-assembly.test.ts
```

随后重新执行 lint-staged：

```powershell
pnpm exec lint-staged --debug
```

结果为：

```log
Found partially staged files: []
Backed up original state in git stash (e85bf0a)
Running tasks for staged files...
prettier --experimental-cli --write
Tasks were executed successfully!
```

## 6. 修复后的验证结果

1. lint-staged 成功完成，退出码为 0。
2. 调试输出再次证明只有 `prompts/index.md` 进入任务文件列表。
3. 自动备份 stash 成功创建并被正常清理，`git stash list` 为空。
4. 两个业务文件内容仍保留在工作区，没有被删除或回滚。
5. `git diff --check` 通过。
6. 当前工作区状态为：

```log
 M docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md
M  prompts/index.md
?? packages/ai-rag-api/server/runtime/rag-assembly.ts
?? packages/ai-rag-api/tests/runtime-assembly.test.ts
```

## 7. 后续操作规范

### 7.1 不要用 `git add -N` 作为普通提交前置步骤

如果文件要提交，应直接使用：

```powershell
git add -- packages/ai-rag-api/server/runtime/rag-assembly.ts packages/ai-rag-api/tests/runtime-assembly.test.ts
git commit
```

如果文件暂时不提交，只保留工作区中的普通未跟踪状态，不要执行 `git add -N`。

如果只是为了查看新文件 diff，可以使用编辑器 diff、`git diff --no-index` 或直接读取文件，不要把 intent-to-add 状态带进 `git commit` 的 pre-commit 流程。

### 7.2 不要通过 `--no-stash` 规避本问题

`lint-staged` 的自动 stash 是为了保护部分暂存文件和未暂存修改。关闭 stash 会降低提交过程中的数据保护能力，不能作为本项目的默认修复方案。

### 7.3 提交前检查特殊 index 状态

遇到 lint-staged 再次出现 Git error 时，先执行：

```powershell
git status --short
git diff --cached --raw
git ls-files --debug -- <疑似文件>
```

如果发现新文件的 index blob 为 `0000000`、工作树状态为 `A`，先执行：

```powershell
git reset -- <文件路径>
```

然后重新确认：

```powershell
git status --short
git diff --cached --name-only
pnpm exec lint-staged --debug
```

## 8. 结论

本次事故属于“Git intent-to-add 状态导致 lint-staged 自动备份失败”，不是业务包代码被误 lint，也不是项目 lint-staged 配置被破坏。

当前 git-commit 流程已经通过真实工作区验证恢复正常。后续只要避免在提交前留下 `git add -N` 产生的 intent-to-add 文件，现有 `simple-git-hooks -> lint-staged -> prettier` 链路可以继续使用。
