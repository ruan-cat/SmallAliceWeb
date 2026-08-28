import { describe, expect, test, vi } from "vitest";
import { createAdaptiveEmbeddings } from "../scripts/adaptive-embedding-batch";
import { CloudflareEmbeddingError } from "../server/providers/cloudflare-embedding";

describe("createAdaptiveEmbeddings", () => {
	test("默认使用保守批次并在 400 时二分重试", async () => {
		const createEmbeddings = vi.fn(async (contents: readonly string[]) => {
			if (contents.length > 2) throw new CloudflareEmbeddingError("bad request", { status: 400 });
			return contents.map((content) => [content.length]);
		});

		await expect(createAdaptiveEmbeddings({ createEmbeddings }, ["a", "bb", "ccc", "dddd"])).resolves.toEqual([
			[1],
			[2],
			[3],
			[4],
		]);
		expect(createEmbeddings).toHaveBeenCalledWith(["a", "bb", "ccc", "dddd"]);
		expect(createEmbeddings).toHaveBeenCalledWith(["a", "bb"]);
		expect(createEmbeddings).toHaveBeenCalledWith(["ccc", "dddd"]);
	});

	test("单条 400 不被吞掉", async () => {
		const error = new CloudflareEmbeddingError("bad request", { status: 400 });
		const createEmbeddings = vi.fn().mockRejectedValue(error);
		await expect(createAdaptiveEmbeddings({ createEmbeddings }, ["invalid"])).rejects.toBe(error);
	});
});
