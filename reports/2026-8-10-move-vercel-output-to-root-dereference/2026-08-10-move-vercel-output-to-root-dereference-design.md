# 2026-08-10 `move-vercel-output-to-root` 符号链接解引用升级设计

> 编写工具：Codex Desktop
>
> AI 模型：GPT-5
>
> 目标源码：`D:\code\ruan-cat\monorepo\packages\utils`

## 1. 设计结论

在 `@ruan-cat/utils` 的 `move-vercel-output-to-root` 能力中增加一个非破坏性的可选开关：编程式 API 使用 `dereference?: boolean`，CLI 使用 `--dereference`。默认值保持 `false`，现有调用方继续保留符号链接；只有显式启用开关的调用方才把符号链接目标复制为实体文件或目录。

SmallAliceWeb 在包含该能力的 `@ruan-cat/utils` 补丁版本发布后，把构建命令收敛为共享 CLI：

```json
{
	"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel && move-vercel-output-to-root --dereference"
}
```

随后删除 SmallAliceWeb 内临时的 `packages/ai-rag-api/scripts/move-vercel-output-to-root.ts` 及其项目内实现测试。符号链接复制语义和回归测试由 `@ruan-cat/utils` 统一拥有。

## 2. 背景与问题

### 2.1 当前共享工具的职责

`@ruan-cat/utils` 已通过 `move-vercel-output-to-root` bin 解决 pnpm workspace monorepo 的 Vercel 产物路径冲突：子包在自身目录生成 `.vercel/output`，共享工具定位 `pnpm-workspace.yaml` 所在根目录，清理根 `.vercel/output`，再把子包产物复制到仓库根。

当前包版本为 `4.25.2`，`package.json` 同时暴露独立 bin `move-vercel-output-to-root` 和统一入口 `ruan-cat-utils`。源码、CLI 参数解析、帮助文本、说明文档和 Vitest 测试都位于 `packages/utils` 内。

### 2.2 当前缺口

复制实现当前是：

```typescript
fs.cpSync(sourceEntry, targetEntry, {
	force: true,
	recursive: true,
});
```

Node.js `fs.cpSync` 的 `dereference` 默认值为 `false`，因此符号链接会被保留。当前 `MoveVercelOutputToRootOptions`、`ResolvedMoveVercelOutputToRootOptions`、CLI 参数解析和帮助文本均没有链接解引用能力。

Nitro v3 的 Vercel preset 会让多个路由 `.func` 复用同一个 `__server.func`。SmallAliceWeb 的实测产物中，`chat.func`、`search.func`、`sync.func` 和 `sync-runs.func` 是链接。共享工具把它们从子包复制到仓库根时保留链接，会让搬运后的 Vercel Build Output 继续依赖子包源路径。

### 2.3 为什么能力属于共享工具

链接是否解引用属于“如何复制 Vercel Output”的通用语义，不属于 SmallAliceWeb 的业务逻辑。共享工具已经拥有路径解析、目录清理、CLI、帮助文本和测试；在业务仓库重写一套复制器只为增加一个 `fs.cpSync` 选项，会产生重复维护。

## 3. 目标与非目标

### 3.1 目标

本次升级必须为编程式 API 和两个 CLI 入口提供同一套显式解引用能力；保持所有未传开关的调用方行为不变；为 Windows Junction 与类 Unix 目录符号链接提供跨平台回归测试；更新用户文档和 CLI 帮助；通过 patch changeset 描述新增能力；在发布后指导 SmallAliceWeb 删除临时实现并验证真实 Nitro 产物。

### 3.2 非目标

本次不把 `dereference` 默认值改为 `true`，不自动检测 Nitro，不增加框架判断，不遍历或重写链接目标，不修改 monorepo 根定位算法，不改变 `skipClean`、`dryRun`、`sourceDir` 或 `targetDir` 语义，不修复当前 Vitest workspace 的弃用警告，也不在没有用户明确授权时发布 npm 包、推送 Git、部署 Vercel 或提交代码。

## 4. 已批准方案与备选方案

### 4.1 已批准方案：可选参数向下传递

在现有 Options、Resolved Options、复制函数、CLI parser 和帮助文本中贯通一个布尔值。`moveVercelOutputToRoot()` 仍是唯一业务入口，独立 bin 与统一 CLI 继续复用 `runMoveVercelOutputToRootCli()`。

