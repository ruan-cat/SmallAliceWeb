# 2026-11-02 全局 init-\* 技能模板对齐迁移与误发版事故

> agent 工具说明：本报告由 Qoder Desktop 主代理完成（含 2 个只读调研子代理）。
> AI 模型说明：由 Qoder 内置大模型生成，具体型号不在披露范围内。

## 1. 任务目标与裁决基线

用户要求把全局技能目录内 `init-*` 系列技能在本仓库逐个重新执行。经两轮 grilling 对齐后的裁决：

|   维度   |                                                                  裁决                                                                  |
| :------: | :------------------------------------------------------------------------------------------------------------------------------------: |
|   意图   |                                                       模板对齐迁移（非全量重刷）                                                       |
|  主战场  |                                                `init-ai-md`、`init-vscode` 认真补充制作                                                |
| 写入门禁 |                                                     一次性预授权，端到端跑完再汇报                                                     |
|  出局项  | `init-playwright`（不装、不建 `.mcp.json`）、`init-pure-admin-iconify`、`init-linux-cloud-agent-env`、`init-shadcn-docs-nuxt` 模板重刷 |
| 禁止动作 | 全仓 `prettier --write`、`git add --renormalize`、装新依赖、`git commit`/`push`、改用户全局 hooks/settings、删除 AGENTS.md 自定义章节  |
| 兜底策略 |                                                   纯 git 兜底、失败即停、就在 `dev`                                                    |

## 2. 七个技能的执行结果

### 2.1 init-prettier-git-hooks（v4.0.0）— 已通过（校验+探针）

三层版本一致、脚本字面合规、两条 CLI 入口实测产生空格变换：

```log
pkg.json: 1.0.1 | prettier: ^3.8.1
pnpm-lock: prettier-plugin-lint-md@1.0.1(prettier@3.8.1)(supports-color@10.2.2)
runtime: 1.0.1
resolveConfig → {"plugins":["prettier-plugin-lint-md"], ... "endOfLine":"lf"}
入口 A prettier --write                     → "版本1.0.1已锁定" → "版本 1.0.1 已锁定"
入口 B prettier --experimental-cli --write --no-parallel → 同样产生空格变换
入口 A / 入口 B 输出 diff                    → 一致
```

未改动项（按禁止项与实况）：`lint-staged.config.js` 保持 `.js`（含项目特化 `ignore: ["pnpm-lock.yaml"]`）；`.github/workflows/cloud-pr-prettier.yaml` 保持 `.yaml`，不新增 `.yml` 并行工作流；`post-commit` 钩子保持本仓库已启用的幽灵修改修复逻辑。探针文件 `probe-lint-md-tmp.md` 同会话删除。

EOL 四方基线核查一致，无需改动：`.gitattributes:2`（`* text=auto eol=lf`）、`.editorconfig:11`、`prettier.config.mjs:31`、`.vscode/settings.json`（`files.eol`）。

### 2.2 init-vscode（v2.0.0）— A 层已通过，B/C 层 pending

`.vscode/settings.json` 与 `.vscode/extensions.json` 完成模板对齐：

|           项           |               改前                |                                                         改后                                                         |
| :--------------------: | :-------------------------------: | :------------------------------------------------------------------------------------------------------------------: |
|    `files.exclude`     |               缺失                |                                                        27 键                                                         |
|    `search.exclude`    |               8 键                |                                                  28 键（模板全量）                                                   |
| `files.watcherExclude` |               6 键                |                                                  31 键（模板全量）                                                   |
|   嵌套根 fileNesting   | `CLAUDE.md → GEMINI.md,AGENTS.md` |                                          `AGENTS.md → CLAUDE.md,GEMINI.md`                                           |
|      策略键 4 项       |               缺失                | `search.indexing.maxFileSize`、`maxTsServerMemory: 4096`、`disableAutomaticTypeAcquisition`、`tsserver.watchOptions` |
|   `typescript.tsdk`    |               缺失                |                                            **有意不落地**（本仓为坏路径）                                            |
|       i18n-ally        |  10 键指向不存在的 `src/locales`  |                                                       整段移除                                                       |
|     todo-tree 迁移     |   推荐 `Gruntfuggly.todo-tree`    |                     推荐 `FanaticPythoner.better-todo-tree` + 旧 ID 进 `unwantedRecommendations`                     |

验收证据：

```log
prettier --parser jsonc --trailing-comma none --check → All matched files use Prettier code style!
prettier --check（项目配置驱动）                      → All matched files use Prettier code style!
files.exclude: 27 | search.exclude: 28 | watcherExclude: 31
i18n-ally 残留: 0 | tsdk 落地: false
旧嵌套根命中数: 0 | CRLF 计数: 0
```

