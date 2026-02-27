#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { name as packageName, version as packageVersion } from "../package.json";
import { loadToolConfig } from "./config.js";
import { logger, validateTargetDir } from "./file-utils.js";
import { runProcess } from "./processor.js";

logger.info(`${packageName} v${packageVersion} is running...`);

/** 主入口函数 */
export async function main(): Promise<void> {
	let targetArg = process.argv[2];
	if (!targetArg) {
		logger.error("请提供要处理的绝对路径目录");
		process.exit(1);
	}

	/** 移除可能存在的引号（Windows CMD 兼容性） */
	if (
		(targetArg.startsWith("'") && targetArg.endsWith("'")) ||
		(targetArg.startsWith('"') && targetArg.endsWith('"'))
	) {
		targetArg = targetArg.slice(1, -1);
	}

	await validateTargetDir(targetArg);
	const config = await loadToolConfig();
	const targetDir = path.resolve(targetArg);

	await runProcess(targetDir, config);
}

/** 检查当前模块是否作为入口点运行 */
function isEntryPoint(metaUrl: string): boolean {
	const current = fileURLToPath(metaUrl);
	const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
	return current === invoked || current.endsWith(path.basename(invoked));
}

if (isEntryPoint(import.meta.url)) {
	main().catch((error) => {
		logger.error(error);
		process.exit(1);
	});
}