该方案只增加一个 opt-in 行为，不创建新命令，不创建新包，不改变默认值，符合最小改动和单一所有权原则。

### 4.2 不采用：默认解引用全部链接

把默认值改成 `true` 会改变所有既有消费者的复制结果。部分项目可能依赖保留链接来节省空间或维持文件结构，因此这属于不必要的破坏性变更。

### 4.3 不采用：新增 Nitro 专用命令

新增 `move-nitro-vercel-output-to-root` 会复制现有 CLI 的路径、清理和错误处理逻辑。链接复制语义并非 Nitro 独占，不应通过框架专用命令表达。

### 4.4 不采用：继续维护 SmallAliceWeb 本地脚本

本地脚本能止血，但会让业务仓库长期拥有一份共享工具的子集实现。发布共享能力后继续保留它没有收益。

## 5. API 与数据流设计

### 5.1 编程式 API

`MoveVercelOutputToRootOptions` 新增：

```typescript
/**
 * 是否解引用符号链接，将链接目标复制为实体文件或目录。
 *
 * @default false
 */
dereference?: boolean;
```

`ResolvedMoveVercelOutputToRootOptions` 新增必填字段：

```typescript
dereference: boolean;
```

`resolveMoveVercelOutputToRootOptions()` 使用空值合并保持默认值：

```typescript
dereference: options.dereference ?? false,
```

`MoveVercelOutputToRootResult` 已继承 Resolved Options，因此不需要单独重复声明；调用完成后，结果中的 `dereference` 必须反映实际复制策略。

### 5.2 复制实现

私有函数显式接收解析后的布尔值：

```typescript
function copyDirectoryContents(sourceDir: string, targetDir: string, dereference: boolean) {
	fs.mkdirSync(targetDir, { recursive: true });

	for (const entryName of fs.readdirSync(sourceDir)) {
		const sourceEntry = path.join(sourceDir, entryName);
		const targetEntry = path.join(targetDir, entryName);
		fs.cpSync(sourceEntry, targetEntry, {
			dereference,
			force: true,
			recursive: true,
		});
	}
}
```

调用位置必须传递 `resolvedOptions.dereference`。解析结果日志新增 `- dereference: true|false`，便于 CI 和 Vercel 构建日志确认实际策略。

### 5.3 CLI

`parseMoveVercelOutputToRootCliArgs()` 增加无值布尔开关：

```typescript
case "--dereference":
	options.dereference = true;
	break;
```

帮助文本增加：

```log
--dereference        解引用符号链接，将链接目标复制为实体文件或目录
```

以下两种命令必须等价：

```powershell
move-vercel-output-to-root --dereference
ruan-cat-utils move-vercel-output-to-root --dereference
```

### 5.4 行为矩阵

不传 `dereference` 时，Resolved Options 为 `false`，普通文件照常复制，链接仍为链接。传入 `dereference: true` 或 CLI `--dereference` 时，普通文件行为不变，链接目标被复制为实体。`dryRun: true` 时仍解析并返回 `dereference`，但不清理或复制目录。`skipClean` 与 `dereference` 相互独立。

## 6. 文件写集

### 6.1 `ruan-cat/monorepo`

必须修改：

```log
packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.ts
packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.test.ts
packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.md
.changeset/2026-08-10-add-move-vercel-output-dereference.md
```

不需要修改 `packages/utils/src/cli/move-vercel-output-to-root.ts`、`packages/utils/src/cli/index.ts`、`packages/utils/src/node-esm/index.ts`、`packages/utils/tsup.config.ts` 或 `packages/utils/package.json`。这些文件已经复用统一 CLI runner、导出源码入口、构建 bin，并由 Changesets 管理版本号。

### 6.2 `ruan-cat/SmallAliceWeb`

在包含新能力的 npm 版本真实发布后，必须修改或删除：

```log
修改 packages/ai-rag-api/package.json
修改 packages/ai-rag-api/tests/package-boundary.test.ts
删除 packages/ai-rag-api/scripts/move-vercel-output-to-root.ts
删除 packages/ai-rag-api/tests/move-vercel-output-to-root.test.ts
```

## 7. 测试设计

### 7.1 默认兼容性

在临时 monorepo fixture 的子包 `.vercel/output/functions` 中创建 `__server.func` 实体目录和指向它的 `v1/chat.func`。Windows 使用 `junction`，其他平台使用目录符号链接。

