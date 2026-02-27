#!/usr/bin/env node
import path from "node:path";
import { name as packageName, version as packageVersion } from "../package.json";
import { loadToolConfig } from "./config.js";
import { logger, validateTargetDir } from "./file-utils.js";
import { runProcess } from "./processor.js";

logger.info(`${packageName} v${packageVersion} is running...`);

/** CLI 入口 — 解析参数并执行处理流程 */
async function run(): Promise<void> {
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

run().catch((error) => {
	logger.error(error);
	process.exit(1);
});
