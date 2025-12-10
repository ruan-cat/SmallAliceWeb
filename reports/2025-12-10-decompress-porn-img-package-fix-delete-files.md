# 2025-12-10 decompress-porn-img-package 文件删除故障修复报告

## 1. 故障概述

在 `@ruan-cat/decompress-porn-img-package` 解压工具运行过程中，发现两个关键故障：

1. **命令无反应故障**：运行 `pnpm exec decompress-porn-img-package` 命令时毫无反应，没有任何日志输出，也没有开始解压操作。
2. **文件清理不完整故障**：解压完成后，目标文件夹内残留大量多余文件，包括：
   - 脏文件（孔雀海.url）未被删除
   - 分卷压缩包（.7z.001, .7z.002）未被清理
   - 多余的子文件夹未被删除
   - 重复的文件夹（031 和 蠢沫沫 - NO.031 惠礼服[40P-436.8M]）同时存在

## 2. 问题现象

### 2.1 命令无反应

运行命令：

```bash
pnpm exec decompress-porn-img-package 'C:\Users\pc\Desktop\test'
```

**现象**：命令执行后无任何输出，进程直接退出，未进行任何解压操作。

**日志输出**：

```log
（无任何日志）
```

### 2.2 文件清理不完整

直接使用 node 运行脚本虽然可以工作，但解压后的文件结构如下：

```plain
C:\Users\pc\Desktop\test
├── 031.gz
├── 031/                                          # 多余文件夹，应该被重命名
│   └── (包含分卷压缩包和图片的混合内容)
└── 蠢沫沫 - NO.031 惠礼服[40P-436.8M]/               # 旧文件夹，应该被删除
    ├── 蠢沫沫 - NO.031 惠礼服[40P-436.8M].7z.001    # 分卷压缩包，应该被删除
    ├── 蠢沫沫 - NO.031 惠礼服[40P-436.8M].7z.002    # 分卷压缩包，应该被删除
    ├── 孔雀海.url                                   # 脏文件，应该被删除
    └── (40个图片文件)
```

**日志输出**：

```log
[@ruan-cat/decompress] ℹ 开始处理压缩包: 031.gz
[@ruan-cat/decompress] ℹ 发现分卷压缩: 蠢沫沫 - NO.031 惠礼服[40P-436.8M]
[@ruan-cat/decompress] ⚠ 目标目录已存在，跳过重命名: C:\Users\pc\Desktop\test\蠢沫沫 - NO.031 惠礼服[40P-436.8M]
[@ruan-cat/decompress] ✔ 压缩包处理完成
```

## 3. 根本原因分析

### 3.1 命令无反应原因

**位置**：`scripts/decompress-porn-img-package/src/index.ts:301-314`

**问题代码**：

```typescript
function isEntryPoint(metaUrl: string): boolean {
	const current = fileURLToPath(metaUrl);
	const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
	return current === invoked;
}
```

**根本原因**：

在 Windows 系统上通过 `pnpm exec` 运行命令时，`pnpm` 会创建一个包装器脚本来调用实际的 CLI 工具。这导致 `process.argv[1]` 指向的是包装器脚本的路径，而不是实际的 `dist/index.mjs` 文件路径。

严格的路径相等性检查 `current === invoked` 无法匹配，导致 `isEntryPoint` 返回 `false`，`main()` 函数从未被调用。

### 3.2 脏文件删除失败原因

**位置**：`scripts/decompress-porn-img-package/src/index.ts:66-85`

**问题代码**：

```typescript
if (dirtyNames.includes(entry.name)) {
	await fs.rm(full, { force: true });
	logger.info(`已删除脏文件: ${full}`);
}
```

**根本原因**：

配置文件中定义 `dirtyFiles: ["孔雀海"]`，但实际文件名是 `孔雀海.url`。精确匹配逻辑导致无法识别并删除该文件。

### 3.3 重命名冲突原因

**位置**：`scripts/decompress-porn-img-package/src/index.ts:249-259`

**问题代码**：

```typescript
if (await pathExists(nextDir)) {
	logger.warn(`目标目录已存在，跳过重命名: ${nextDir}`);
} else {
	await fs.rename(extractionDir, nextDir);
}
```