默认调用 `moveVercelOutputToRoot({ cwd })` 后，根输出中的 `chat.func` 必须仍由 `lstatSync().isSymbolicLink()` 识别为链接，且结果对象的 `dereference` 为 `false`。

### 7.2 显式解引用

调用 `moveVercelOutputToRoot({ cwd, dereference: true })` 后，根输出中的 `chat.func` 必须不是链接，并且其中的入口文件内容与 `__server.func` 一致。结果对象的 `dereference` 必须为 `true`。

### 7.3 参数与帮助文本

现有解析测试加入 `--dereference`，期望解析对象包含 `dereference: true`。默认解析测试断言 `dereference: false`。新增帮助文本断言，确保 `getMoveVercelOutputToRootHelpText()` 包含 `--dereference`。

### 7.4 构建产物

包构建后，`dist/node-esm/index.d.ts` 必须包含可选 API 字段和解析后的必填字段，`dist/cli/move-vercel-output-to-root.js --help` 必须显示新参数。SmallAliceWeb 构建完成后，根 `.vercel/output/functions` 下五个 `.func` 必须全部是实体目录。

## 8. 发布与版本策略

当前源码快照的 `@ruan-cat/utils` 版本为 `4.25.2`，且 `.changeset` 中没有正在等待的 utils changeset。在没有并发发布或其他 changeset 的前提下，本次 patch changeset 预期生成 `4.25.3`。

实现代理不得手工修改 `packages/utils/package.json#version` 或 `CHANGELOG.md`。它只创建 patch changeset；版本号和 changelog 交给 Changesets Action。目标包的 `publishConfig.tag` 为 `beta`，但发布后仍可通过精确版本 `@ruan-cat/utils@4.25.3` 验证。

如果执行时当前版本已经不是 `4.25.2`，或者出现另一个 `@ruan-cat/utils` changeset，执行代理必须停止使用 `4.25.3` 假设，重新计算发布版本并同步修改 SmallAliceWeb 的最低依赖版本。

## 9. 下游迁移与部署验证

确认 npm registry 已能读取包含该能力的版本后，SmallAliceWeb 将 `@ruan-cat/utils` 的最低版本提升到该已发布版本，构建命令改为共享 CLI 加 `--dereference`，并删除临时实现。

本地必须依次通过 ai-rag-api 测试、类型检查与 `build:vercel`。产物检查必须证明子包原始输出含四个链接，而根输出没有链接。之后只有在用户明确授权推送和部署时，才能触发真实 Git 部署；Vercel 日志必须显示 CLI 的 `dereference: true`，最终部署必须识别五个函数并通过 API 路由验收。

## 10. 风险与边界

`dereference: true` 会读取链接目标的内容。如果调用方对构建产物不可信，或链接指向输出目录外，可能把额外内容复制进目标目录。此次不增加链接目标白名单，因为 Nitro 产物由受信构建过程生成，且该能力保持 opt-in；文档必须明确调用方应只对受信产物启用。

符号链接循环或不可访问目标由 Node.js `fs.cpSync` 按原生错误行为失败，本次不吞掉或改写错误。测试只覆盖目录链接，因为当前 Nitro 故障对应 `.func` 目录；Node 原生选项同时适用于文件链接，不额外实现第二套逻辑。

目标 monorepo 当前存在与本任务无关的未提交 skill、prompt、spec 和 plan 修改。实施代理必须只检查和暂存本设计列出的 utils 与 changeset 文件，不得格式化、覆盖、提交或清理其他脏文件。

## 11. 验收标准

Focused Vitest 必须从 monorepo 根执行并显示全部通过；从 `packages/utils` 子目录直接执行会触发现有 Vitest workspace 路径错误，不作为本功能失败。现有六项测试必须继续通过，新增默认链接、显式解引用、参数解析和帮助文本测试必须通过。

`pnpm --filter @ruan-cat/utils build` 必须成功，生成的类型声明与 CLI help 必须包含 `dereference`。Changeset 必须是 patch，正文同时说明 opt-in 新能力与默认兼容性。SmallAliceWeb 迁移后不得再包含项目内搬运实现，根 Vercel Output 不得包含链接。

未经用户明确授权，不以 git commit、push、npm publish 或 Vercel deploy 作为本次实施计划的自动步骤。
