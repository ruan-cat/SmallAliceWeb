# 2026-08-10 `move-vercel-output-to-root` 符号链接解引用实施计划

> **面向执行代理：** 必须使用 `subagent-driven-development`（推荐）或 `executing-plans` 按任务执行。所有步骤使用复选框跟踪，但不得在没有命令输出证据时勾选。

**目标：** 为 `@ruan-cat/utils` 增加默认关闭的 `dereference` 编程式选项和 `--dereference` CLI 参数，发布后让 SmallAliceWeb 回归共享搬运工具并删除临时脚本。

**架构：** 保持 `moveVercelOutputToRoot()` 为单一实现入口，把布尔值从 Options 经 Resolved Options 传到 `fs.cpSync`；独立 bin 和统一 CLI 继续复用现有 runner。默认值为 `false`，只有显式启用时才实体化链接。

**技术栈：** TypeScript 5.9、Node.js 22、`node:fs`、Vitest 3、tsup、pnpm 10、Changesets、Vercel Build Output API。

## 1. 全局约束

- [ ] 执行前确认 `D:\code\ruan-cat\monorepo\packages\utils\package.json#version` 仍为 `4.25.2`；若已变化，停止并重新计算预期补丁版本。
- [ ] 执行前运行 `git status --short --untracked-files=all`；不得触碰当前已有的 `ai-plugins/dev-skills`、`docs/prompts`、其他 spec 或 plan 修改。
- [ ] 如果本计划列出的任一目标源码文件在执行前已经有用户修改，停止并向用户报告重叠，禁止覆盖。
- [ ] `dereference` 默认值必须是 `false`，不得根据框架、文件名或环境自动开启。
- [ ] 不新增运行时依赖，不新增 CLI 入口，不修改 Root Directory 检测和目录清理语义。
- [ ] 测试必须从 `D:\code\ruan-cat\monorepo` 根目录运行；不要从 `packages/utils` 子目录启动 Vitest。
- [ ] 不手工修改 `packages/utils/package.json#version` 或 `packages/utils/CHANGELOG.md`。
- [ ] 没有用户在执行会话中的明确授权时，不执行 commit、push、npm publish 或 Vercel deploy。

---

## 2. 任务一：用失败测试锁定默认兼容与显式解引用

**文件：**

- 修改：`D:\code\ruan-cat\monorepo\packages\utils\src\node-esm\scripts\move-vercel-output-to-root\index.test.ts`
- 测试：同一文件

**接口：**

- 消费：现有 `moveVercelOutputToRoot()`、`resolveMoveVercelOutputToRootOptions()`、`parseMoveVercelOutputToRootCliArgs()`。
- 产出：后续实现必须满足的 `dereference` 解析、复制和帮助文本合同。

- [ ] **步骤 1：扩展测试导入**

把测试文件的实现导入改为：

```typescript
import {
	getMoveVercelOutputToRootHelpText,
	moveVercelOutputToRoot,
	parseMoveVercelOutputToRootCliArgs,
	resolveMoveVercelOutputToRootOptions,
} from "./index";
```

- [ ] **步骤 2：增加目录链接 fixture helper**

在 `createMonorepoFixture()` 后增加：

```typescript
function createFunctionSymlinkFixture(packageOutputDir: string) {
	const serverFunctionDir = path.join(packageOutputDir, "functions", "__server.func");
	const chatFunctionDir = path.join(packageOutputDir, "functions", "v1", "chat.func");

	fs.mkdirSync(serverFunctionDir, { recursive: true });
	fs.writeFileSync(path.join(serverFunctionDir, "index.mjs"), 'export default "chat";\n', "utf8");
	fs.mkdirSync(path.dirname(chatFunctionDir), { recursive: true });
	fs.symlinkSync(serverFunctionDir, chatFunctionDir, process.platform === "win32" ? "junction" : "dir");

	return {
		chatFunctionDir,
		serverFunctionDir,
	};
}
```

- [ ] **步骤 3：补充默认解析断言**

在现有“应该能从子包目录自动解析”测试中增加：

```typescript
expect(resolvedOptions.dereference).toBe(false);
```

- [ ] **步骤 4：增加默认保留链接测试**

在 `describe("moveVercelOutputToRoot")` 内增加：

```typescript
test("默认应该保留 Vercel 函数目录符号链接", () => {
	const fixture = createMonorepoFixture();
	temporaryDirectories.add(fixture.tempRoot);
	createFunctionSymlinkFixture(fixture.packageOutputDir);

	const result = moveVercelOutputToRoot({
		cwd: fixture.packageDir,
	});
	const copiedChatFunctionDir = path.join(fixture.rootOutputDir, "functions", "v1", "chat.func");

	expect(result.dereference).toBe(false);
	expect(fs.lstatSync(copiedChatFunctionDir).isSymbolicLink()).toBe(true);
});
```

