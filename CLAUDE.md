## 本项目的技能表

- `record-bug-fix-memory` — `.agents/skills/fix-bug/record-bug-fix-memory/SKILL.md` — bug 修复后的经验与事故记录沉淀（非调试流程本身）。
  - **存储架构**：双层存储。SKILL.md 只放流程指导和摘要索引，详细案例存储在同目录下的独立 `YYYY-MM-DD-{slug}.md` 文件中。
  - **阅读方式**：使用此技能前，先读 SKILL.md 了解流程，再根据「案例索引」章节按需读取相关的独立案例文件。
  - **写入方式**：新增经验时，创建独立案例文件，同时在 SKILL.md 的「案例索引」追加摘要。禁止将完整事故正文写入 SKILL.md。

- `openspec-apply-change`
  - 路径：`.agents/skills/openspec-apply-change/SKILL.md`
  - 用途：Implement tasks from an OpenSpec change.
  - 触发时机：当用户要求开始实施、继续实施或处理 OpenSpec 变更中的任务时使用。

- `openspec-archive-change`
  - 路径：`.agents/skills/openspec-archive-change/SKILL.md`
  - 用途：Archive a completed change in the experimental workflow.
  - 触发时机：当用户要求归档已完成的变更时使用。

- `openspec-bulk-archive-change`
  - 路径：`.agents/skills/openspec-bulk-archive-change/SKILL.md`
  - 用途：Archive multiple completed changes at once.
  - 触发时机：当用户要求批量归档多个已完成的变更时使用。

- `openspec-continue-change`
  - 路径：`.agents/skills/openspec-continue-change/SKILL.md`
  - 用途：Continue working on an OpenSpec change by creating the next artifact.
  - 触发时机：当用户要求推进变更、创建下一个制品或继续工作流时使用。

- `openspec-explore`
  - 路径：`.agents/skills/openspec-explore/SKILL.md`
  - 用途：Enter explore mode - a thinking partner for exploring ideas, investigating problems, and clarifying requirements.
  - 触发时机：当用户想要在变更前或变更中思考问题时使用。

- `openspec-ff-change`
  - 路径：`.agents/skills/openspec-ff-change/SKILL.md`
  - 用途：Fast-forward through OpenSpec artifact creation.
  - 触发时机：当用户要求快速创建所有实施所需制品而不逐步确认时使用。

- `openspec-new-change`
  - 路径：`.agents/skills/openspec-new-change/SKILL.md`
  - 用途：Start a new OpenSpec change using the experimental artifact workflow.
  - 触发时机：当用户要求创建新功能、修复或结构化变更时使用。

- `openspec-onboard`
  - 路径：`.agents/skills/openspec-onboard/SKILL.md`
  - 用途：Guided onboarding for OpenSpec.
  - 触发时机：当用户首次使用 OpenSpec 或需要引导式教学时使用。

- `openspec-sync-specs`
  - 路径：`.agents/skills/openspec-sync-specs/SKILL.md`
  - 用途：Sync delta specs from a change to main specs.
  - 触发时机：当用户要求将变更中的 delta spec 同步到主 spec 时使用。

- `openspec-verify-change`
  - 路径：`.agents/skills/openspec-verify-change/SKILL.md`
  - 用途：Verify implementation matches change artifacts.
  - 触发时机：当用户要求验证实施是否完整、正确且一致时使用。

## 简单任务的高效执行原则

当用户交代的任务范围明确清晰时，必须**直接行动**，禁止进行不必要的大范围侦察。

### 1. 判断任务规模，选择正确的行动姿态

|             任务信号             |        正确行动        |
| :------------------------------: | :--------------------: |
| 用户通过 `@文件` 明确了操作范围  | 直接读该文件，立即动手 |
|  用户说"帮我改这个"、"写个日志"  | 行动优先，缺什么补什么 |
| 用户涉及多包架构改动、新功能设计 |     先侦察，再行动     |

**核心原则**：用户提供的上下文（@文件引用、对话内容、当前打开文件）就是最直接的线索，优先使用，不要用命令重新发现已知信息。

### 2. 禁止行为清单

以下行为在**简单任务**（单文件改动、写 changeset、写提交信息等）中是被禁止的：

