import { describe, expect, test, vi } from "vitest";
import {
	CLOUDFLARE_EMBEDDING_DIMENSIONS,
	CloudflareEmbeddingError,
	createCloudflareEmbeddingProvider,
} from "../server/providers/cloudflare-embedding";

describe("createCloudflareEmbeddingProvider", () => {
	test("按输入顺序调用 Cloudflare embeddings endpoint 并返回 1024 维向量", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{ index: 0, embedding: Array.from({ length: CLOUDFLARE_EMBEDDING_DIMENSIONS }, () => 0.1) },
						{ index: 1, embedding: Array.from({ length: CLOUDFLARE_EMBEDDING_DIMENSIONS }, () => 0.2) },
					],
				}),
			),
		);
		const provider = createCloudflareEmbeddingProvider({
			accountId: "account-1",
			apiToken: "token-1",
			fetch: fetchMock,
		});

		await expect(provider.createEmbeddings(["第一段", "第二段"])).resolves.toEqual([
			Array.from({ length: CLOUDFLARE_EMBEDDING_DIMENSIONS }, () => 0.1),
			Array.from({ length: CLOUDFLARE_EMBEDDING_DIMENSIONS }, () => 0.2),
		]);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.cloudflare.com/client/v4/accounts/account-1/ai/v1/embeddings",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
				body: JSON.stringify({ model: "@cf/baai/bge-m3", input: ["第一段", "第二段"] }),
			}),
		);
	});

	test("拒绝 HTTP 错误、数量不一致、非有限值和错误维度", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 500 }));
		const provider = createCloudflareEmbeddingProvider({ accountId: "a", apiToken: "t", fetch: fetchMock });
		await expect(provider.createEmbedding("失败")).rejects.toBeInstanceOf(CloudflareEmbeddingError);

		const invalidResponses = [
			{ data: [] },
			{ data: [{ embedding: [Number.NaN] }] },
			{ data: [{ embedding: Array.from({ length: 3 }, () => 0.1) }] },
		];
		for (const payload of invalidResponses) {
			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
			await expect(provider.createEmbedding("无效")).rejects.toBeInstanceOf(CloudflareEmbeddingError);
		}
	});

	test("保留脱敏的 Cloudflare 错误码与消息用于诊断", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: false,
					errors: [{ code: 3036, message: "You have used up your daily free allocation" }],
				}),
				{ status: 429 },
			),
		);
		const provider = createCloudflareEmbeddingProvider({ accountId: "a", apiToken: "t", fetch: fetchMock });

		await expect(provider.createEmbedding("诊断")).rejects.toMatchObject({
			status: 429,
			providerCode: 3036,
			providerMessage: "You have used up your daily free allocation",
		});
	});
});