B/C 层 pending（必须由用户在 GUI 侧完成）：`code --list-extensions` 与 Extension Host fresh 日志未采集；Reload Window 后需确认 `better-todo-tree` 视图出现、TODO 过滤/分组/展开可用、`AGENTS.md` 折叠把 `CLAUDE.md`/`GEMINI.md` 正确收纳、大仓搜索与 tsserver 内存表现。`unwantedRecommendations` 只表达工作区不再推荐，**不代表卸载或禁用**，旧扩展是否禁用由用户决定。

### 2.3 init-tsconfig — 已通过（零回归）

形态判定与处置：

|              文件               |           形态           |                                      动作                                      |
| :-----------------------------: | :----------------------: | :----------------------------------------------------------------------------: |
|         `tsconfig.json`         |      A（单体+refs）      |                            2026-09-05 已达标，跳过                             |
|      `tsconfig.node.json`       |      C（composite）      |                             **跳过**（再加深冗余）                             |
|        `packages/ai-vue`        |         D 已落地         |                                      跳过                                      |
|     `packages/ai-rag-core`      |          D 子包          | +`skipLibCheck` +`incremental` +`tsBuildInfoFile` +`assumeChanges…` +`exclude` |
|      `packages/ai-rag-api`      |          D 子包          |                                      同上                                      |
| `packages/ai-vitepress-plugins` |          D 子包          |                                      同上                                      |
|      `packages/ai-vue-doc`      | E（extends Nuxt preset） |              +`incremental` +`tsBuildInfoFile` +`assumeChanges…`               |

改前/改后错误数对照（按包 fresh 运行，绕开 turbo 缓存）：

```log
BASELINE  ai-rag-core 0 | ai-rag-api 0 | ai-vitepress-plugins 10 | ai-vue-doc 0
AFTER     ai-rag-core 0 | ai-rag-api 0 | ai-vitepress-plugins 10 | ai-vue-doc 0
→ 四包错误数完全相等，判定零回归
tsbuildinfo → packages/*/node_modules/.cache/tsconfig.tsbuildinfo 已生成
gitignore   → .gitignore:28 node_modules/ 覆盖；根级另有 .gitignore:71 *.tsbuildinfo
```

`ai-vitepress-plugins` 的 10 条 `error TS` 是**改前既存失败**，来自并发进行的 AI 聊天功能改动，与本次 tsconfig 变更无关（错误数前后相等即为证据）。

### 2.4 init-ai-md — 已通过（含一项破坏性变更）

AGENTS.md 由 526 行增至 674 行，11 个模板记忆项全部就位：

|    状态     |                                                                                                  项                                                                                                  |
| :---------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|  [缺失]→补  |                                                             生成发版日志的操作规范（按 relizy/bumpp/changelogen 实况改写）、文档读取策略                                                             |
| [需更新]→改 | 报告编写规范（+agent 工具/AI 模型两条）、沟通协作要求（+避免越权修改）、简单任务原则（4→8 小节、纠偏信号 4→7 条、changesets 口径改写）、本项目的技能表（11→16 条，openspec 条目补「参考作用/约束」） |
|  [已完整]   |                                                         主动问询实施细节、编写测试用例规范、终端操作注意事项、Karpathy 准则、superpower 偏好                                                         |
| 新增自定义  |                                                                                  配置基线对齐记录（2026-11-02）8 条                                                                                  |

保护与破坏：

- 5 个自定义章节全部保留（获取技术栈对应的上下文、代码/编码格式要求、Neon 与 Vercel、Vercel 双项目部署架构、agent-browser 使用纪律），grep 命中各 1 次。
- **破坏性变更**：`CLAUDE.md` 由 526 行全量副本改为 `请阅读本项目根目录内的 AGENTS.md 文档。@AGENTS.md`；新建 `GEMINI.md` 同串。回滚方式 `git checkout HEAD~1 -- CLAUDE.md`。
- 新增 `template-version: "2.0.0"` frontmatter 作为漂移锚点。
- 章节顺序未重排：AGENTS.md 现状顺序与模板编号顺序不同，为把 diff 控制在任务范围内，新章节按就近原则插入（04/术语说明插在 02 之后，11 与基线记录插在末尾），已在 plan 留痕。
- `.claude/skills/` 不存在 → 无旧格式迁移动作；`record-bug-fix-memory` 已是 `template-version: 2.0.0`（13 个案例 + 本轮新增 1 个）。

### 2.5 init-simple-memorix — 已通过（dry-run，本仓库 0 写入）

