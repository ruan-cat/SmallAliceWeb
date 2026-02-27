import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { path7za } from "7zip-bin";
import type { ResolvedConfig } from "./config.js";
import type { VolumeSet } from "./types.js";
import { ARCHIVE_EXTS, logger, ensureDir, pathExists, deleteDirtyRecursive, moveFilesToRoot } from "./file-utils.js";

/**
 * 判断文件名是否为待处理的压缩包候选
 * @param fileName - 文件名
 * @param allowMixed - 是否允许混合命名
 */
export function isArchiveCandidate(fileName: string, allowMixed: boolean): boolean {
	const ext = path.extname(fileName).toLowerCase();
	if (!ARCHIVE_EXTS.has(ext)) return false;
	const base = path.parse(fileName).name;
	if (/^\d+$/.test(base)) return true;
	return allowMixed;
}

/** 执行 7z 命令（支持超时） */
async function run7z(args: string[], cwd: string, timeout?: number): Promise<void> {
	try {
		await execa(path7za, args, { cwd, timeout });
	} catch (error: any) {
		if (error?.timedOut) {
			throw new Error(`7z 解压超时（超过 ${timeout}ms）`);
		}
		logger.error("7z 解压失败", error);
		throw error;
	}
}

/** 解压压缩包到指定输出目录 */
export async function extractArchive(
	archivePath: string,
	outputDir: string,
	password: string,
	timeout?: number,
): Promise<void> {
	await ensureDir(outputDir);
	await run7z(["x", archivePath, `-o${outputDir}`, `-p${password}`, "-y"], path.dirname(archivePath), timeout);
}

/**
 * 在指定目录中递归查找分卷压缩文件集
 */
export async function findVolumeSet(baseDir: string): Promise<VolumeSet | null> {
	const stack = [baseDir];
	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		const entries = await fs.readdir(current, { withFileTypes: true });
		const volumeFiles = entries
			.filter((entry) => entry.isFile() && /\.7z\.\d+$/.test(entry.name))
			.map((entry) => entry.name);
		if (volumeFiles.length) {
			const baseName = volumeFiles[0].replace(/\.7z\.\d+$/, "");
			return {
				dir: current,
				baseName,
				files: volumeFiles.map((file) => path.join(current, file)),
			};
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				stack.push(path.join(current, entry.name));
			}
		}
	}
	return null;
}

/** 删除分卷目录中非分卷格式的文件 */
async function deleteNonVolumeFiles(volumeDir: string, baseName: string): Promise<void> {
	const entries = await fs.readdir(volumeDir, { withFileTypes: true });
	const allowedPrefix = `${baseName}.7z.`;
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.startsWith(allowedPrefix)) {
			await fs.rm(path.join(volumeDir, entry.name), { force: true });
		}
	}
}

/**
 * 筛选目录中符合规则的压缩包文件名列表
 */
export async function selectArchives(targetDir: string, config: ResolvedConfig): Promise<string[]> {
	const entries = await fs.readdir(targetDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && isArchiveCandidate(entry.name, config.isDecompressMixedNamedPackages))
		.map((entry) => entry.name);
}

/**
 * 处理单个压缩包的完整流程
 * 原始的解压缩逻辑：解压 → 分卷解压 → 整理 → 重命名
 */
export async function processArchive(targetDir: string, archiveName: string, config: ResolvedConfig): Promise<void> {
	const archivePath = path.join(targetDir, archiveName);
	const baseName = path.parse(archiveName).name;
	const extractionDir = path.join(targetDir, baseName);
	const timeout = config.decompressTimeout;

	logger.info(`开始处理压缩包: ${archiveName}`);

	try {
		await extractArchive(archivePath, extractionDir, config.password, timeout);
	} catch (error: any) {
		if (error?.message?.includes("超时")) {
			logger.warn(`❗ 解压超时，跳过: ${archiveName} (超时 ${timeout}ms)`);
			return;
		}
		throw error;
	}

	if (config.isDeletePackages) {
		await fs.rm(archivePath, { force: true });
	}
	await deleteDirtyRecursive(extractionDir, config.dirtyFiles);

	const volumeSet = await findVolumeSet(extractionDir);
	if (volumeSet) {
		logger.info(`发现分卷压缩: ${volumeSet.baseName}`);
		await deleteNonVolumeFiles(volumeSet.dir, volumeSet.baseName);
		const firstVolume = path.join(volumeSet.dir, `${volumeSet.baseName}.7z.001`);

		try {
			await extractArchive(firstVolume, volumeSet.dir, config.password, timeout);
		} catch (error: any) {
			if (error?.message?.includes("超时")) {
				logger.warn(`❗ 分卷解压超时，跳过: ${volumeSet.baseName} (超时 ${timeout}ms)`);
				return;
			}
			throw error;
		}

		if (config.isDeletePackages) {
			for (const file of volumeSet.files) {
				await fs.rm(file, { force: true });
			}
		}
		await deleteDirtyRecursive(volumeSet.dir, config.dirtyFiles);
	}

	if (config.isMoveFilesToRoot) {
		await moveFilesToRoot(extractionDir);
	}

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
}