**根本原因**：

当目标文件夹已存在时（比如上一次运行的残留），重命名操作被跳过。这导致：

- 新的 `031` 文件夹无法被重命名
- 旧的目标文件夹未被清理
- 最终存在两个文件夹

### 3.4 压缩包残留原因

**位置**：`scripts/decompress-porn-img-package/src/index.ts:150-159` 和 `182-192`

**问题代码**：

```typescript
async function collectFiles(dir: string): Promise<string[]> {
	// ... 收集所有文件，包括压缩包
}

export async function moveFilesToRoot(rootDir: string): Promise<void> {
	const files = await collectFiles(rootDir);
	// ... 移动所有文件，包括压缩包
}
```

**根本原因**：

1. `collectFiles` 函数收集所有文件，包括分卷压缩包
2. `moveFilesToRoot` 移动所有文件到根目录，导致压缩包也被移动
3. `removeEmptyDirs` 只删除空目录，无法识别和删除只包含压缩包的目录
4. 最终导致压缩包残留在最终的文件夹内

## 4. 修复方案

### 4.1 修复命令无反应

**修改位置**：`scripts/decompress-porn-img-package/src/index.ts:301-307`

**修复代码**：

```typescript
/** 检查当前模块是否作为入口点运行 */
function isEntryPoint(metaUrl: string): boolean {
	const current = fileURLToPath(metaUrl);
	const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
	// Windows 上通过 pnpm exec 运行时路径可能不完全匹配，所以使用更宽松的检查
	return current === invoked || current.endsWith(path.basename(invoked));
}
```

**改进点**：

- 添加文件名部分匹配 `current.endsWith(path.basename(invoked))`
- 添加 JSDoc 注释说明 Windows 兼容性
- 保留原有的精确匹配逻辑作为第一优先级

### 4.2 修复脏文件删除

**修改位置**：`scripts/decompress-porn-img-package/src/index.ts:66-93`

**修复代码**：

```typescript
/**
 * 递归删除脏文件
 * 支持精确匹配文件名，以及忽略扩展名的部分匹配
 */
export async function deleteDirtyRecursive(dir: string, dirtyNames: string[]): Promise<void> {
	if (!dirtyNames.length) return;
	const stack = [dir];
	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			// 精确匹配或者忽略扩展名的部分匹配
			const fileNameWithoutExt = path.parse(entry.name).name;
			const shouldDelete = dirtyNames.includes(entry.name) || dirtyNames.includes(fileNameWithoutExt);
			if (shouldDelete) {
				await fs.rm(full, { force: true });
				logger.info(`已删除脏文件: ${full}`);
			}
		}
	}
}
```

**改进点**：

- 支持文件名部分匹配（忽略扩展名）
- 保留精确匹配逻辑
- 添加详细的 JSDoc 注释

### 4.3 修复重命名冲突

**修改位置**：`scripts/decompress-porn-img-package/src/index.ts:257-268`

**修复代码**：

```typescript
const renameTarget = volumeSet?.baseName;
if (renameTarget && config.isRenameRootFolder) {
	const nextDir = path.join(path.dirname(extractionDir), renameTarget);
	if (nextDir !== extractionDir) {
		if (await pathExists(nextDir)) {
			logger.warn(`目标目录已存在，将删除旧目录: ${nextDir}`);
			await fs.rm(nextDir, { recursive: true, force: true });
		}
		await fs.rename(extractionDir, nextDir);
		logger.info(`已重命名文件夹: ${path.basename(extractionDir)} -> ${renameTarget}`);
	}
}
```

**改进点**：

- 主动删除冲突的旧目录
- 添加重命名成功的日志
- 确保重命名操作总是执行

### 4.4 修复压缩包残留

**修改位置**：`scripts/decompress-porn-img-package/src/index.ts:150-249`

**新增函数**：

```typescript
/** 判断文件是否是压缩包（包括分卷压缩） */
function isArchiveFile(fileName: string): boolean {
	const lowerName = fileName.toLowerCase();
	// 检查常见压缩包扩展名
	if (ARCHIVE_EXTS.has(path.extname(lowerName))) return true;
	// 检查分卷压缩文件（如 .7z.001, .7z.002）
	if (/\.7z\.\d+$/.test(lowerName)) return true;
	return false;
}
```

