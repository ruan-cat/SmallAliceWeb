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

/** 一次扫描的完整性和逐文件失败路径。 */
export type KnowledgeSourceScan = {
	documents: KnowledgeSourceDocument[];
	failedFiles: string[];
	complete: boolean;
	errorCode?: KnowledgeSourceErrorCode;
};

/** 可注入文件读取器，以便验证单文件失败不会丢失其他来源。 */
export type KnowledgeSourceReader = (filePath: string) => Promise<string>;

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
	const result = await scanKnowledgeSources(options);
	if (!result.complete) {
		const failedFile = result.failedFiles[0] ?? options.sourceRoot;
		const errorCode = result.errorCode ?? "SOURCE_FILE_READ_FAILED";
		const message =
			errorCode === "SOURCE_ROOT_NOT_FOUND"
				? `知识源根目录不存在：${options.sourceRoot}`
				: errorCode === "SOURCE_ROOT_NOT_DIRECTORY"
					? `知识源根路径不是目录：${options.sourceRoot}`
					: `无法读取 Markdown 知识源：${failedFile}`;
		throw new KnowledgeSourceError(errorCode, message);
	}
	return result.documents;
}

/** 扫描全部 Markdown，并保留成功文档与失败路径，供增量同步处理 partial 状态。 */
export async function scanKnowledgeSources(
	options: KnowledgeSourceOptions,
	reader: KnowledgeSourceReader = (filePath) => readFile(filePath, "utf8"),
): Promise<KnowledgeSourceScan> {
	let sourceRootStat;
	try {
		sourceRootStat = await stat(options.sourceRoot);
	} catch (error) {
		return {
			documents: [],
			failedFiles: [toSourcePath(options.repositoryRoot, options.sourceRoot)],
			complete: false,
			errorCode: "SOURCE_ROOT_NOT_FOUND",
		};
	}

	if (!sourceRootStat.isDirectory()) {
		return {
			documents: [],
			failedFiles: [toSourcePath(options.repositoryRoot, options.sourceRoot)],
			complete: false,
			errorCode: "SOURCE_ROOT_NOT_DIRECTORY",
		};
	}

	let files: string[];
	try {
		files = await collectMarkdownFiles(options.sourceRoot);
	} catch {
		return {
			documents: [],
			failedFiles: [toSourcePath(options.repositoryRoot, options.sourceRoot)],
			complete: false,
			errorCode: "SOURCE_DIRECTORY_READ_FAILED",
		};
	}

	const documents: KnowledgeSourceDocument[] = [];
	const failedFiles: string[] = [];
	for (const filePath of files) {
		try {
			documents.push({
				content: await reader(filePath),
				sourcePath: toSourcePath(options.repositoryRoot, filePath),
			});
		} catch {
			failedFiles.push(toSourcePath(options.repositoryRoot, filePath));
		}
	}

	return { documents: documents.sort(compareBySourcePath), failedFiles, complete: failedFiles.length === 0 };
}
