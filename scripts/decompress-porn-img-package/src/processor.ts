import type { ResolvedConfig } from "./config.js";
import type { ProcessTarget } from "./types.js";
import { ProcessPhase } from "./types.js";
import { logger } from "./file-utils.js";
import { processArchive, selectArchives } from "./archive.js";
import { detectAllTargets } from "./phase-detector.js";
import { organizeFolder } from "./folder-organizer.js";

/**
 * 按照编号范围模式处理目标
 *
 * 智能识别每个编号对应的处理阶段：
 * - 压缩包 → 解压流程
 * - 文件夹 → 整理流程
 *
 * @param targetDir - 父目录路径
 * @param config - 工具配置
 */
async function processWithRange(targetDir: string, config: ResolvedConfig): Promise<void> {
	if (!config.folderRange) {
		throw new Error("folderRange 配置缺失");
	}

	const targets = await detectAllTargets(targetDir, config.folderRange);

	if (!targets.length) {
		logger.warn(`在范围 ${config.folderRange.start} ~ ${config.folderRange.end} 内未找到任何处理目标`);
		return;
	}

	logger.info(`开始按顺序处理 ${targets.length} 个目标...\n`);

	for (let i = 0; i < targets.length; i++) {
		const target = targets[i];
		logger.info(`━━━ [${i + 1}/${targets.length}] 处理编号 ${target.number} ━━━`);
		await processTarget(targetDir, target, config);
		logger.info("");
	}
}

/**
 * 处理单个目标（根据阶段分发到不同处理逻辑）
 */
async function processTarget(targetDir: string, target: ProcessTarget, config: ResolvedConfig): Promise<void> {
	switch (target.phase) {
		case ProcessPhase.DECOMPRESS:
			await processArchive(targetDir, target.name, config);
			break;
		case ProcessPhase.ORGANIZE:
			await organizeFolder(target.fullPath, config);
			break;
		default:
			logger.warn(`编号 ${target.number}: 未知处理阶段，跳过`);
	}
}

/**
 * 按照原始模式处理目标（处理目录下所有符合规则的压缩包）
 *
 * @param targetDir - 目标目录路径
 * @param config - 工具配置
 */
async function processAllArchives(targetDir: string, config: ResolvedConfig): Promise<void> {
	const archives = await selectArchives(targetDir, config);
	if (!archives.length) {
		logger.warn("未找到符合规则的压缩包");
		return;
	}
	logger.info(`找到 ${archives.length} 个压缩包，开始处理...\n`);
	for (const archive of archives) {
		await processArchive(targetDir, archive, config);
	}
}

/**
 * 主处理入口
 * 根据配置中是否设置了 folderRange，选择不同的处理模式
 *
 * @param targetDir - 目标目录路径
 * @param config - 工具配置
 */
export async function runProcess(targetDir: string, config: ResolvedConfig): Promise<void> {
	if (config.folderRange) {
		logger.info(`🎯 范围处理模式: 编号 ${config.folderRange.start} ~ ${config.folderRange.end}`);
		await processWithRange(targetDir, config);
	} else {
		logger.info("📦 全量处理模式: 处理目录下所有压缩包");
		await processAllArchives(targetDir, config);
	}
	logger.success("处理完成 ✅");
}
