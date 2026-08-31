import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	parseGoldSetJsonl,
	type GoldSetRecord,
} from "../server/evaluation/gold-set";

const sourcePath = "docs/docx/guide.md";
const targetChunk = `${sourcePath}#0`;
const targetHash = "a".repeat(64);

function validRecord(overrides: Partial<GoldSetRecord> = {}): GoldSetRecord {
	return {
		version: "2026-08-31",
		split: "regression",
		id: "q-title-guide",
		question: "指南是什么？",
		category: "标题型实体",
		corpusSnapshot: { sourcePath, contentHash: "b".repeat(64) },
		gold: [
			{
				chunkId: targetChunk,
				grade: 3,
				reason: "直接回答问题",
				sourcePath,
				headingPath: ["指南"],
				chunkIndex: 0,
				contentHash: targetHash,
			},
		],
		hardNegatives: [],
		referenceAnswer: "这是指南。",
		requiredClaims: ["指南"],
		expectedCitationChunkIds: [targetChunk],
		...overrides,
	};
}

function jsonl(...records: GoldSetRecord[]): string {
	return records.map((record) => JSON.stringify(record)).join("\n");
}

describe("RAG gold-set 解析与契约校验", () => {
	test("解析有效标题题并保留 gold 与 hard negative 元数据", () => {
		const record = validRecord({
			hardNegatives: [
				{
					chunkId: "docs/docx/other.md#2",
					reason: "同名噪声",
					sourcePath: "docs/docx/other.md",
					headingPath: ["其他"],
					chunkIndex: 2,
					contentHash: "c".repeat(64),
				},
			],
		});

		const [parsed] = parseGoldSetJsonl(jsonl(record));

		expect(parsed).toMatchObject({ id: record.id, split: "regression" });
		expect(parsed.gold[0]).toMatchObject({ chunkId: targetChunk, grade: 3 });
		expect(parsed.hardNegatives[0]).toMatchObject({
			chunkId: "docs/docx/other.md#2",
		});
	});

	test("解析仓库内初版标题题集", async () => {
		const source = await readFile(
			new URL("../data/rag-gold-set.jsonl", import.meta.url),
			"utf8",
		);
		const [parsed] = parseGoldSetJsonl(source);

		expect(parsed).toMatchObject({
			id: "title-alice-001",
			question: "小爱丽丝是谁啊？",
			split: "regression",
		});
		expect(parsed.gold.length).toBeGreaterThan(0);
		expect(parsed.hardNegatives.length).toBeGreaterThan(0);
	});

	test("拒绝重复题目 ID", () => {
		expect(() =>
			parseGoldSetJsonl(
				jsonl(validRecord(), validRecord({ question: "另一个问题" })),
			),
		).toThrow("重复");
	});

	test("拒绝普通题目的空 gold", () => {
		expect(() => parseGoldSetJsonl(jsonl(validRecord({ gold: [] })))).toThrow(
			"gold",
		);
	});

	test("允许没有 gold 的不可回答题，但拒绝不可回答题与 gold 冲突", () => {
		const [parsed] = parseGoldSetJsonl(
			jsonl(
				validRecord({
					id: "q-unanswerable",
					gold: [],
					expectedCitationChunkIds: [],
					unanswerable: true,
				}),
			),
		);
		expect(parsed.unanswerable).toBe(true);
		expect(() =>
			parseGoldSetJsonl(jsonl(validRecord({ unanswerable: true }))),
		).toThrow("不可回答");
	});

	test("使用当前语料 hash 选项拒绝 stale contentHash", () => {
		expect(() =>
			parseGoldSetJsonl(jsonl(validRecord()), {
				sourceContentHashes: { [sourcePath]: "d".repeat(64) },
			}),
		).toThrow("stale");
	});

	test("拒绝 hard negative 与 gold 重叠或缺少可追溯字段", () => {
		const overlapping = validRecord({
			hardNegatives: [
				{
					chunkId: targetChunk,
					reason: "误标",
					sourcePath,
					headingPath: ["指南"],
					chunkIndex: 0,
					contentHash: "c".repeat(64),
				},
			],
		});
		expect(() => parseGoldSetJsonl(jsonl(overlapping))).toThrow(
			"hard negative",
		);
	});
});
