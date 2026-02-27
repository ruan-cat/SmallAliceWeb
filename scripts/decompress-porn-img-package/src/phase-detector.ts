import fs from "node:fs/promises";
import path from "node:path";
import type { FolderRange, ProcessTarget } from "./types.js";
import { ProcessPhase } from "./types.js";
import { ARCHIVE_EXTS, logger } from "./file-utils.js";

/**
 * 生成范围内的编号数组
 * @param range - 起始和结束编号（含）
 */
export function generateNumberRange(range: FolderRange): number[] {
	const numbers: number[] = [];
	for (let i = range.start; i <= range.end; i++) {
		numbers.push(i);
	}
	return numbers;
}

/**
 * 智能检测单个编号对应的处理阶段
 *
 * 检测逻辑：
 * 1. 先检查是否存在对应编号的压缩包文件（如 221.gz, 221.zip, 221.7z）
 * 2. 再检查是否存在对应编号的文件夹（如 213/）
 * 3. 都不存在则标记为未知
 *
 * @param targetDir - 父目录路径
 * @param num - 编号
 */
export async function detectPhase(targetDir: string, num: number): Promise<ProcessTarget | null> {
	const numStr = String(num);

	/** 检查压缩包文件 */
	for (const ext of ARCHIVE_EXTS) {
		const archiveName = `${numStr}${ext}`;
		const archivePath = path.join(targetDir, archiveName);
		try {
			const stat = await fs.stat(archivePath);
			if (stat.isFile()) {
				return {
					number: num,
					phase: ProcessPhase.DECOMPRESS,
					fullPath: archivePath,
					name: archiveName,
				};
			}
		} catch {
			/** 文件不存在，继续检查下一个扩展名 */
		}
	}

	/** 检查文件夹 */
	const folderPath = path.join(targetDir, numStr);
	try {
		const stat = await fs.stat(folderPath);
		if (stat.isDirectory()) {
			return {
				number: num,
				phase: ProcessPhase.ORGANIZE,
				fullPath: folderPath,
				name: numStr,
			};
		}
	} catch {
		/** 文件夹不存在 */
	}

	return null;
}

/**
 * 批量检测指定范围内所有编号的处理阶段
 * @param targetDir - 父目录路径
 * @param range - 编号范围
 */
export async function detectAllTargets(targetDir: string, range: FolderRange): Promise<ProcessTarget[]> {
	const numbers = generateNumberRange(range);
	const targets: ProcessTarget[] = [];

	logger.info(`开始检测编号范围 ${range.start} ~ ${range.end} 的处理目标...`);

	for (const num of numbers) {
		const target = await detectPhase(targetDir, num);
		if (target) {
			logger.info(
				`  编号 ${num}: ${target.phase === ProcessPhase.DECOMPRESS ? "📦 压缩包 → 解压流程" : "📁 文件夹 → 整理流程"} (${target.name})`,
			);
			targets.push(target);
		} else {
			logger.debug(`  编号 ${num}: ⏭️ 未找到对应文件或文件夹，跳过`);
		}
	}

	const decompressCount = targets.filter((t) => t.phase === ProcessPhase.DECOMPRESS).length;
	const organizeCount = targets.filter((t) => t.phase === ProcessPhase.ORGANIZE).length;
	logger.info(`检测完成: 共 ${targets.length} 个目标 (📦 解压: ${decompressCount}, 📁 整理: ${organizeCount})`);

	return targets;
}