- 禁止连续执行超过 3 次 `git log` 来"了解全貌"
- 禁止在明确知道目标文件的情况下，仍去扫描整个项目目录
- 禁止把"读遍所有相关文档"当作行动前置条件
- 禁止在用户已给出 @文件 的情况下，用命令重新搜索文件位置

### 3. 对用户纠偏提示立即响应

当用户发出以下信号时，必须**立即停止对当前路径的死磕**，回归最小行动路径：

- "太复杂了"
- "不要反复查询"
- "直接做就行"
- "按要求做即可"

正确反应：停止当前侦察行为 → 明确当前已知信息 → 直接执行最核心的操作步骤。

### 4. 简单任务的标准执行路径

以"为某文件修改编写更新日志"为例，正确路径只有 3 步：

1. 读目标文件，理解改了什么
2. 执行 `pnpm dlx @changesets/cli add --empty`，重命名文件，写入内容
3. 提交

不需要查 git log，不需要扫描全部 tags，不需要对比所有包的版本号。

## 主动问询实施细节

在我与你沟通并要求你具体实施更改时，难免会遇到很多模糊不清的事情。

请你**深度思考**这些`遗漏点`，`缺漏点`，和`冲突相悖点`，**并主动的向我问询这些你不清楚的实施细节**。请主动使用 claude code 内置的 `AskUserQuestion` 工具，将你不清楚的内容设计成一些列问题，并询问我，向我索要细节，或着与我协作沟通。

我会与你共同补充细化实现细节。我们会先迭代出一轮完整完善的实施清单，然后再由你亲自落实实施下去。

## 编写测试用例规范

1. 请你使用 vitest 的 `import { test, describe } from "vitest";` 来编写。我希望测试用例格式为 describe 和 test。
2. 测试用例的文件格式为 `*.test.ts` 。
3. 测试用例的目录一般情况下为 `**/tests/` ，`**/src/tests/` 格式。
4. 在对应 monorepo 的 tests 目录内，编写测试用例。如果你无法独立识别清楚到底在那个具体的 monorepo 子包内编写测试用例，请直接咨询我应该在那个目录下编写测试用例。

## 沟通协作要求

### `计划模式`

在`计划模式`下，请你按照以下方式与我协作：

1. 你不需要考虑任何向后兼容的设计，允许你做出破坏性的写法。请先设计一个合适的方案，和我沟通后再修改实施。
2. 如果有疑惑，请询问我。
3. 完成任务后，请告知我你做了那些破坏性变更。

请注意，在绝大多数情况下，我不会要求你以这种 `计划模式` 来和我协作。

## 获取技术栈对应的上下文

在处理特定技术栈相关的问题时，你应该主动获取对应的上下文文档和最佳实践。

### claude code skill

- 编写语法与格式： https://code.claude.com/docs/zh-CN/skills
- 最佳实践： https://platform.claude.com/docs/zh-CN/agents-and-tools/agent-skills/best-practices
- 规范文档： https://agentskills.io/home

## 编码前思考、简洁优先、精准修改与目标驱动执行

本章节整合自 `multica-ai/andrej-karpathy-skills` 对 LLM 编码陷阱的总结，用于降低 AI agent 在写代码、改代码、重构代码时的常见错误。

这些准则偏向**谨慎和可验证**，而不是追求最快动手。遇到拼写修正、显而易见的一行改动、用户已经明确要求"直接做"的简单任务时，仍应遵循"简单任务的高效执行原则"，走最小行动路径。

### 问题背景

LLM 在编码任务中常见的问题不是"不会写代码"，而是会在不该自行决定的地方默默做决定：

- 代替用户做错误假设，然后不加确认地继续执行。
- 隐藏自己的困惑，不主动说明哪里不确定。
- 遇到多种解释时，不呈现分歧和权衡，而是静默选择一种。
- 在应该提出异议时不反驳，导致复杂方案一路推进。
- 喜欢增加抽象、配置项、兼容层和"未来可能有用"的能力。
- 顺手修改相邻代码、注释、格式或命名，制造与任务无关的 diff。
- 删除或改写自己没有充分理解的旧代码，尤其是看似无用但可能承载历史约束的代码。

本章节的目标是把这些风险转化为明确的执行纪律：先澄清，再简化；只改必要内容；每一步都有可验证的成功标准。

### 核心原则概览

