#!/usr/bin/env node
import { loadConfig } from "c12";
import { consola } from "consola";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { path7za } from "7zip-bin";

export type ToolConfig = {
	password?: string;
	dirtyFiles?: string[];
	isPureDecompress?: boolean;
	isDecompressMixedNamedPackages?: boolean;
	isDeletePackages?: boolean;
	isMoveFilesToRoot?: boolean;
	isRenameRootFolder?: boolean;
};

const DEFAULT_CONFIG: Required<ToolConfig> = {
	password: "https://www.91xiezhen.top",
	dirtyFiles: ["孔雀海"],
	isPureDecompress: true,
	isDecompressMixedNamedPackages: false,
	isDeletePackages: false,
	isMoveFilesToRoot: true,
	isRenameRootFolder: true,
};

const ARCHIVE_EXTS = new Set([".gz", ".zip", ".7z"]);
const logger = consola.withTag("@ruan-cat/decompress");

export async function loadToolConfig(): Promise<Required<ToolConfig>> {
	const { config } = await loadConfig<ToolConfig>({
		name: "decompress-porn-img-package",
		defaults: DEFAULT_CONFIG,
	});
	return { ...DEFAULT_CONFIG, ...(config ?? {}) };
}

export function isArchiveCandidate(fileName: string, allowMixed: boolean): boolean {
	const ext = path.extname(fileName).toLowerCase();
	if (!ARCHIVE_EXTS.has(ext)) return false;
	const base = path.parse(fileName).name;
	if (/^\d+$/.test(base)) return true;
	return allowMixed;
}

export async function selectArchives(
	targetDir: string,
	config: Required<ToolConfig>,
): Promise<string[]> {
	const entries = await fs.readdir(targetDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && isArchiveCandidate(entry.name, config.isDecompressMixedNamedPackages))
		.map((entry) => entry.name);
}

type VolumeSet = {
	dir: string;
	baseName: string;
	files: string[];
};

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
			if (dirtyNames.includes(entry.name)) {
				await fs.rm(full, { force: true });
				logger.info(`已删除脏文件: ${full}`);
			}
		}
	}
}

async function run7z(args: string[], cwd: string): Promise<void> {
	try {
		await execa(path7za, args, { cwd });
	} catch (error) {
		logger.error("7z 解压失败", error);
		throw error;
	}
}

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

async function extractArchive(archivePath: string, outputDir: string, password: string): Promise<void> {
	await ensureDir(outputDir);
	await run7z(["x", archivePath, `-o${outputDir}`, `-p${password}`, "-y"], path.dirname(archivePath));
}

async function findVolumeSet(baseDir: string): Promise<VolumeSet | null> {
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

async function collectFiles(dir: string): Promise<string[]> {
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
				files.push(full);
			}
		}
	}
	return files;
}

async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function makeUniqueDest(baseDir: string, fileName: string): Promise<string> {
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

export async function moveFilesToRoot(rootDir: string): Promise<void> {
	const files = await collectFiles(rootDir);
	for (const file of files) {
		const parent = path.dirname(file);
		if (parent === rootDir) continue;
		const dest = await makeUniqueDest(rootDir, path.basename(file));
		await ensureDir(path.dirname(dest));
		await fs.rename(file, dest);
	}
	await removeEmptyDirs(rootDir, rootDir);
}

async function removeEmptyDirs(base: string, keep: string): Promise<void> {
	const entries = await fs.readdir(base, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(base, entry.name);
		if (entry.isDirectory()) {
			await removeEmptyDirs(full, keep);
			let after: string[];
			try {
				after = await fs.readdir(full);
			} catch {
				continue; // 目录已被移除或不可访问时跳过
			}
			if (after.length === 0) {
				await fs.rmdir(full).catch(() => {});
			}
		}
	}
	if (base !== keep) {
		const remaining = await fs.readdir(base);
		if (remaining.length === 0) {
			await fs.rmdir(base).catch(() => {});
		}
	}
}

async function processArchive(
	targetDir: string,
	archiveName: string,
	config: Required<ToolConfig>,
): Promise<void> {
	const archivePath = path.join(targetDir, archiveName);
	const baseName = path.parse(archiveName).name;
	const extractionDir = path.join(targetDir, baseName);

	logger.info(`开始处理压缩包: ${archiveName}`);
	await extractArchive(archivePath, extractionDir, config.password);
	if (config.isDeletePackages) {
		await fs.rm(archivePath, { force: true });
	}
	await deleteDirtyRecursive(extractionDir, config.dirtyFiles);

	const volumeSet = await findVolumeSet(extractionDir);
	if (volumeSet) {
		logger.info(`发现分卷压缩: ${volumeSet.baseName}`);
		await deleteNonVolumeFiles(volumeSet.dir, volumeSet.baseName);
		const firstVolume = path.join(volumeSet.dir, `${volumeSet.baseName}.7z.001`);
		await extractArchive(firstVolume, volumeSet.dir, config.password);
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
				logger.warn(`目标目录已存在，跳过重命名: ${nextDir}`);
			} else {
				await fs.rename(extractionDir, nextDir);
			}
		}
	}
}

async function validateTargetDir(target: string): Promise<void> {
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

export async function main(): Promise<void> {
	const targetArg = process.argv[2];
	if (!targetArg) {
		logger.error("请提供要处理的绝对路径目录");
		process.exit(1);
	}

	await validateTargetDir(targetArg);
	const config = await loadToolConfig();
	const targetDir = path.resolve(targetArg);
	const archives = await selectArchives(targetDir, config);
	if (!archives.length) {
		logger.warn("未找到符合规则的压缩包");
		return;
	}
	for (const archive of archives) {
		await processArchive(targetDir, archive, config);
	}
	logger.success("压缩包处理完成");
}

function isEntryPoint(metaUrl: string): boolean {
	const current = fileURLToPath(metaUrl);
	const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
	return current === invoked;
}

if (isEntryPoint(import.meta.url)) {
	main().catch((error) => {
		logger.error(error);
		process.exit(1);
	});
}