- [ ] **步骤 5：增加显式解引用测试**

在同一 describe 内增加：

```typescript
test("dereference 为 true 时应该将 Vercel 函数目录链接复制为实体目录", () => {
	const fixture = createMonorepoFixture();
	temporaryDirectories.add(fixture.tempRoot);
	createFunctionSymlinkFixture(fixture.packageOutputDir);

	const result = moveVercelOutputToRoot({
		cwd: fixture.packageDir,
		dereference: true,
	});
	const copiedChatFunctionDir = path.join(fixture.rootOutputDir, "functions", "v1", "chat.func");

	expect(result.dereference).toBe(true);
	expect(fs.lstatSync(copiedChatFunctionDir).isSymbolicLink()).toBe(false);
	expect(fs.readFileSync(path.join(copiedChatFunctionDir, "index.mjs"), "utf8")).toBe('export default "chat";\n');
});
```

- [ ] **步骤 6：扩展 CLI parser 测试**

在现有参数数组中把 `"--dereference"` 放在 `"--dry-run"` 前，并把期望对象扩展为：

```typescript
expect(parsedOptions).toEqual({
	rootDir: "../../..",
	sourceDir: ".vercel/output",
	targetDir: "deploy-output",
	skipClean: true,
	dereference: true,
	dryRun: true,
});
```

- [ ] **步骤 7：增加帮助文本测试**

在 CLI parser describe 内增加：

```typescript
test("帮助文本应该说明 dereference 参数", () => {
	expect(getMoveVercelOutputToRootHelpText()).toContain("--dereference");
});
```

- [ ] **步骤 8：运行 RED 测试**

在 monorepo 根执行：

```powershell
pnpm exec vitest run packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.test.ts --reporter=default
```

预期：命令失败；失败至少包括默认 `dereference` 为 `undefined`、CLI 未解析 `--dereference` 或链接仍被保留。既有测试不得出现与本改动无关的新失败。

## 3. 任务二：实现最小 API 与 CLI 数据流

**文件：**

- 修改：`D:\code\ruan-cat\monorepo\packages\utils\src\node-esm\scripts\move-vercel-output-to-root\index.ts`
- 测试：`D:\code\ruan-cat\monorepo\packages\utils\src\node-esm\scripts\move-vercel-output-to-root\index.test.ts`

**接口：**

- 消费：任务一的失败测试。
- 产出：`MoveVercelOutputToRootOptions.dereference?: boolean`、`ResolvedMoveVercelOutputToRootOptions.dereference: boolean`、CLI `--dereference`。

- [ ] **步骤 1：在 Options 中增加可选字段**

放在 `dryRun` 前，保持 JSDoc 风格：

```typescript
/**
 * 是否解引用符号链接，将链接目标复制为实体文件或目录。
 *
 * @default false
 */
dereference?: boolean;
```

- [ ] **步骤 2：在 Resolved Options 中增加必填字段**

```typescript
dereference: boolean;
```

- [ ] **步骤 3：解析默认值**

在 `resolveMoveVercelOutputToRootOptions()` 返回对象中加入：

```typescript
dereference: options.dereference ?? false,
```

- [ ] **步骤 4：把参数传入复制函数**

把私有函数改为：

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

把调用改为：

```typescript
copyDirectoryContents(resolvedOptions.sourceDir, resolvedOptions.targetDir, resolvedOptions.dereference);
```

- [ ] **步骤 5：输出解析日志**

在 `skipClean` 与 `dryRun` 日志之间增加：

```typescript
consola.log(`- dereference: ${resolvedOptions.dereference}`);
```

- [ ] **步骤 6：解析 CLI 开关**

在 `--skip-clean` 与 `--dry-run` 之间增加：

```typescript
case "--dereference":
	options.dereference = true;
	break;
```

- [ ] **步骤 7：更新帮助文本**

在 `--skip-clean` 与 `--dry-run` 之间增加：

```typescript
"  --dereference        解引用符号链接，将链接目标复制为实体文件或目录",
```

- [ ] **步骤 8：运行 GREEN 测试**

```powershell
pnpm exec vitest run packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.test.ts --reporter=default
```

预期：一个测试文件通过；原有 6 项测试与任务一新增测试全部通过。允许显示 Vitest workspace 弃用警告，但不得有测试失败。

## 4. 任务三：更新共享工具说明文档

