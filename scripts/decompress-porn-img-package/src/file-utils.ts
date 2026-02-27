import fs from "node:fs/promises";
import path from "node:path";
import { consola } from "consola";
import { name as packageName } from "../package.json";

/** 已知的压缩包扩展名集合 */
export const ARCHIVE_EXTS = new Set([".gz", ".zip", ".7z"]);

/** 日志记录器 */
export const logger = consola.withTag(packageName);

/** 判断文件是否是压缩包（包括分卷压缩） */
export function isArchiveFile(fileName: string): boolean {
	const lowerName = fileName.toLowerCase();
	if (ARCHIVE_EXTS.has(path.extname(lowerName))) return true;
	if (/\.7z\.\d+$/.test(lowerName)) return true;
	return false;
}

/** 判断路径是否存在 */
export async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

/** 确保目录存在 */
export async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

/**
 * 生成唯一的目标路径
 * 若目标路径已存在，则自动添加递增后缀
 */
export async function makeUniqueDest(baseDir: string, fileName: string): Promise<string> {
	let candidate = path.join(baseDir, fileName);
	const ext = path.extname(fileName);
	const stem = path.basename(fileName, ext);
	let counter = 1;
	while (await pathExists(candidate)) {
		candidate = path.join(baseDir, `${stem}-${counter}${ext}`);
		counter += 1;
	}
	return candidate;
}

/**
 * 递归收集目录下的所有文件
 * @param dir - 目标目录
 * @param excludeArchives - 是否排除压缩包文件
 */
export async function collectFiles(dir: string, excludeArchives: boolean = false): Promise<string[]> {
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
				if (excludeArchives && isArchiveFile(entry.name)) continue;
				files.push(full);
			}
		}
	}
	return files;
}

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
			const fileNameWithoutExt = path.parse(entry.name).name;
			const shouldDelete = dirtyNames.includes(entry.name) || dirtyNames.includes(fileNameWithoutExt);
			if (shouldDelete) {
				await fs.rm(full, { force: true });
				logger.info(`已删除脏文件: ${full}`);
			}
		}
	}
}

/**
 * 移动文件到根目录
 * 会排除压缩包文件，确保最终只有纯粹的内容文件
 */
export async function moveFilesToRoot(rootDir: string): Promise<void> {
	const files = await collectFiles(rootDir, true);
	for (const file of files) {
		const parent = path.dirname(file);
		if (parent === rootDir) continue;
		const dest = await makeUniqueDest(rootDir, path.basename(file));
		await ensureDir(path.dirname(dest));
		await fs.rename(file, dest);
	}
	await removeEmptyDirs(rootDir, rootDir);
}

/**
 * 递归删除空目录和只包含压缩包的目录
 */
export async function removeEmptyDirs(base: string, keep: string): Promise<void> {
	const entries = await fs.readdir(base, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(base, entry.name);
		if (entry.isDirectory()) {
			await removeEmptyDirs(full, keep);
			let after: string[];
			try {
				after = await fs.readdir(full);
			} catch {
				continue;
			}
			const hasNonArchiveFiles = after.some((name) => !isArchiveFile(name));
			if (after.length === 0 || !hasNonArchiveFiles) {
				await fs.rm(full, { recursive: true, force: true }).catch(() => {});
			}
		}
	}
	if (base !== keep) {
		const remaining = await fs.readdir(base);
		const hasNonArchiveFiles = remaining.some((name) => !isArchiveFile(name));
		if (remaining.length === 0 || !hasNonArchiveFiles) {
			await fs.rm(base, { recursive: true, force: true }).catch(() => {});
		}
	}
}

/**
 * 验证目标目录是否有效
 */
export async function validateTargetDir(target: string): Promise<void> {
	if (!path.isAbsolute(target)) {
		logger.error("请提供 Windows 绝对路径目录");
		process.exit(1);
	}
	let stat;
	try {
		stat = await fs.stat(target);
	} catch {
		logger.error("提供的路径不存在");
		process.exit(1);
	}
	if (!stat.isDirectory()) {
		logger.error("提供的路径不是目录");
		process.exit(1);
	}
}
