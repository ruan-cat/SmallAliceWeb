import { describe, expect, test } from "vitest";
import {
	calculateRetrievalMetrics,
	dedupeResultIds,
	type RetrievalMetricsInput,
} from "../server/evaluation/retrieval-metrics";

function input(
	overrides: Partial<RetrievalMetricsInput> = {},
): RetrievalMetricsInput {
	return {
		candidateIds: ["a", "b", "c"],
		finalIds: ["b", "a"],
		gold: [
			{ chunkId: "a", grade: 3 },
			{ chunkId: "b", grade: 1 },
		],
		ks: [1, 2, 5],
		...overrides,
	};
}

describe("RAG 确定性检索指标", () => {
	test("去重保留首次出现顺序", () => {
		expect(dedupeResultIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
	});

	test("分别计算 candidate 与 final 的 Recall、Precision、MRR 和 nDCG", () => {
		const metrics = calculateRetrievalMetrics(input());

		expect(metrics.candidate.ids).toEqual(["a", "b", "c"]);
		expect(metrics.final.ids).toEqual(["b", "a"]);
		expect(metrics.candidate.recallAtK[1]).toBe(0.5);
		expect(metrics.candidate.recallAtK[2]).toBe(1);
		expect(metrics.final.recallAtK[1]).toBe(0.5);
		expect(metrics.final.precisionAtK[2]).toBe(1);
		expect(metrics.candidate.mrrAtK[1]).toBe(1);
		expect(metrics.final.mrrAtK[1]).toBe(1);
		expect(metrics.candidate.mrrAtK[2]).toBe(1);
		expect(metrics.final.ndcgAtK[1]).toBeCloseTo((2 ** 1 - 1) / (2 ** 3 - 1));
		expect(metrics.candidate.ndcgAtK[2]).toBeCloseTo(1);
		expect(metrics.final.ndcgAtK[2]).toBeLessThan(1);
	});

	test("K 大于结果数时不越界，空结果指标为 0", () => {
		const metrics = calculateRetrievalMetrics({
			candidateIds: [],
			finalIds: ["unknown"],
			gold: [{ chunkId: "gold", grade: 2 }],
			ks: [10],
		});

		expect(metrics.candidate.recallAtK[10]).toBe(0);
		expect(metrics.candidate.precisionAtK[10]).toBe(0);
		expect(metrics.candidate.mrrAtK[10]).toBe(0);
		expect(metrics.candidate.ndcgAtK[10]).toBe(0);
		expect(metrics.final.recallAtK[10]).toBe(0);
	});

	test("重复检索 ID 不会虚高标题型 gold 的 Recall", () => {
		const metrics = calculateRetrievalMetrics({
			candidateIds: ["docs/小爱丽丝.md#23", "docs/小爱丽丝.md#23", "noise#1"],
			finalIds: ["docs/小爱丽丝.md#23", "docs/小爱丽丝.md#23"],
			gold: [{ chunkId: "docs/小爱丽丝.md#23", grade: 3 }],
			ks: [2],
		});

		expect(metrics.candidate.ids).toEqual(["docs/小爱丽丝.md#23", "noise#1"]);
		expect(metrics.final.ids).toEqual(["docs/小爱丽丝.md#23"]);
		expect(metrics.final.recallAtK[2]).toBe(1);
		expect(metrics.final.precisionAtK[2]).toBe(1);
	});

	test("没有 gold 的不可回答题不伪造 nDCG", () => {
		const metrics = calculateRetrievalMetrics({
			candidateIds: ["noise"],
			finalIds: ["noise"],
			gold: [],
			ks: [5],
		});

		expect(metrics.candidate.recallAtK[5]).toBe(0);
		expect(metrics.candidate.ndcgAtK[5]).toBeNull();
	});
});
