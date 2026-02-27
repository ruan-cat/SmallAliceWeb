import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { logger, pathExists, deleteDirtyRecursive, moveFilesToRoot } from "./file-utils.js";

/**
 * 检测文件夹内部是否有多层嵌套的同名目录结构
 * 返回最深层内容目录的路径
 *
 * 典型结构：
 * ```
 * 213/
 * └── 某某 - NO.213 xxx[40P-400M]/
 *     └── 某某 - NO.213 xxx[40P-400M]/
 *         └── (图片文件们)
 * ```
 *
 * @param rootDir - 要分析的根目录路径
 */
export async function findDeepestContentDir(
	rootDir: string,
): Promise<{ deepestDir: string; detectedName: string | null }> {
	let current = rootDir;
	let detectedName: string | null = null;

	while (true) {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			break;
		}

		const subdirs = entries.filter((e) => e.isDirectory());
		const files = entries.filter((e) => e.isFile());

		/**
		 * 当目录内只有一个子目录且没有有效文件（或只有脏文件）时，
		 * 认为这是一个中间层级，继续深入
		 */
		if (subdirs.length === 1 && files.length === 0) {
			detectedName = subdirs[0].name;
			current = path.join(current, subdirs[0].name);
			continue;
		}

		/**
		 * 当目录内有一个子目录且有少量文件时，
		 * 检查子目录是否也包含内容，如果是则继续深入
		 */
		if (subdirs.length === 1 && files.length > 0) {
			const subPath = path.join(current, subdirs[0].name);
			let subEntries;
			try {
				subEntries = await fs.readdir(subPath, { withFileTypes: true });
			} catch {
				break;
			}
			/** 子目录有内容文件，继续深入 */
			if (subEntries.some((e) => e.isFile())) {
				detectedName = detectedName ?? subdirs[0].name;
				current = subPath;
				continue;
			}
		}

		/** 到达内容层级，停止深入 */
		break;
	}

	return { deepestDir: current, detectedName };
}

/**
 * 整理已解压但目录层级过深的文件夹
 *
 * 处理流程：
 * 1. 删除脏文件
 * 2. 检测最深层内容目录
 * 3. 移动内容文件到根编号目录
 * 4. 清理多余嵌套空目录
 * 5. 可选：用检测到的名称重命名根目录
 *
 * @param folderPath - 编号目录路径（如 D:\store\baidu\315.咬一口兔娘\213）
 * @param config - 工具配置
 */
export async function organizeFolder(folderPath: string, config: ResolvedConfig): Promise<void> {
	const folderName = path.basename(folderPath);
	logger.info(`开始整理文件夹: ${folderName}`);

	/** 步骤 1：删除脏文件 */
	await deleteDirtyRecursive(folderPath, config.dirtyFiles);

	/** 步骤 2：检测最深内容目录 */
	const { deepestDir, detectedName } = await findDeepestContentDir(folderPath);

	if (deepestDir === folderPath) {
		logger.info(`  文件夹 ${folderName} 无需整理，结构已经扁平`);
		return;
	}

	logger.info(`  检测到嵌套结构，最深内容目录: ${path.relative(folderPath, deepestDir)}`);
	if (detectedName) {
		logger.info(`  检测到名称: ${detectedName}`);
	}

	/** 步骤 3：移动文件到根目录 */
	if (config.isMoveFilesToRoot) {
		await moveFilesToRoot(folderPath);
		logger.info(`  已完成文件移动到根目录: ${folderName}`);
	}

	/** 步骤 4：再次删除脏文件 */
	await deleteDirtyRecursive(folderPath, config.dirtyFiles);

	/** 步骤 5：可选重命名 */
	if (detectedName && config.isRenameRootFolder) {
		const parentDir = path.dirname(folderPath);
		const newPath = path.join(parentDir, detectedName);
		if (newPath !== folderPath) {
			if (await pathExists(newPath)) {
				logger.warn(`  目标目录已存在，将删除旧目录: ${newPath}`);
				await fs.rm(newPath, { recursive: true, force: true });
			}
			await fs.rename(folderPath, newPath);
			logger.info(`  已重命名文件夹: ${folderName} -> ${detectedName}`);
		}
	}

	logger.success(`文件夹整理完成: ${folderName}`);
}