| 原则         | 主要解决的问题                             |
| :----------- | :----------------------------------------- |
| 编码前思考   | 错误假设、隐藏困惑、缺少权衡、没有及时澄清 |
| 简洁优先     | 过度工程、抽象泛滥、为了未来场景提前设计   |
| 精准修改     | 无关编辑、顺手重构、删除不理解的代码       |
| 目标驱动执行 | 成功标准模糊、验证不足、靠盲改推进任务     |

### 编码前思考

不要假设，不要隐藏困惑，要把关键权衡摆出来。

在开始实现前，先检查自己是否真的理解了任务：

- 明确说明当前假设。只要假设会影响实现路径，就不要把它藏在心里。
- 如果存在多种解释，列出这些解释，并说明各自会导致什么实现差异。
- 如果需求不清楚，停下来指出不清楚的点，向用户询问。
- 如果用户提出的方案明显复杂、风险高或与目标不匹配，应该礼貌指出，并给出更简单的替代方案。
- 如果只是小范围、低风险、目标明确的任务，可以说明采用的合理默认假设，然后直接执行。

不要用"我先实现一个通用版本"来掩盖需求不清。通用版本通常意味着你正在替用户决定未确认的未来需求。

### 简洁优先

用能解决当前问题的最少代码完成任务，不要写推测性功能。

执行时遵循这些约束：

- 不添加用户没有要求的功能。
- 不为只使用一次的逻辑创建抽象。
- 不为了"灵活性"添加未要求的配置项、插件点、策略对象或兼容层。
- 不为实际上不可能发生的场景堆错误处理。
- 不为了展示完整架构而扩大文件、模块或 API 的边界。
- 如果你写了 200 行，但 50 行就能清楚解决问题，应该主动收缩实现。

判断是否过度复杂，可以问自己：

- 资深工程师会不会认为这比需求本身重很多？
- 当前抽象是否已经有两个以上真实调用方？
- 这个配置项是否已经被用户或现有系统明确需要？
- 这段错误处理是否对应真实可达的失败路径？
- 如果明天删除这个功能，当前设计是否会留下大量无意义结构？

简洁不是草率。简洁意味着实现边界清楚、依赖少、验证直接、后续读者容易判断为什么需要这些代码。

### 精准修改

只触碰必须触碰的内容，只清理自己造成的问题。

编辑已有代码时，必须尊重当前系统的局部风格和历史边界：

- 不要顺手"改进"相邻代码、注释、格式或命名。
- 不要重构没有坏、也不在任务范围内的代码。
- 匹配已有代码风格，即使你个人更喜欢另一种写法。
- 看到无关死代码时，可以在总结中提及，不要擅自删除。
- 不要把格式化整个文件当作完成小改动的副作用。
- 不要因为读不懂旧逻辑就删除它；读不懂时应先调查或询问。

当你的改动制造了孤儿代码时，应清理这些由你造成的遗留物：

- 删除因为本次改动而变成未使用的导入。
- 删除因为本次改动而变成未使用的变量、函数或类型。
- 删除因为本次改动而失效的局部注释或测试数据。

不要清理本次任务之前就已经存在的死代码，除非用户明确要求。

最终自检标准：每一行 diff 都应该能直接追溯到用户请求、实现该请求所需的必要调整，或本次改动产生的必要清理。

### 目标驱动执行

先定义成功标准，再循环验证直到达成。

不要只把用户的话理解成"要做什么"，还要把它转化成"怎样证明已经做好"。例如：

| 用户指令   | 更好的目标表达                               |
| :--------- | :------------------------------------------- |
| 添加验证   | 为无效输入补测试，再让测试通过               |
| 修复 bug   | 先写出能复现问题的测试或最小复现，再让它通过 |
| 重构某模块 | 保证重构前后现有测试通过，行为不变           |
| 优化构建   | 给出构建命令、耗时或错误消失的验证证据       |
| 更新文档   | 检查链接、路径、命令和示例是否与实际文件一致 |

多步骤任务应使用简短计划，并为每一步绑定验证方式：

```markdown
1. 调整模板内容 -> 验证：标题层级和语言符合模板规范
2. 同步版本号 -> 验证：marketplace 与 plugin manifest 版本一致
3. 更新 changelog -> 验证：版本节、日期、分类和 bullet 可扫读
```

强成功标准可以让 agent 独立推进并及时收敛。弱成功标准，例如"让它能用""优化一下""整理一下"，通常会导致反复猜测和返工。

