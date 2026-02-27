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
 * 2. 再检查是否存在对应编号的纯数字文件夹（如 213/）
 * 3. 再模糊匹配以该编号开头的文件夹（如 020tu, 022咬）
 * 4. 都不存在则标记为未知
 *
 * 注意：跳过已整理过的长名称文件夹（名称中包含 NO. 的）
 *
 * @param targetDir - 父目录路径
 * @param num - 编号
 */
export async function detectPhase(targetDir: string, num: number): Promise<ProcessTarget | null> {
	const numStr = String(num);
	/** 左侧补零到 3 位，用于匹配 001, 020 等格式 */
	const paddedStr = numStr.padStart(3, "0");

	/** 检查压缩包文件（精确匹配 + 补零匹配） */
	for (const ext of ARCHIVE_EXTS) {
		for (const prefix of [numStr, paddedStr]) {
			const archiveName = `${prefix}${ext}`;
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
				/** 文件不存在，继续 */
			}
		}
	}

	/** 检查纯数字文件夹（精确匹配 + 补零匹配） */
	for (const prefix of [numStr, paddedStr]) {
		const folderPath = path.join(targetDir, prefix);
		try {
			const stat = await fs.stat(folderPath);
			if (stat.isDirectory()) {
				return {
					number: num,
					phase: ProcessPhase.ORGANIZE,
					fullPath: folderPath,
					name: prefix,
				};
			}
		} catch {
			/** 不存在 */
		}
	}

	/** 模糊匹配：搜索以编号开头的文件夹（如 020tu, 022咬, 054咬一口） */
	try {
		const entries = await fs.readdir(targetDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			/** 跳过已整理过的长名称文件夹（包含 NO. 的是已处理完的） */
			if (entry.name.includes("NO.")) continue;

			/** 匹配以编号或补零编号开头的文件夹 */
			if (entry.name.startsWith(paddedStr) || entry.name.startsWith(numStr)) {
				/** 确保是编号匹配而非数字碰巧相同（如 1 不应匹配 100） */
				const afterPrefix = entry.name.startsWith(paddedStr)
					? entry.name.slice(paddedStr.length)
					: entry.name.slice(numStr.length);
				/** 数字后面跟的必须是非数字字符或为空 */
				if (afterPrefix.length === 0 || !/^\d/.test(afterPrefix)) {
					const folderPath = path.join(targetDir, entry.name);
					return {
						number: num,
						phase: ProcessPhase.ORGANIZE,
						fullPath: folderPath,
						name: entry.name,
					};
				}
			}
		}
	} catch {
		/** 读取目录失败 */
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
