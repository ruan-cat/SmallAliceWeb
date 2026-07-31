import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { prepareKnowledgeBase } from "../server/services/prepare-knowledge";

const temporaryDirectories: string[] = [];

/** 创建会在测试结束后删除的知识源目录。 */
async function createTemporaryRepository() {
	const repositoryRoot = await mkdtemp(join(tmpdir(), "ai-rag-prepare-"));
	temporaryDirectories.push(repositoryRoot);
	const sourceRoot = join(repositoryRoot, "docs", "docx");
	await mkdir(sourceRoot, { recursive: true });
	return { repositoryRoot, sourceRoot };
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("prepareKnowledgeBase", () => {
	test("按稳定来源顺序准备结构化 chunk，并把图片 URL 留在元数据", async () => {
		const { repositoryRoot, sourceRoot } = await createTemporaryRepository();
		await writeFile(join(sourceRoot, "z.md"), "# Z\n\n正文", "utf8");
		await writeFile(join(sourceRoot, "a.md"), "# A\n\n说明 ![](./diagram.png)", "utf8");

		const result = await prepareKnowledgeBase({ repositoryRoot, sourceRoot });

		expect(result).toMatchObject({ documentCount: 2, chunkCount: 2 });
		expect(result.chunks.map((chunk) => chunk.sourcePath)).toEqual(["docs/docx/a.md", "docs/docx/z.md"]);
		expect(result.chunks[0]).toMatchObject({ imageUrls: ["./diagram.png"], chunkIndex: 0 });
		expect(result.chunks[0].content).not.toContain("diagram.png");
	});

	test("为每个源文件保持从零开始的连续 chunkIndex，空文件不生成 chunk", async () => {
		const { repositoryRoot, sourceRoot } = await createTemporaryRepository();
		await writeFile(join(sourceRoot, "split.md"), "# 标题\n\n甲乙丙丁", "utf8");
		await writeFile(join(sourceRoot, "empty.md"), "", "utf8");

		const result = await prepareKnowledgeBase({
			repositoryRoot,
			sourceRoot,
			chunkOptions: { overlapTokens: 0, targetTokens: 2 },
		});

		expect(result).toMatchObject({ documentCount: 2, chunkCount: 2 });
		expect(result.chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
		expect(result.chunks.map((chunk) => chunk.sourcePath)).toEqual(["docs/docx/split.md", "docs/docx/split.md"]);
	});
});