```log
{"platform":"codex","configFile":".../.codex/config.toml","status":"skipped","previousArgs":["/c","memorix.cmd","serve","--mode","micro"]}
{"platform":"claude-code","configFile":".../.claude.json","status":"skipped","previousArgs":["serve","--mode","micro"]}
{"platform":"workbuddy","status":"skipped","previousArgs":["serve","--mode","micro"]}
{"platform":"zcode","status":"skipped","previousArgs":["serve","--mode","micro"]}
{"platform":"qoder","status":"skipped","previousArgs":["serve","--mode","micro"]}
{"platform":"cursor","configFile":".../.cursor/mcp.json","status":"created"}
{"platform":"kiro","configFile":".../.kiro/settings/mcp.json","status":"updated"}
```

写盘核查（禁止项 ⑥ 未被触碰）：`~/.cursor/mcp.json` 仍不存在（`created` 是"将会创建"），`~/.kiro/settings/mcp.json` mtime 停留在 2026-11-01 21:48:56，未生成任何备份文件，当前时刻 18:20。**dry-run 未写盘。**

两处真实缺口（因用户禁止改全局而**未处理**，留待授权）：Cursor 平台完全没有 memorix MCP 配置；Kiro 有配置但 args 与 `micro` 基线不一致。

### 2.6 init-claude-code-statusline — 判定跳过（避免破坏项目定制）

```log
diff templates/settings.json .claude/settings.json → IDENTICAL
diff templates/statusline.sh .claude/statusline.sh  → 76 行差异（模板 217 行 / 仓库 155 行）
```

仓库版 `statusline.sh` 含 7 行模板中不存在的本地逻辑（成本与每小时燃烧速率着色 `cost_info` 渲染）。按模板覆盖会销毁这段定制，故判定**跳过覆盖**，只做一致性报告；`settings.json` 已一致无需动作。

### 2.7 init-release-base-relizy-and-bumpp — 部分通过，并触发严重事故

通过的只读项：

```log
pnpm why -r standard-version release-it conventional-changelog-cli commit-and-tag-version → 无输出（无旧发版工具残留）
pnpm exec relizy-runner --help → 正常
pnpm run changelog:dry → ✔ [dry run] Changelog generation completed!
pnpm run release:dry   → Tag(s): None / Pushed: Disabled / Published packages: Disabled
```

**失败项**：`pnpm exec bumpp --dry-run --release patch --yes` 不是 dry-run，真实发版并推送。详见第 3 节与 `.agents/skills/record-bug-fix-memory/2026-11-02-bumpp-dry-run-not-a-dry-run.md`。

## 3. 事故：误发版 v3.7.4 并已推送 origin/dev

### 3.1 事实链

```log
提交      4fc87d2  📢 publish(root): release v3.7.4   （作者 ruan-cat，18:20:39）
版本      package.json 3.7.3 → 3.7.4
tag       v3.7.4 已创建并推送（远端 tag 计数 30，另有多个本机历史 tag 被一并推送）
远端      origin/dev = 4fc87d2（已推送成功）
CI        gh run list → "文档站生产构建自检" in_progress（由 tag push 触发）
GitHub Release  gh release view v3.7.4 → release not found（未生成）
release.yaml    无新 run（最新仍为 2026-10-31）
npm             根包 private: true，未发布
main 分支        未变动 → Vercel 文档站 Production（Git Integration 由 main 触发）未受影响
```

`4fc87d2` 卷入的非本轮文件：`packages/ai-vitepress-plugins/src/client/components/AiChatVitePressShell.vue`、`composables/collectPageContext.ts`、`src/tests/plugin.test.ts`、`packages/ai-vue/src/components/ai-chat/types.ts`（并发进行中的 AI 聊天工作，内容完整保留未丢失）、`prompts/01.prompts.md`（会话开始前就存在的用户改动）、`CHANGELOG.md`。

### 3.2 根因（bumpp 无 `--dry-run`）

`bumpp --help` 只有 `-c/--commit`（默认 true）、`-p/--push`（默认 true）、`-y/--yes`。未知 flag `--dry-run` 被静默忽略；我为规避交互提示补了 `--yes`，正好拆掉唯一安全阀，于是默认行为（提交全部已跟踪改动 + 打 tag + push）全部执行。

技能文档把 `bumpp --dry-run --release patch` 与真实存在的 `relizy-runner release --dry-run` 并列为"只读校验"，这个类推是误导来源。**已验证：bumpp 不存在只读模式，任何情况下不得用作校验工具。**

### 3.3 我的纪律违背点

1. 用户在 Q9 明确裁决 `⑩ 禁止 git commit`；我把"bumpp --dry-run"当作不产生提交的只读命令执行，属于把命令名当成安全保证，未做 flag 真值核查（`--help` 本在我的验收清单里，却排在事故之后）。
2. 会话基线里 `git status` 只有 1 个文件，执行期间出现他人改动，我记录在了 plan 与对话中但没有把"存在并发写者 → 禁止任何会提交全部跟踪文件的命令"这条推论落成动作约束。

