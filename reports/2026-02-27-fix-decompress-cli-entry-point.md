# 2026-02-27 修复 @ruan-cat/decompress-porn-img-package CLI 入口无法执行的错误

## 1. 错误现象

运行 `pnpm run do-dpip` 命令后，CLI 仅输出启动日志便立即退出，没有执行任何处理逻辑：

```log
> @ruan-cat/decompress-porn-img-package@1.0.0 do-dpip
> pnpm exec decompress-porn-img-package 'D:/store/baidu/315.咬一口兔娘'

[@ruan-cat/decompress-porn-img-package 20:37:35] ℹ @ruan-cat/decompress-porn-img-package v1.0.0 is running...
```

之后毫无反应，程序直接退出。

## 2. 根因分析

### 2.1 直接原因

`main()` 函数被定义并导出，但从未被调用。

### 2.2 根本原因

问题出在 **tsdown（基于 rolldown）的 code splitting 行为** 与 **CLI 入口设计** 之间的冲突。

原始的 `cli.ts` 代码结构如下：

```typescript
export async function main(): Promise<void> {
	// ... 处理逻辑
}

function isEntryPoint(metaUrl: string): boolean {
	const current = fileURLToPath(metaUrl);
	const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
	return current === invoked || current.endsWith(path.basename(invoked));
}

if (isEntryPoint(import.meta.url)) {
	main().catch((error) => {
		/* ... */
	});
}
```

tsdown 打包后，产生了以下构建产物：

|        文件        |  大小   |                            内容                             |
| :----------------: | :-----: | :---------------------------------------------------------: |
|   `dist/cli.mjs`   | 0.09 kB | 仅 `import { main } from "./cli-xxx.mjs"; export { main };` |
| `dist/cli-xxx.mjs` |  19 kB  |                  包含全部业务逻辑的 chunk                   |

**关键问题：** rolldown 在 code splitting 时，将 `main` 函数体拆到了 chunk 文件中，而 `isEntryPoint` 检查 + `main()` 调用也被拆进 chunk。但由于：

1. `isEntryPoint` 在 chunk 中执行时，`import.meta.url` 指向 chunk 文件路径（如 `cli-BOTOReWZ.mjs`），与 `process.argv[1]`（指向 `cli.mjs`）**路径不匹配**
2. 因此 `isEntryPoint()` 返回 `false`，`main()` **从未被调用**

即使后续移除了 `isEntryPoint` 检查，直接写 `main().catch(...)`，由于 `main` 是 `export` 的，rolldown 仍然将其当作纯导出符号处理，**顶层的 `main()` 调用被 tree-shake 掉了**。

### 2.3 问题链路图

```plain
cli.ts 源码
  ├── export function main() { ... }  ← rolldown 认为这是库导出
  └── main().catch(...)               ← rolldown 认为这是 dead code → tree-shake 掉
         ↓ 打包后
dist/cli.mjs
  └── export { main }                 ← 仅 re-export，无调用
```

## 3. 修复方案

将 `cli.ts` 改为**纯 side-effect 模块**，不导出任何符号：

```typescript
/** CLI 入口 — 不导出任何符号，确保 rolldown 保留顶层调用 */
async function run(): Promise<void> {
	// ... 处理逻辑（与原 main 函数相同）
}

run().catch((error) => {
	logger.error(error);
	process.exit(1);
});
```

修复后的构建产物：

|           文件           |  大小   |                      内容                       |
| :----------------------: | :-----: | :---------------------------------------------: |
|      `dist/cli.mjs`      | 0.92 kB | 包含 `run()` 函数定义和 `run().catch(...)` 调用 |
| `dist/processor-xxx.mjs` |  18 kB  |              共享的业务逻辑 chunk               |

现在 `cli.mjs` 中 `run()` 被**直接调用**，CLI 能正常执行处理流程。

## 4. 经验教训

### 4.1 tsdown/rolldown code splitting 的陷阱

当一个入口文件同时具有 **export 导出** 和 **顶层 side-effect 调用** 时，rolldown 可能会将 side-effect 拆进 chunk 并 tree-shake 掉。

**规则：CLI 入口文件不应 export 任何符号。** 如果需要将 `main` 函数暴露给外部使用，应通过独立的库入口文件（`index.ts`）导出，而非 CLI 入口。

### 4.2 isEntryPoint 模式在打包场景下不可靠

`isEntryPoint(import.meta.url)` 这种通过路径匹配判断是否为入口的模式，在 bundler 打包后路径会变化（chunk 文件名带 hash），导致检查永远失败。

**规则：CLI 入口应无条件执行，不做 isEntryPoint 检查。**

## 5. 受影响的文件

|      文件      |                            变更                             |
| :------------: | :---------------------------------------------------------: |
|  `src/cli.ts`  | 移除 `export`、移除 `isEntryPoint`，改为纯 side-effect 模块 |
| `src/index.ts` |         移除对 `cli.js` 的 `main` 导出（不再存在）          |
