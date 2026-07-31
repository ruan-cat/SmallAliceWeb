import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export type KnowledgeSourceErrorCode =
	| "SOURCE_DIRECTORY_READ_FAILED"
	| "SOURCE_FILE_READ_FAILED"
	| "SOURCE_ROOT_NOT_DIRECTORY"
	| "SOURCE_ROOT_NOT_FOUND";

export type KnowledgeSourceOptions = {
	repositoryRoot: string;
	sourceRoot: string;
};

export type KnowledgeSourceDocument = {
	content: string;
	sourcePath: string;
};

/** 表示知识源本地扫描期间可由调用方明确处理的失败。 */
export class KnowledgeSourceError extends Error {
	constructor(
		public readonly code: KnowledgeSourceErrorCode,
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "KnowledgeSourceError";
	}
}

/** 将本机路径转换为仓库内稳定的 sourcePath。 */
function toSourcePath(repositoryRoot: string, filePath: string) {
	return relative(repositoryRoot, filePath).replaceAll("\\", "/");
}

/** 用不依赖系统区域设置的规则比较 sourcePath。 */
function compareBySourcePath(left: KnowledgeSourceDocument, right: KnowledgeSourceDocument) {
	return left.sourcePath < right.sourcePath ? -1 : left.sourcePath > right.sourcePath ? 1 : 0;
}

/** 递归枚举根目录下所有 Markdown 文件的绝对路径。 */
async function collectMarkdownFiles(directory: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		throw new KnowledgeSourceError("SOURCE_DIRECTORY_READ_FAILED", `无法读取知识源目录：${directory}`, error);
	}

	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(entryPath)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(entryPath);
		}
	}

	return files;
}

/** 从配置的本地根目录读取全部 Markdown 知识源。 */
export async function readKnowledgeSources(options: KnowledgeSourceOptions): Promise<KnowledgeSourceDocument[]> {
	let sourceRootStat;
	try {
		sourceRootStat = await stat(options.sourceRoot);
	} catch (error) {
		throw new KnowledgeSourceError("SOURCE_ROOT_NOT_FOUND", `知识源根目录不存在：${options.sourceRoot}`, error);
	}

	if (!sourceRootStat.isDirectory()) {
		throw new KnowledgeSourceError("SOURCE_ROOT_NOT_DIRECTORY", `知识源根路径不是目录：${options.sourceRoot}`);
	}

	const files = await collectMarkdownFiles(options.sourceRoot);
	const documents = await Promise.all(
		files.map(async (filePath) => {
			try {
				return {
					content: await readFile(filePath, "utf8"),
					sourcePath: toSourcePath(options.repositoryRoot, filePath),
				};
			} catch (error) {
				throw new KnowledgeSourceError("SOURCE_FILE_READ_FAILED", `无法读取 Markdown 知识源：${filePath}`, error);
			}
		}),
	);

	return documents.sort(compareBySourcePath);
}
