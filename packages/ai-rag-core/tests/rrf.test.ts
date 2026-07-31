import { describe, expect, test } from "vitest";
import { fuseRankings } from "../src/rrf";

describe("fuseRankings", () => {
	test("按每份榜单中的一基名次计算 RRF，并只为实际出现的结果贡献分数", () => {
		const results = fuseRankings(
			[
				[
					{ id: "lexical-only", content: "词法独占" },
					{ id: "shared", content: "词法共享" },
				],
				[
					{ id: "shared", content: "向量共享" },
					{ id: "vector-only", content: "向量独占" },
				],
			],
			60,
		);

		expect(results.map((result) => result.id)).toEqual(["shared", "lexical-only", "vector-only"]);
		expect(results[0].score).toBeCloseTo(1 / 61 + 1 / 62);
		expect(results[1]).toMatchObject({ content: "词法独占", score: 1 / 61 });
		expect(results[2]).toMatchObject({ content: "向量独占", score: 1 / 62 });
	});

	test("在完全同分时保持首次出现顺序", () => {
		const results = fuseRankings([
			[
				{ id: "first", content: "第一" },
				{ id: "second", content: "第二" },
			],
		]);

		expect(results.map((result) => result.id)).toEqual(["first", "second"]);
	});
});
