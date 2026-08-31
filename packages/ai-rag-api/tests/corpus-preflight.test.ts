import { describe, expect, test } from "vitest";
import {
	preflightCorpus,
	type CorpusSnapshot,
	type CorpusPreflightRequest,
} from "../server/evaluation/corpus-preflight";

const sourcePath = "docs/docx/guide.md";
const contentHash = "a".repeat(64);
const profileVersion = "markdown-structure-v2";
const embeddingModel = "@cf/baai/bge-m3";

function request(
	overrides: Partial<CorpusPreflightRequest> = {},
): CorpusPreflightRequest {
	return {
		sourcePath,
		headingPath: ["指南", "安装"],
		contentHash,
		profileVersion,
		embeddingModel,
		...overrides,
	};
}

function snapshot(overrides: Partial<CorpusSnapshot> = {}): CorpusSnapshot {
	return {
		sourcePath,
		contentHash,
		profileVersion,
		embeddingModel,
		lastSyncedAt: "2026-08-31T12:00:00.000Z",
		syncStatus: "succeeded",
		chunks: [
			{
				id: `${sourcePath}#0`,
				headingPath: ["指南", "安装"],
				contentHash,
				profileVersion,
				embeddingModel,
				embeddingPresent: true,
			},
		],
		...overrides,
	};
}

describe("RAG corpus preflight", () => {
	test("目标文档、章节、embedding 和版本均匹配时允许进入指标", async () => {
		const result = await preflightCorpus(request(), async () => snapshot());

		expect(result).toMatchObject({
			status: "ready",
			eligibleForMetrics: true,
			chunkCount: 1,
		});
	});

	test("目标文档缺失或 chunk 为 0 时标记 corpus-missing", async () => {
		await expect(
			preflightCorpus(request(), async () => null),
		).resolves.toMatchObject({
			status: "corpus-missing",
			eligibleForMetrics: false,
		});
		await expect(
			preflightCorpus(request(), async () => snapshot({ chunks: [] })),
		).resolves.toMatchObject({
			status: "corpus-missing",
			eligibleForMetrics: false,
		});
	});

	test("所有目标 chunk 缺少 embedding 时标记 embedding-missing", async () => {
		const result = await preflightCorpus(request(), async () =>
			snapshot({
				chunks: [{ ...snapshot().chunks[0], embeddingPresent: false }],
			}),
		);

		expect(result).toMatchObject({
			status: "embedding-missing",
			eligibleForMetrics: false,
		});
	});

	test("content、profile、model 或 heading 不匹配时标记 corpus-stale", async () => {
		await expect(
			preflightCorpus(request(), async () =>
				snapshot({ contentHash: "b".repeat(64) }),
			),
		).resolves.toMatchObject({
			status: "corpus-stale",
			eligibleForMetrics: false,
		});
		await expect(
			preflightCorpus(request(), async () =>
				snapshot({ profileVersion: "old-profile" }),
			),
		).resolves.toMatchObject({
			status: "corpus-stale",
			eligibleForMetrics: false,
		});
		await expect(
			preflightCorpus(request(), async () =>
				snapshot({
					chunks: [{ ...snapshot().chunks[0], headingPath: ["其他"] }],
				}),
			),
		).resolves.toMatchObject({
			status: "corpus-stale",
			eligibleForMetrics: false,
		});
	});

	test("同步状态不可读或 provider 失败时不伪造 ready", async () => {
		await expect(
			preflightCorpus(request(), async () =>
				snapshot({ syncStatus: undefined }),
			),
		).resolves.toMatchObject({
			status: "corpus-stale",
			eligibleForMetrics: false,
		});
		await expect(
			preflightCorpus(request(), async () => {
				throw new Error("sync status unavailable");
			}),
		).resolves.toMatchObject({
			status: "corpus-stale",
			eligibleForMetrics: false,
		});
	});
});
