import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { logger, pathExists, deleteDirtyRecursive, moveFilesToRoot } from "./file-utils.js";

/**
 * 检测目录内部是否存在多层嵌套的内容目录结构。
 *
 * 例如：
 * `213/作品名/作品名/图片文件`
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

		const subdirs = entries.filter((entry) => entry.isDirectory());
		const files = entries.filter((entry) => entry.isFile());

		/**
		 * 当前目录只有一个子目录且没有文件时，继续向下探测。
		 */
		if (subdirs.length === 1 && files.length === 0) {
			detectedName = subdirs[0].name;
			current = path.join(current, subdirs[0].name);
			continue;
		}

		/**
		 * 当前目录只有一个子目录且存在文件时，如果子目录内也有文件，则继续向下探测。
		 */
		if (subdirs.length === 1 && files.length > 0) {
			const subPath = path.join(current, subdirs[0].name);
			let subEntries;
			try {
				subEntries = await fs.readdir(subPath, { withFileTypes: true });
			} catch {
				break;
			}
			if (subEntries.some((entry) => entry.isFile())) {
				detectedName = detectedName ?? subdirs[0].name;
				current = subPath;
				continue;
			}
		}

		break;
	}

	return { deepestDir: current, detectedName };
}

/**
 * 解析根目录最终应使用的目录名称。
 *
 * 这里优先使用最后一个实际内容目录的名称；若未探测到嵌套目录，则回退到外部提供的名称。
 *
 * @param rootDir - 要分析的根目录路径
 * @param fallbackName - 未探测到语义目录名时的回退名称
 */
export async function resolveRootFolderName(rootDir: string, fallbackName?: string): Promise<string | null> {
	const { deepestDir } = await findDeepestContentDir(rootDir);

	if (deepestDir !== rootDir) {
		return path.basename(deepestDir);
	}

	return fallbackName ?? null;
}

/**
 * 整理已经解压但目录层级过深的文件夹。
 *
 * @param folderPath - 编号目录路径
 * @param config - 工具配置
 */
export async function organizeFolder(folderPath: string, config: ResolvedConfig): Promise<void> {
	const folderName = path.basename(folderPath);
	logger.info(`开始整理文件夹: ${folderName}`);

	/** 第 1 步：删除脏文件 */
	await deleteDirtyRecursive(folderPath, config.dirtyFiles);

	/** 第 2 步：检测最深层内容目录 */
	const { deepestDir, detectedName } = await findDeepestContentDir(folderPath);

	if (deepestDir === folderPath) {
		logger.info(`  文件夹 ${folderName} 无需整理，结构已经扁平`);
		return;
	}

	logger.info(`  检测到嵌套结构，最深内容目录: ${path.relative(folderPath, deepestDir)}`);
	if (detectedName) {
		logger.info(`  检测到名称: ${detectedName}`);
	}

	/** 第 3 步：移动文件到根目录 */
	if (config.isMoveFilesToRoot) {
		await moveFilesToRoot(folderPath);
		logger.info(`  已完成文件移动到根目录: ${folderName}`);
	}

	/** 第 4 步：再次删除脏文件 */
	await deleteDirtyRecursive(folderPath, config.dirtyFiles);

	/** 第 5 步：可选重命名 */
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