**文件：**

- 修改：`D:\code\ruan-cat\monorepo\packages\utils\src\node-esm\scripts\move-vercel-output-to-root\index.md`

**接口：**

- 消费：任务二已经实现的 `dereference` API 与 CLI。
- 产出：发布包源码中随包分发的用户说明。

- [ ] **步骤 1：更新可选参数清单**

在 `--skip-clean` 后加入：

```text
--dereference        解引用符号链接，将链接目标复制为实体文件或目录
```

- [ ] **步骤 2：说明默认兼容行为**

在参数路径说明后增加以下正文：

```markdown
- 默认不解引用符号链接，复制结果仍保留链接结构。
- 仅对受信任的构建产物使用 `--dereference`；启用后，链接目标内容会被复制到目标目录。
```

- [ ] **步骤 3：增加 CLI 示例**

在 dry-run 示例后增加：

````markdown
## 符号链接解引用示例

Nitro 等框架可能使用符号链接复用多个 Vercel Function 目录。需要把链接复制为实体目录时，显式传入：

```bash
npx move-vercel-output-to-root --dereference
```
````

- [ ] **步骤 4：更新编程式调用示例**

把示例调用改为：

```typescript
moveVercelOutputToRoot({
	dereference: true,
	dryRun: true,
});
```

- [ ] **步骤 5：扫描文档与帮助文本一致性**

```powershell
rg -n "dereference|skip-clean|dry-run" packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.ts packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.md
```

预期：Options JSDoc、CLI parser、帮助文本、文档参数、CLI 示例和编程式示例均能检索到；文档不得声称默认开启。

## 5. 任务四：创建 patch changeset 并验证发布产物

**文件：**

- 新建：`D:\code\ruan-cat\monorepo\.changeset\2026-08-10-add-move-vercel-output-dereference.md`
- 生成但不提交：`D:\code\ruan-cat\monorepo\packages\utils\dist\**`

**接口：**

- 消费：任务二的源码与任务三的文档。
- 产出：可由 Changesets Action 发布的 patch 变更记录与经过验证的 CLI、类型声明。

- [ ] **步骤 1：生成空 changeset**

```powershell
$changesetDirectory = (Resolve-Path -LiteralPath '.changeset').Path
$changesetsBefore = @(Get-ChildItem -LiteralPath $changesetDirectory -File -Filter '*.md' | ForEach-Object { $_.FullName })
$targetChangeset = Join-Path $changesetDirectory '2026-08-10-add-move-vercel-output-dereference.md'
if (Test-Path -LiteralPath $targetChangeset) { throw "目标 changeset 已存在：$targetChangeset" }

pnpm dlx @changesets/cli add --empty
if ($LASTEXITCODE -ne 0) { throw '生成空 changeset 失败' }

$changesetsAfter = @(Get-ChildItem -LiteralPath $changesetDirectory -File -Filter '*.md' | ForEach-Object { $_.FullName })
$newChangesets = @($changesetsAfter | Where-Object { $_ -notin $changesetsBefore })
if ($newChangesets.Count -ne 1) { throw "预期生成 1 个 changeset，实际生成 $($newChangesets.Count) 个" }

Move-Item -LiteralPath $newChangesets[0] -Destination $targetChangeset
```

该命令在移动前验证目标不存在，并要求本次命令只新增一个 changeset，避免覆盖用户已有文件。

- [ ] **步骤 2：写入精确 changeset 内容**

```markdown
---
"@ruan-cat/utils": patch
---

1. 为 `move-vercel-output-to-root` 新增 `dereference` 编程式选项与 `--dereference` CLI 参数，可按需将符号链接目标复制为实体文件或目录。
2. 默认继续保留符号链接，现有调用方无需修改。
```

- [ ] **步骤 3：重新运行 focused 测试**

```powershell
pnpm exec vitest run packages/utils/src/node-esm/scripts/move-vercel-output-to-root/index.test.ts --reporter=default
```

预期：全部通过。

- [ ] **步骤 4：构建 utils 包**

```powershell
pnpm --filter @ruan-cat/utils build
```

预期：tsup 的四组构建入口均退出码 0，`dist/cli/move-vercel-output-to-root.js` 与 `dist/node-esm/index.d.ts` 存在。

- [ ] **步骤 5：验证编译后的 CLI 帮助**

```powershell
node packages/utils/dist/cli/move-vercel-output-to-root.js --help | Select-String -Pattern "--dereference"
```

预期：输出包含 `--dereference` 及解引用说明。

- [ ] **步骤 6：验证生成的类型声明**