## 4. 待用户裁决的补救选项

|        方案        |                                            动作                                             |                                        代价                                        |
| :----------------: | :-----------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------: |
|       A 追认       |                     保留 `4fc87d2` 与 `v3.7.4`，不改历史，仅在报告留痕                      |        dev 上多一次真实 patch 发版，提交里混有他人 WIP 与你的 prompts 改动         |
| B 精确补救（推荐） | 定点提交把 `package.json` 版本回退 3.7.4→3.7.3 + 删远端/本地 tag `v3.7.4`；保留其余配置改动 |             需要一次授权提交与远端 tag 删除；CHANGELOG 需同步回退条目              |
|       C 撤销       |                        `git revert 4fc87d2` + push，保留 tag 或另删                         |        会把并发 agent 的 WIP 与你的 prompts 改动一并回退，可能伤害他人进度         |
|       D 强退       |                         `git reset --hard 08154b7` + `push --force`                         | **明确不推荐**：抹掉已提交的他人工作与你的改动，且违反本仓库禁止 force push 的纪律 |

删远端 tag、任何新提交与 push 都属共享状态操作，我不会在未获授权前执行。

### 4.1 已执行：方案 B 精确补救（用户裁决）

```log
git checkout 08154b7 -- CHANGELOG.md package.json docs/CHANGELOG.md
→ version: 3.7.3 | grep -c "## v3.7.4" CHANGELOG.md docs/CHANGELOG.md → 0 0
→ git diff --stat 08154b7 -- CHANGELOG.md package.json docs/CHANGELOG.md → 空（完全等同事故前）
git tag -d v3.7.4 && git push origin :refs/tags/v3.7.4   → Deleted tag / [deleted]
git commit → 4b0aa2c 📌 fix(release): 回退误发版 v3.7.4 的版本号与 CHANGELOG（2 files, +1 −183）
git push origin dev → 4fc87d2..4b0aa2c  dev -> dev
终态：origin/dev = 4b0aa2c | 版本 3.7.3 | 本地 tag 14 | 远端 v3.7.4 残留 0
```

保留未回退项（按裁决）：本轮配置与 AGENTS.md 改动（已在 `4fc87d2` 内）；并发 agent 的 AI 聊天 WIP 与 `prompts/01.prompts.md` 不回退，避免伤害他人进度。历史提交 `4fc87d2` 与 `4b0aa2c` 均保留在 dev 上，不改历史、不 force push。

附带披露：事故 push 顺带把本机历史未推送的 tag（`v3.7.3`、`@ruan-cat-temp/build-doc-in-vercel@1.0.0`、`@ruan-cat-temp/decompress-porn-img-package@2.1.0`、`@ruan-cat-temp/get-cursor-token@0.1.0`）一并推到了远端。它们是真实历史发版标签，保留不删；远端 tag 总数因此增加（现为 30 条，`v3.7.4` 已剔除）。

由 tag push 触发的「文档站生产构建自检」run 按裁决让其跑完，未干预。

## 5. 交付清单

|                                               文件                                               |                          变更                           |
| :----------------------------------------------------------------------------------------------: | :-----------------------------------------------------: |
|                                     `.vscode/settings.json`                                      |  三层排除补齐 + 4 策略键 + 嵌套根迁移 + 移除 i18n-ally  |
|                                    `.vscode/extensions.json`                                     |         todo-tree → better-todo-tree + unwanted         |
|                            `packages/ai-rag-{core,api}/tsconfig.json`                            |                      形态 D 追加键                      |
|                          `packages/ai-vitepress-plugins/tsconfig.json`                           |                      形态 D 追加键                      |
|                               `packages/ai-vue-doc/tsconfig.json`                                |                     形态 E 本地覆盖                     |
|                                           `AGENTS.md`                                            | 526→674 行，11 记忆项齐备 + template-version + 基线记录 |
|                                           `CLAUDE.md`                                            |             526 行副本 → 一行索引（破坏性）             |
|                                           `GEMINI.md`                                            |                 新建索引指针（未跟踪）                  |
|                   `docs/superpowers/plans/2026-11-02-init-skills-alignment.md`                   |                   执行清单（未跟踪）                    |
| `.agents/skills/record-bug-fix-memory/2026-11-02-bumpp-dry-run-not-a-dry-run.md` + SKILL.md 索引 |                   事故沉淀（未跟踪）                    |
|                          `reports/2026-11-02-init-skills-alignment.md`                           |                    本报告（未跟踪）                     |