### AI 实践补充

在实际协作中，除了四项核心原则，还应遵循下面的 agent 执行纪律：

- **先识别任务类型**：简单任务直接做；多文件、多包、发布、架构和流程变更先列清范围与验证点。
- **先读最近相关上下文**：读目标文件、相邻模板、现有 changelog 或测试，不要为了"了解全貌"无边界扫描。
- **显式记录关键假设**：假设影响版本号、发布等级、文件落点、兼容策略时，必须告诉用户或请求确认。
- **让每一步能回滚和解释**：每次编辑只覆盖一个清楚意图，避免把内容改写、版本升级、格式整理和无关清理混在一起。
- **失败时先定位根因**：测试、构建、校验失败后，先读错误和相关代码，不要连续盲改。
- **验证证据要具体**：优先给出命令、文件、diff、测试结果、解析结果，而不是"应该可以"。
- **保护用户改动**：工作区已有改动默认属于用户；除非用户明确要求，不要撤销、覆盖、提交或重新暂存这些改动。
- **避免流程压过目标**：技能、规范和流程用于服务任务。如果流程与用户明确意图冲突，应先说明冲突并按用户意图收敛。
- **保持输出可扫读**：面向人类的 changelog、报告、说明文档，要用短句和分组表达，不要把多个原因、文件和效果塞进一条长句。
- **完成前读 diff**：确认改动范围、标题层级、格式、语言和验证结果都符合目标，再声称完成。

### 生效判断

这些准则真正生效时，应该能观察到以下信号：

- diff 更小，且无关文件和无关格式改动明显减少。
- 因过度抽象、过度配置、过度兼容导致的返工减少。
- 澄清问题出现在实现之前，而不是错误实现之后。
- 代码修改更贴近现有风格，局部边界更稳定。
- PR、提交或补丁更干净，每一块改动都有清楚理由。
- 测试、构建、文档检查或手动验证证据更具体。
- 用户纠偏次数减少，任务能围绕可验证目标向前推进。

## 使用 superpower 技能的个人偏好

本章节记录用户使用 superpower 系列技能时的固定个人偏好。执行 `brainstorming`、`writing-plans`、`executing-plans` 等 superpower 工作流时，优先遵循这些偏好；除非用户在当前对话中明确要求例外，不要自行改成其他默认流程。

### superpower 产物必须使用中文

使用 `brainstorming` 技能生成的 `docs\superpowers\specs` 规格规划文件，以及 `docs\superpowers\plans` 计划执行清单文件，必须使用简体中文编写。

具体要求如下：

- 规格文件的标题、正文、方案说明、取舍分析、验收标准和风险说明必须使用简体中文。
- 计划文件的阶段划分、任务清单、执行步骤、验证方式和完成状态必须使用简体中文。
- 尤其是 plan 执行任务清单，不要写成英文任务项。
- 只有技能名、文件路径、命令、分支名、包名、API 名称等必要技术标识可以保留英文。
- 如果 superpower 技能自带示例是英文，也要在落地到本项目的 Markdown 文件时改写为中文表达。

这条偏好用于纠正 superpower 技能在实际执行中偶尔生成英文 Markdown 的问题。项目级 AI 记忆文件中必须明确强调：由 superpower 技能生成的规格文件和计划文件，特别是 plan 任务清单文件，必须是中文内容。

### superpower 产物不要擅自标记完成

使用 `brainstorming`、`writing-plans`、`executing-plans` 等 superpower 工作流生成 `docs\superpowers\specs` 或 `docs\superpowers\plans` 文档时，禁止在文档顶部或正文中擅自添加 `<!-- 已完成 -->`、`已完成`、`完成` 等状态标记。

只有当对应任务已经真实实施、验证完成，并且用户明确认可该阶段已经完成时，才能记录完成状态。用户只是认可方案或 spec，不代表实施任务已经完成；不能用 "已完成" 误导后续查找和判断。

### superpower 流程不要擅自 git commit

使用 superpower 技能时，即使技能文档写有"写完设计文档并 commit"之类默认流程，也不能擅自执行 `git commit`。提交会影响用户查找文件和管理工作区，必须等用户在当前对话中明确要求 "提交" "git commit" 或给出等价授权后才能提交。