```powershell
Select-String -LiteralPath 'packages\utils\dist\node-esm\index.d.ts' -Pattern 'dereference\?: boolean','dereference: boolean'
```

预期：两个模式均命中。

- [ ] **步骤 7：检查限定写集**

```powershell
git diff --check
git status --short --untracked-files=all -- packages/utils/src/node-esm/scripts/move-vercel-output-to-root .changeset/2026-08-10-add-move-vercel-output-dereference.md
```

预期：`git diff --check` 退出码 0；源码写集只有 `index.ts`、`index.test.ts`、`index.md` 和 changeset。不得把 `dist`、其他 skill、prompt、spec 或 plan 纳入提交范围。

## 6. 任务五：用户授权后的发布检查点

**文件：**

- 不直接修改额外文件。

**接口：**

- 消费：任务四通过验证的源码与 patch changeset。
- 产出：npm registry 中包含新能力的 `@ruan-cat/utils` 版本。

- [ ] **步骤 1：停在外部变更门槛前**

向用户交付源码 diff、focused 测试、build、CLI help、类型声明和 changeset 证据。没有用户明确授权时，不执行 commit、push 或 publish。

- [ ] **步骤 2：获得授权后走仓库既有 Changesets 流程**

如果用户授权提交与推送，只暂存任务四限定写集，遵循仓库提交规范。推送后由 `.github/workflows/release.yml` 的 Changesets Action 执行 `pnpm run version` 与 `pnpm release`，不得本地手工改版本或 changelog。

- [ ] **步骤 3：验证 npm 版本**

在发布流水线成功后执行：

```powershell
pnpm view @ruan-cat/utils@4.25.3 version
```

预期：输出 `4.25.3`。如果源码执行前已经发生版本漂移，则使用任务开始时重新计算并经用户确认的实际补丁版本，不得继续假设 `4.25.3`。

## 7. 任务六：发布后迁移 SmallAliceWeb

**文件：**

- 修改：`D:\code\ruan-cat\SmallAliceWeb\packages\ai-rag-api\package.json`
- 修改：`D:\code\ruan-cat\SmallAliceWeb\packages\ai-rag-api\tests\package-boundary.test.ts`
- 删除：`D:\code\ruan-cat\SmallAliceWeb\packages\ai-rag-api\scripts\move-vercel-output-to-root.ts`
- 删除：`D:\code\ruan-cat\SmallAliceWeb\packages\ai-rag-api\tests\move-vercel-output-to-root.test.ts`

**接口：**

- 消费：npm 已发布且验证存在的 `@ruan-cat/utils@4.25.3`。
- 产出：SmallAliceWeb 只使用共享 CLI 的 Vercel 构建链。

- [ ] **步骤 1：检查下游工作区边界**

在 `D:\code\ruan-cat\SmallAliceWeb` 执行：

```powershell
git status --short --untracked-files=all
```

确认 `prompts/index.md` 及其他用户修改不在本任务写集。若四个目标文件出现与本方案不同的后续用户修改，停止并请求重新评估。

- [ ] **步骤 2：先写失败的 package boundary 期望**

把 `build:vercel` 期望改为：

```typescript
"pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel && move-vercel-output-to-root --dereference";
```

运行：

```powershell
pnpm --dir packages/ai-rag-api exec vitest run tests/package-boundary.test.ts
```

预期：因为 `package.json` 仍指向本地 tsx 脚本而失败。

- [ ] **步骤 3：切换到共享 CLI 并提升最低版本**

把 `packages/ai-rag-api/package.json` 更新为：

```json
{
	"scripts": {
		"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel && move-vercel-output-to-root --dereference"
	},
	"devDependencies": {
		"@ruan-cat/utils": "^4.25.3"
	}
}
```

上面只展示需要变化的字段，不得覆盖 package.json 其他内容。

- [ ] **步骤 4：删除临时实现与临时测试**

精确删除：

```log
packages/ai-rag-api/scripts/move-vercel-output-to-root.ts
packages/ai-rag-api/tests/move-vercel-output-to-root.test.ts
```

不得递归删除 `scripts` 或 `tests` 目录。

- [ ] **步骤 5：安装已发布依赖并验证命令来源**

```powershell
pnpm install
pnpm --dir packages/ai-rag-api exec move-vercel-output-to-root --help | Select-String -Pattern "--dereference"
```

预期：帮助文本来自已发布共享包并包含新参数。

- [ ] **步骤 6：运行下游测试与类型检查**

```powershell
pnpm --dir packages/ai-rag-api run test
pnpm --dir packages/ai-rag-api run typecheck
```

