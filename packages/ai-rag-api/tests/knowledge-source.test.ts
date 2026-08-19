import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { KnowledgeSourceError, readKnowledgeSources, scanKnowledgeSources } from "../server/services/knowledge-source";

const temporaryDirectories: string[] = [];

/** 创建在测试结束后会被清理的知识源仓库。 */
async function createTemporaryRepository() {
	const repositoryRoot = await mkdtemp(join(tmpdir(), "ai-rag-source-"));
	temporaryDirectories.push(repositoryRoot);
	return repositoryRoot;
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("readKnowledgeSources", () => {
	test("递归读取 Markdown，排除图片并按规范化 sourcePath 稳定排序", async () => {
		const repositoryRoot = await createTemporaryRepository();
		const sourceRoot = join(repositoryRoot, "docs", "docx");
		await mkdir(join(sourceRoot, "nested"), { recursive: true });
		await writeFile(join(sourceRoot, "z-last.md"), "# Z", "utf8");
		await writeFile(join(sourceRoot, "a-first.md"), "# A", "utf8");
		await writeFile(join(sourceRoot, "nested", "middle.md"), "# Middle", "utf8");
		await writeFile(join(sourceRoot, "nested", "diagram.png"), "binary", "utf8");
		await writeFile(join(sourceRoot, "cover.jpg"), "binary", "utf8");

		const documents = await readKnowledgeSources({ repositoryRoot, sourceRoot });

		expect(documents).toEqual([
			{ content: "# A", sourcePath: "docs/docx/a-first.md" },
			{ content: "# Middle", sourcePath: "docs/docx/nested/middle.md" },
			{ content: "# Z", sourcePath: "docs/docx/z-last.md" },
		]);
		expect(documents.every((document) => !document.sourcePath.includes("\\"))).toBe(true);
	});

	test("源根目录不存在时抛出可解释错误", async () => {
		const repositoryRoot = await createTemporaryRepository();

		await expect(
			readKnowledgeSources({ repositoryRoot, sourceRoot: join(repositoryRoot, "missing") }),
		).rejects.toMatchObject({
			code: "SOURCE_ROOT_NOT_FOUND",
			name: "KnowledgeSourceError",
		});
	});

	test("保留可测试的领域错误类型", () => {
		expect(new KnowledgeSourceError("SOURCE_FILE_READ_FAILED", "无法读取 Markdown 来源")).toBeInstanceOf(Error);
	});

	test("单文件读取失败时保留成功文档与 failedFiles 路径", async () => {
		const repositoryRoot = await createTemporaryRepository();
		const sourceRoot = join(repositoryRoot, "docs", "docx");
		await mkdir(sourceRoot, { recursive: true });
		await writeFile(join(sourceRoot, "ok.md"), "# OK", "utf8");
		await writeFile(join(sourceRoot, "broken.md"), "# Broken", "utf8");

		const result = await scanKnowledgeSources({ repositoryRoot, sourceRoot }, async (filePath) => {
			if (filePath.endsWith("broken.md")) throw new Error("read failed");
			return "# OK";
		});

		expect(result.complete).toBe(false);
		expect(result.documents.map((document) => document.sourcePath)).toEqual(["docs/docx/ok.md"]);
		expect(result.failedFiles).toEqual(["docs/docx/broken.md"]);
	});

	test("源根目录缺失或不是目录时 failedFiles 使用仓库相对路径", async () => {
		const repositoryRoot = await createTemporaryRepository();
		const missingRoot = join(repositoryRoot, "docs", "docx");
		const missing = await scanKnowledgeSources({ repositoryRoot, sourceRoot: missingRoot });
		expect(missing.complete).toBe(false);
		expect(missing.failedFiles).toEqual(["docs/docx"]);

		const fileRoot = join(repositoryRoot, "docs", "docx-file.md");
		await mkdir(join(repositoryRoot, "docs"), { recursive: true });
		await writeFile(fileRoot, "not a directory", "utf8");
		const notDirectory = await scanKnowledgeSources({ repositoryRoot, sourceRoot: fileRoot });
		expect(notDirectory.complete).toBe(false);
		expect(notDirectory.failedFiles).toEqual(["docs/docx-file.md"]);
	});
});