**修改 collectFiles**：

```typescript
async function collectFiles(dir: string, excludeArchives: boolean = false): Promise<string[]> {
	const stack = [dir];
	const files: string[] = [];
	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else {
				// 如果需要排除压缩包，且当前文件是压缩包，则跳过
				if (excludeArchives && isArchiveFile(entry.name)) continue;
				files.push(full);
			}
		}
	}
	return files;
}
```

**修改 moveFilesToRoot**：

```typescript
/**
 * 移动文件到根目录
 * 会排除压缩包文件，确保最终只有纯粹的内容文件
 */
export async function moveFilesToRoot(rootDir: string): Promise<void> {
	const files = await collectFiles(rootDir, true); // 排除压缩包
	for (const file of files) {
		const parent = path.dirname(file);
		if (parent === rootDir) continue;
		const dest = await makeUniqueDest(rootDir, path.basename(file));
		await ensureDir(path.dirname(dest));
		await fs.rename(file, dest);
	}
	await removeEmptyDirs(rootDir, rootDir);
}
```

**修改 removeEmptyDirs**：

```typescript
/**
 * 递归删除空目录和只包含压缩包的目录
 */
async function removeEmptyDirs(base: string, keep: string): Promise<void> {
	const entries = await fs.readdir(base, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(base, entry.name);
		if (entry.isDirectory()) {
			await removeEmptyDirs(full, keep);
			let after: string[];
			try {
				after = await fs.readdir(full);
			} catch {
				continue; // 目录已被移除或不可访问时跳过
			}
			// 检查目录是否为空，或只包含压缩包文件
			const hasNonArchiveFiles = after.some((name) => !isArchiveFile(name));
			if (after.length === 0 || !hasNonArchiveFiles) {
				// 删除整个目录（包括其中的压缩包）
				await fs.rm(full, { recursive: true, force: true }).catch(() => {});
			}
		}
	}
	if (base !== keep) {
		const remaining = await fs.readdir(base);
		// 检查是否只剩压缩包文件
		const hasNonArchiveFiles = remaining.some((name) => !isArchiveFile(name));
		if (remaining.length === 0 || !hasNonArchiveFiles) {
			await fs.rm(base, { recursive: true, force: true }).catch(() => {});
		}
	}
}
```

**改进点**：

- 新增压缩包识别函数，支持常规压缩包和分卷压缩
- 移动文件时自动排除压缩包
- 删除目录时识别并清理只包含压缩包的目录
- 确保最终文件夹只包含纯粹的内容文件

## 5. 验证结果

### 5.1 命令正常运行

```bash
pnpm exec decompress-porn-img-package 'C:\Users\pc\Desktop\test'
```

**日志输出**：

```log
[@ruan-cat/decompress] ℹ 开始处理压缩包: 031.gz
[@ruan-cat/decompress] ℹ 发现分卷压缩: 蠢沫沫 - NO.031 惠礼服[40P-436.8M]
[@ruan-cat/decompress] ℹ 已删除脏文件: C:\Users\pc\Desktop\test\031\蠢沫沫 - NO.031 惠礼服[40P-436.8M]\蠢沫沫 - NO.031 惠礼服[40P-436.8M]\孔雀海.url
[@ruan-cat/decompress] ℹ 已重命名文件夹: 031 -> 蠢沫沫 - NO.031 惠礼服[40P-436.8M]
[@ruan-cat/decompress] ✔ 压缩包处理完成
```

### 5.2 文件清理完整

最终文件结构：

```plain
C:\Users\pc\Desktop\test
├── 031.gz                                      # 保留（因为 isDeletePackages: false）
└── 蠢沫沫 - NO.031 惠礼服[40P-436.8M]/
    ├── ANNN0307.jpg
    ├── ANNN0308.jpg
    ├── ... (共40个纯净的图片文件)
    └── ANNN0378.jpg
```

**验证检查**：