如果技能默认流程与用户当前偏好冲突，以用户当前偏好为准：只写文件、说明状态、等待用户决定是否提交。需要提交时，也必须只暂存本轮会话明确涉及的文件，不要把无关 dirty 文件纳入。

### executing-plans 不默认使用 git worktree

使用 `executing-plans` 技能执行任务时，不要默认创建或切换到 git worktree。用户不喜欢默认的 git worktree 执行方式。

分支使用规则如下：

- 当前 AI 代理在哪个分支内工作，就优先在当前分支内开始执行任务。
- 如果当前分支是 `dev`，直接在 `dev` 分支完成开发、测试和文档编写。
- 如果当前分支是 `main`，先检查是否存在 `dev` 分支；如果存在，优先切换到 `dev` 分支再完成开发与编写。
- 如果当前分支是 `main` 且不存在 `dev` 分支，不要自行创建 worktree；先向用户确认是在 `main` 继续，还是创建或切换到其他开发分支。
- 只有当用户明确要求隔离工作区、并行分支开发或使用 worktree 时，才采用 git worktree 流程。

切换分支前必须先检查工作区状态。若存在未提交修改，先判断这些修改是否会影响切换；不要覆盖、丢弃或回滚用户已有改动。

## 代码/编码格式要求

### 1. markdown 文档的 table 编写格式

每当你在 markdown 文档内编写表格时，表格的格式一定是**居中对齐**的，必须满足**居中对齐**的格式要求。

### 2. markdown 文档的 vue 组件代码片段编写格式

错误写法：

1. 代码块语言用 vue，且不带有 `<template>` 标签来包裹。

```vue
<wd-popup v-model="showModal">
  <wd-cell-group>
    <!-- 内容 -->
  </wd-cell-group>
</wd-popup>
```

2. 代码块语言用 html。

```html
<wd-popup v-model="showModal">
	<wd-cell-group>
		<!-- 内容 -->
	</wd-cell-group>
</wd-popup>
```

正确写法：代码块语言用 vue ，且带有 `<template>` 标签来包裹。

```vue
<template>
	<wd-popup v-model="showModal">
		<wd-cell-group>
			<!-- 内容 -->
		</wd-cell-group>
	</wd-popup>
</template>
```

### 3. javascript / typescript 的代码注释写法

代码注释写法应该写成 jsdoc 格式。而不是单纯的双斜杠注释。比如：

不合适的双斜线注释写法如下：

```ts
// 模拟成功响应
export function successResponse<T>(data: T, message: string = "操作成功") {
	return {
		success: true,
		code: ResultEnum.Success,
		message,
		data,
		timestamp: Date.now(),
	};
}
```

合适的，满足期望的 jsdoc 注释写法如下：

```ts
/** 模拟成功响应 */
export function successResponse<T>(data: T, message: string = "操作成功") {
	return {
		success: true,
		code: ResultEnum.Success,
		message,
		data,
		timestamp: Date.now(),
	};
}
```

### 4. markdown 的多级标题要主动提供序号

对于每一份 markdown 文件的`二级标题`和`三级标题`，你都应该要：

1. 主动添加**数字**序号，便于我阅读文档。
2. 主动**维护正确的数字序号顺序**。如果你处理的 markdown 文档，其手动添加的序号顺序不对，请你及时的更新序号顺序。

## 报告编写规范

在大多数情况下，你的更改是**不需要**编写任何说明报告的。但是每当你需要编写报告时，请你首先遵循以下要求：

- 报告地址： 默认在 `reports` 文件夹内编写报告。
- 报告文件格式： `*.md` 通常是 markdown 文件格式。
- 报告文件名称命名要求：
  1. 前缀以日期命名。包括年月日。日期格式 `YYYY-MM-DD` 。
  2. 用小写英文加短横杠的方式命名。
- 报告的一级标题： 必须是日期`YYYY-MM-DD`+报告名的格式。
  - 好的例子： `2025-12-09 修复 @ruan-cat/commitlint-config 包的 negation pattern 处理错误` 。前缀包含有 `YYYY-MM-DD` 日期。
  - 糟糕的例子： `构建与 fdir/Vite 事件复盘报告` 。前缀缺少 `YYYY-MM-DD` 日期。
- 报告日志信息的代码块语言： 一律用 `log` 作为日志信息的代码块语言。如下例子：

  ````markdown
  日志如下：

  ```log
  日志信息……
  ```
  ````