预期：两条命令退出码均为 0；测试集合不再包含已删除的项目内搬运测试。

- [ ] **步骤 7：重新生成 Vercel 产物**

```powershell
pnpm --dir packages/ai-rag-api run build:vercel
```

预期：构建日志包含 `- dereference: true`，命令退出码 0。

- [ ] **步骤 8：验证根产物没有链接**

```powershell
$functionDirectories = @(Get-ChildItem -LiteralPath '.vercel\output\functions' -Recurse -Directory -Force | Where-Object { $_.Name -like '*.func' })
$linkedDirectories = @($functionDirectories | Where-Object { $_.LinkType })
if ($functionDirectories.Count -ne 5) { throw "预期 5 个 .func，实际 $($functionDirectories.Count) 个" }
if ($linkedDirectories.Count -ne 0) { throw "根 Vercel Output 仍有 $($linkedDirectories.Count) 个链接" }
```

预期：脚本退出码 0。

- [ ] **步骤 9：检查删除与限定 diff**

```powershell
git diff --check
git status --short --untracked-files=all -- packages/ai-rag-api/package.json packages/ai-rag-api/tests/package-boundary.test.ts packages/ai-rag-api/scripts/move-vercel-output-to-root.ts packages/ai-rag-api/tests/move-vercel-output-to-root.test.ts
```

预期：只出现两个修改和两个删除；`prompts/index.md` 等用户文件不在本任务 diff 中。

## 8. 任务七：用户授权后的真实 Vercel 验收

**文件：**

- 不修改额外源码。

**接口：**

- 消费：任务六通过的 SmallAliceWeb 本地产物。
- 产出：真实 Git 部署对共享 CLI 的远程验证证据。

- [ ] **步骤 1：停在推送与部署门槛前**

向用户报告本地测试、类型检查、构建、五个实体函数目录和限定 diff。没有用户明确授权时，不提交、不推送、不部署。

- [ ] **步骤 2：授权后触发真实 Git 部署**

推送后让 `smallalice-docs-ai-nitro-api` 通过 Git 集成执行云端 Install Command 和 Build Command。不要用 `vercel deploy --prebuilt` 替代本验收，因为 prebuilt 不会重新验证共享 CLI 的云端执行链。

- [ ] **步骤 3：核对构建日志**

日志必须同时包含：

```log
Detected ENABLE_EXPERIMENTAL_COREPACK=1
using pnpm v10.29.2
- dereference: true
```

并且不再出现无效 `.func` 链接或 Vercel Function 解析错误。

- [ ] **步骤 4：核对部署产物与 API**

部署必须识别 `__server.func`、`chat.func`、`search.func`、`sync.func`、`sync-runs.func` 五个函数目录。使用项目既有生产域名逐条验证 `/v1/chat`、`/v1/search`、`/v1/knowledge/sync` 和 `/v1/knowledge/sync-runs` 的既有鉴权与响应合同，不在日志或报告中泄露 token、数据库连接串或 API key。

## 9. 最终交付清单

- [ ] upstream 源码默认行为保持 `dereference=false`。
- [ ] upstream 编程式 API、Resolved Options、CLI parser、help 和日志全部贯通 `dereference`。
- [ ] 默认保留链接与显式实体化链接均有 Vitest 回归覆盖。
- [ ] focused 测试、utils build、编译 CLI help 和类型声明验证通过。
- [ ] patch changeset 内容准确，未手工改版本或 changelog。
- [ ] npm 发布由用户授权和既有 Changesets 流程控制。
- [ ] downstream 在发布后使用 `move-vercel-output-to-root --dereference`。
- [ ] downstream 临时脚本和临时测试已删除，其他用户修改未受影响。
- [ ] SmallAliceWeb 测试、类型检查、Vercel 构建和五个实体函数目录验证通过。
- [ ] 真实 Git 部署仅在用户授权后执行，并保留 Corepack、pnpm 版本、dereference 和 API 验收证据。

## 10. 执行交接

推荐由独立 AI 在 `D:\code\ruan-cat\monorepo` 先执行任务一至任务四，交付 upstream diff 与本地验证证据后停止。用户完成提交、推送和发布授权，并确认 npm 新版本可用后，再在 `D:\code\ruan-cat\SmallAliceWeb` 执行任务六。任务五和任务七都是外部状态门槛，不得通过本地成功推断已经完成。

本计划不默认创建 worktree，不默认 commit，也不默认发布或部署。执行代理必须在每个仓库的当前分支和现有脏工作区上做限定写集保护；若目标文件与用户改动重叠，优先停止而不是覆盖。