```bash
# 检查文件夹结构
find 'C:\Users\pc\Desktop\test\蠢沫沫 - NO.031 惠礼服[40P-436.8M]' -type d
# 输出：只有一个根目录，无子文件夹

# 检查压缩包文件
find 'C:\Users\pc\Desktop\test\蠢沫沫 - NO.031 惠礼服[40P-436.8M]' -name '*.7z*'
# 输出：无结果，所有压缩包已清理

# 检查脏文件
find 'C:\Users\pc\Desktop\test\蠢沫沫 - NO.031 惠礼服[40P-436.8M]' -name '*孔雀海*'
# 输出：无结果，脏文件已删除

# 统计文件数量
ls 'C:\Users\pc\Desktop\test\蠢沫沫 - NO.031 惠礼服[40P-436.8M]' | wc -l
# 输出：40（全部是图片文件）
```

### 5.3 修复效果对比

|    检查项    |           修复前            |     修复后      |
| :----------: | :-------------------------: | :-------------: |
|   命令响应   |          ❌ 无反应          |   ✅ 正常运行   |
|  脏文件清理  |     ❌ 孔雀海.url 残留      |    ✅ 已删除    |
|  压缩包清理  |   ❌ .7z.001/.7z.002 残留   |    ✅ 已删除    |
| 文件夹重命名 | ❌ 031 和目标文件夹同时存在 |  ✅ 正确重命名  |
| 子文件夹清理 |       ❌ 多层嵌套残留       |    ✅ 已清理    |
| 最终文件纯度 |    ❌ 混杂压缩包和脏文件    | ✅ 只有纯净图片 |

## 6. 总结和改进建议

### 6.1 故障根因总结

1. **跨平台兼容性不足**：未考虑 Windows 上 `pnpm exec` 的包装器机制
2. **文件匹配过于严格**：精确匹配无法处理带扩展名的脏文件
3. **错误处理不完善**：遇到冲突时选择跳过而非解决
4. **文件分类不清晰**：未区分内容文件和临时文件（压缩包）

### 6.2 代码质量改进

本次修复引入了以下最佳实践：

1. **防御性编程**：
   - 使用多条件判断提高兼容性
   - 主动处理冲突而非跳过

2. **职责分离**：
   - 新增 `isArchiveFile` 函数专门识别压缩包
   - `collectFiles` 支持过滤选项

3. **完善的文档**：
   - 所有关键函数添加 JSDoc 注释
   - 说明特殊处理的原因（如 Windows 兼容性）

4. **详细的日志**：
   - 添加操作成功的确认日志
   - 警告信息说明后续操作

### 6.3 未来改进建议

1. **配置增强**：
   - 考虑支持正则表达式匹配脏文件
   - 提供更灵活的文件过滤规则

2. **测试覆盖**：
   - 添加 Windows 平台的入口点检测测试
   - 添加文件清理的集成测试
   - 模拟冲突场景的边界测试

3. **用户体验**：
   - 提供 `--dry-run` 选项预览操作
   - 添加进度条显示解压进度
   - 支持自定义日志级别

4. **错误恢复**：
   - 实现操作失败时的回滚机制
   - 保存操作日志便于问题排查

### 6.4 经验教训

1. **入口点检测**：在 Node.js CLI 工具中，应该考虑各种包管理器（npm、yarn、pnpm）的包装器机制，使用宽松的匹配策略。

2. **文件匹配**：处理用户配置的文件名时，应该同时支持精确匹配和模糊匹配，提高容错性。

3. **冲突处理**：遇到冲突时，应该根据业务需求主动解决，而不是简单地跳过或报错。

4. **清理策略**：在文件处理流程中，应该明确区分哪些是最终产物，哪些是临时文件，确保清理逻辑的完整性。

## 7. 相关文件

**修改文件**：

- `scripts/decompress-porn-img-package/src/index.ts`

**受影响的配置**：

- `decompress-porn-img-package.config.ts`

**测试文件**：

- 实际测试目录：`C:\Users\pc\Desktop\test`

**构建产物**：

- `scripts/decompress-porn-img-package/dist/index.mjs`
- `scripts/decompress-porn-img-package/dist/index.d.mts`
