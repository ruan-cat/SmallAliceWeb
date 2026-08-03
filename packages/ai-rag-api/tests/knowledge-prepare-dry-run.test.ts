import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { executeKnowledgePrepareDryRun } from "../server/cli/knowledge-prepare-dry-run";

const temporaryDirectories: string[] = [];

/** 创建会在测试结束后移除的临时仓库目录。 */
async function createTemporaryRepository() {
	const repositoryRoot = await mkdtemp(join(tmpdir(), "ai-rag-prepare-cli-"));
	temporaryDirectories.push(repositoryRoot);
	const sourceRoot = join(repositoryRoot, "docs", "docx");
	await mkdir(sourceRoot, { recursive: true });
	return { repositoryRoot, sourceRoot };
}

/** 执行命令并收集其唯一的 JSON 标准输出。 */
async function execute(argumentsList: string[], repositoryRoot: string) {
	const output: string[] = [];
	const exitCode = await executeKnowledgePrepareDryRun(argumentsList, {
		repositoryRoot,
		write: (line) => output.push(line),
	});
	return { exitCode, output: JSON.parse(output.join("")) as Record<string, unknown> };
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("knowledge:prepare:dry-run", () => {
	test("扫描空 Markdown 目录时输出零文档的只读 JSON 摘要", async () => {
		const { repositoryRoot, sourceRoot } = await createTemporaryRepository();

		await expect(execute(["--dry-run", "--source-root", sourceRoot], repositoryRoot)).resolves.toEqual({
			exitCode: 0,
			output: { dryRun: true, documentCount: 0, chunkCount: 0, failedFiles: [] },
		});
	});

	test("扫描非空 Markdown 目录时只返回 chunk 摘要，不写入外部系统", async () => {
		const { repositoryRoot, sourceRoot } = await createTemporaryRepository();
		await writeFile(join(sourceRoot, "guide.md"), "# 指南\n\nRAG 先检索再生成。", "utf8");

		await expect(execute(["--dry-run", "--source-root", sourceRoot], repositoryRoot)).resolves.toEqual({
			exitCode: 0,
			output: { dryRun: true, documentCount: 1, chunkCount: 1, failedFiles: [] },
		});
	});

	test("缺少 dry-run 或包含未知参数时返回非零退出码和 JSON 错误", async () => {
		const { repositoryRoot } = await createTemporaryRepository();

		await expect(execute([], repositoryRoot)).resolves.toMatchObject({
			exitCode: 1,
			output: { error: { code: "KNOWLEDGE_PREPARE_ARGUMENT_INVALID" } },
		});
		await expect(execute(["--dry-run", "--write"], repositoryRoot)).resolves.toMatchObject({
			exitCode: 1,
			output: { error: { code: "KNOWLEDGE_PREPARE_ARGUMENT_INVALID" } },
		});
	});

	test("知识源目录缺失时返回非零退出码和领域错误 JSON", async () => {
		const { repositoryRoot } = await createTemporaryRepository();

		await expect(execute(["--dry-run", "--source-root", "missing"], repositoryRoot)).resolves.toEqual({
			exitCode: 1,
			output: {
				error: {
					code: "SOURCE_ROOT_NOT_FOUND",
					message: `知识源根目录不存在：${join(repositoryRoot, "missing")}`,
				},
			},
		});
	});
});