- 报告语言： 默认用简体中文。

## Neon 与 Vercel 固定资源记忆

**Windows 平台禁令：禁止直接运行、安装后调用或在任何脚本中引入 `neonctl`。已确认它可导致 Node CPU 自旋；需要 Neon CLI 操作时必须使用官方 `neon` 替代。**

二期 AI RAG 使用本仓库关联的 Vercel 项目中既有 Neon 资源。以下标识不属于敏感信息，MCP、CLI 和后续代理执行数据库相关任务前必须以它们为准：

- Neon 组织 ID：`org-super-fog-48541962`
- Neon 项目 ID：`patient-cloud-43432277`
- Vercel 已关联的 Neon 数据库名称：`neon-smallalice-ai-rag`

禁止因示例名称或资源查询不完整而创建第二个同用途 Neon project 或 database。数据库连接前先通过 Vercel 获取当前环境变量；连接串、密码和 token 仍是敏感信息，禁止写入仓库或终端记录。所有 CLI 操作统一使用 `neon`，并且仅在用户已安装、认证并明确允许后执行资源查询、迁移或其他云端操作。

## Vercel 双项目部署架构（2026-08-07 起生效）

本仓库同时绑定两个 Vercel 项目，统一采用 `use-vercel-deploy-in-monorepo` 技能的形态 1 模式 A（仓库根安装 + 产物搬运到仓库根 `.vercel/output`）。

|          Vercel 项目           |       用途       | Root Directory | Framework |                          Build Command                          |    Output Directory    | Install Command | Node |
| :----------------------------: | :--------------: | :------------: | :-------: | :-------------------------------------------------------------: | :--------------------: | :-------------: | :--: |
|     `small-alice-web-odse`     | VitePress 文档站 |      `.`       |   Other   |                        `pnpm run build`                         | `docs/.vitepress/dist` | `pnpm install`  | 22.x |
| `smallalice-docs-ai-nitro-api` |  Nitro API 接口  |      `.`       |   Other   | `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` |    `.vercel/output`    | `pnpm install`  | 22.x |

**破坏性变更**：仓库根 `vercel.json` 已于 2026-08-07 删除。原因：`vercel.json` 覆盖云端 Project Settings，多项目 monorepo 中会造成跨项目配置污染。原文档中 `small-alice-web-odse` 的配置已迁移到该项目云端 Project Settings，值完全一致。

**CLI 单槽绑定纪律**：`.vercel/project.json` 是单槽绑定。部署任一项目前必须先 `vercel link --project <name> --yes` 切换到目标项目，再执行 `vercel deploy`。禁止在未确认绑定状态时直接部署。

**Nitro API 生产域名**：`https://smallalice-docs-ai-nitro-api.ruan-cat.com/`（用户自定义域名，实际使用此地址）。Vercel 默认地址 `https://smallalice-docs-ai-nitro-api.vercel.app` 不使用。路由前缀：`/v1/chat`、`/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs`。

## 终端操作注意事项（防卡住）

在 Windows PowerShell 环境下执行终端命令时，必须遵循以下规则，避免命令卡住浪费时间：

### 1. 避免超长单行命令

命令行参数过多（超过 200 字符）时，PowerShell 可能会挂起无响应。

- **拆分命令**：每次传入 2~3 个文件路径，不要一次传入 5 个以上。
- **使用通配符**：优先用 `git add scripts/.../src/*.ts` 替代逐个列举文件路径。

### 2. 优先使用 `pnpm run` 而非 `npx`

`npx` 在 Windows 上被终止时，会触发 `Terminate batch job (Y/N)?` 交互提示导致卡住。

- **优先使用** `pnpm run build` 替代 `npx tsdown`。
- **优先使用** `pnpm run test` 替代 `npx vitest run`。

### 3. 及时止损，不要反复轮询

当命令可能卡住时：

1. 第 1 次状态检查等待 10~15 秒。
2. 如果无输出且仍在运行 → **立即终止**，用新命令重试。
3. **不要超过 2 次**状态检查仍无进展还继续等待。

### 4. 合理的等待超时设置

|         命令类型         | 建议等待时长 |
| :----------------------: | :----------: |
| `git add / status / log` |   5~10 秒    |
|       `git commit`       |    10 秒     |
| `pnpm run build / test`  |    30 秒     |
|      `pnpm install`      |    60 秒     |
