import { describe, expect, test } from "vitest";
import {
	runRagEvaluation,
	type RagEvaluationRunOptions,
} from "../scripts/run-rag-evaluation";
import type { HybridSearchItem } from "../server/search/hybrid-search";

const sourcePath = "docs/docx/guide.md";

function item(id: string, content = id): HybridSearchItem {
	return {
		id,
		content,
		sourcePath,
		headingPath: ["指南"],
		headingIndex: 0,
		headingAnchor: "rag-heading-guide",
		chunkIndex: Number(id.replace(/\D/g, "")) || 0,
		imageUrls: [],
	};
}

function localOptions(
	overrides: Partial<RagEvaluationRunOptions> = {},
): RagEvaluationRunOptions {
	return {
		mode: "local",
		questions: [
			{
				version: "2026-08-31",
				split: "regression",
				id: "q1",
				question: "指南是什么？",
				category: "标题型实体",
				corpusSnapshot: { sourcePath, contentHash: "a".repeat(64) },
				gold: [
					{
						chunkId: "target",
						grade: 3,
						reason: "直接回答",
						sourcePath,
						headingPath: ["指南"],
						chunkIndex: 0,
						contentHash: "b".repeat(64),
					},
				],
				hardNegatives: [],
				requiredClaims: ["指南"],
				expectedCitationChunkIds: ["target"],
			},
		],
		providers: {
			createEmbedding: async () => [1],
			lexicalSearch: async () => [item("target", "指南")],
			vectorSearch: async () => [item("target", "指南")],
		},
		...overrides,
	};
}

describe("RAG 评测 runner", () => {
	test("dry 模式不调用 provider 并以 0 退出", async () => {
		const result = await runRagEvaluation({ mode: "dry", questions: [] });

		expect(result).toMatchObject({
			schemaVersion: 1,
			mode: "dry",
			status: "skipped",
			exitCode: 0,
		});
	});

	test("local 模式运行确定性 evaluator 并返回版本化报告", async () => {
		const result = await runRagEvaluation({
			...localOptions(),
			configVersion: "phase3-test",
		});

		expect(result).toMatchObject({
			schemaVersion: 1,
			mode: "local",
			status: "completed",
			exitCode: 0,
			questionCount: 1,
		});
		expect(result.report?.configVersion).toBe("phase3-test");
	});

	test("external 模式未显式授权时标记 skipped", async () => {
		const result = await runRagEvaluation({ mode: "external", questions: [] });

		expect(result).toMatchObject({
			schemaVersion: 1,
			mode: "external",
			status: "skipped",
			exitCode: 0,
		});
		expect(result.reason).toContain("未显式启用");
	});

	test("external provider 失败时返回 failed/1 且脱敏敏感信息", async () => {
		const result = await runRagEvaluation({
			mode: "external",
			questions: [],
			externalProvider: async () => {
				throw new Error(
					"postgres://user:secret@example.test/db sk-secret-token",
				);
			},
		});

		expect(result).toMatchObject({ status: "failed", exitCode: 1 });
		expect(result.errors?.join(" ")).not.toContain("postgres://");
		expect(result.errors?.join(" ")).not.toContain("sk-secret-token");
	});

	test("写出 JSON 时保留 schemaVersion/exitCode 且不写入私密配置", async () => {
		let written = "";
		const result = await runRagEvaluation({
			...localOptions(),
			outputPath: "result.json",
			writeFile: async (_path, content) => {
				written = content;
			},
		});

		const output = JSON.parse(written);
		expect(result.exitCode).toBe(0);
		expect(output).toMatchObject({
			schemaVersion: 1,
			exitCode: 0,
			mode: "local",
		});
		expect(written).not.toContain("postgres://");
		expect(written).not.toContain("apiKey");
	});
});
