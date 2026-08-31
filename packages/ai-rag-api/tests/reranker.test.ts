import { describe, expect, test } from "vitest";
import { createLlmReranker } from "../server/reranker/llm-reranker";
import { createNoopReranker } from "../server/reranker/noop-reranker";
import type { RerankerCandidate } from "../server/reranker/types";

function candidate(id: string, content = id): RerankerCandidate {
	return {
		id,
		content,
		score: 1,
		sourcePath: "docs/docx/guide.md",
		headingPath: ["指南"],
		headingIndex: 0,
		headingAnchor: "rag-heading-guide",
		chunkIndex: Number(id.replace(/\D/g, "")) || 0,
		imageUrls: [],
	};
}

const candidates = [
	candidate("a", "第一候选"),
	candidate("b", "第二候选"),
	candidate("c", "第三候选"),
];

describe("RAG reranker provider", () => {
	test("Noop 原样保留 RRF 顺序并标记 skipped", async () => {
		const result = await createNoopReranker().rerank({
			query: "q",
			candidates,
		});

		expect(result).toMatchObject({
			status: "skipped",
			provider: "noop",
			model: undefined,
		});
		expect(result.items).toEqual(candidates);
	});

	test("LLM 成功时只能返回输入候选的重排子集", async () => {
		const reranker = createLlmReranker({
			client: {
				complete: async () => ({
					text: JSON.stringify({
						rankedIds: [
							{ id: "c", score: 0.9 },
							{ id: "a", score: 0.7 },
						],
					}),
				}),
			},
			provider: "test-provider",
			model: "test-model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1000,
			timeoutMs: 100,
		});

		const result = await reranker.rerank({ query: "q", candidates });

		expect(result).toMatchObject({
			status: "applied",
			provider: "test-provider",
			model: "test-model",
			version: "v1",
		});
		expect(result.items.map((item) => item.id)).toEqual(["c", "a"]);
		expect(result.items[0]).toMatchObject({ content: "第三候选", score: 0.9 });
	});

	test("候选数或 token 预算超限时跳过，不调用 LLM", async () => {
		let calls = 0;
		const reranker = createLlmReranker({
			client: {
				complete: async () => {
					calls += 1;
					return { text: "{}" };
				},
			},
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 2,
			maxInputTokens: 1000,
			timeoutMs: 100,
		});
		const tooMany = await reranker.rerank({ query: "q", candidates });
		expect(tooMany).toMatchObject({
			status: "skipped",
			failureReason: "candidate-limit",
		});
		const lowBudget = createLlmReranker({
			client: {
				complete: async () => {
					calls += 1;
					return { text: "{}" };
				},
			},
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1,
			timeoutMs: 100,
		});
		expect(await lowBudget.rerank({ query: "q", candidates })).toMatchObject({
			status: "skipped",
			failureReason: "token-budget",
		});
		expect(calls).toBe(0);
	});

	test("超时、解析失败和未知 ID 均 failed 并回退 Noop", async () => {
		const timeout = createLlmReranker({
			client: { complete: () => new Promise(() => undefined) },
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1000,
			timeoutMs: 5,
		});
		await expect(
			timeout.rerank({ query: "q", candidates }),
		).resolves.toMatchObject({
			status: "failed",
			failureReason: "timeout",
			items: candidates,
		});

		const malformed = createLlmReranker({
			client: { complete: async () => ({ text: "not-json" }) },
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1000,
			timeoutMs: 100,
		});
		await expect(
			malformed.rerank({ query: "q", candidates }),
		).resolves.toMatchObject({
			status: "failed",
			failureReason: "invalid-json",
			items: candidates,
		});

		const unknown = createLlmReranker({
			client: {
				complete: async () => ({
					text: JSON.stringify({ rankedIds: [{ id: "unknown", score: 1 }] }),
				}),
			},
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1000,
			timeoutMs: 100,
		});
		await expect(
			unknown.rerank({ query: "q", candidates }),
		).resolves.toMatchObject({
			status: "failed",
			failureReason: "unknown-id",
			items: candidates,
		});
	});

	test("相同 query/candidate/model/version 命中缓存，不重复调用客户端", async () => {
		let calls = 0;
		const reranker = createLlmReranker({
			client: {
				complete: async () => {
					calls += 1;
					return {
						text: JSON.stringify({ rankedIds: [{ id: "b", score: 1 }] }),
						usage: { totalTokens: 12 },
					};
				},
			},
			provider: "test",
			model: "model",
			version: "v1",
			candidateLimit: 3,
			maxInputTokens: 1000,
			timeoutMs: 100,
		});

		const first = await reranker.rerank({ query: "q", candidates });
		const second = await reranker.rerank({ query: "q", candidates });
		expect(calls).toBe(1);
		expect(second).toEqual(first);
		expect(first.tokenCount).toBe(12);
	});
});
