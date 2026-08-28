import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareKnowledgeBase } from "../server/services/prepare-knowledge";
import { createCloudflareEmbeddingProvider, CloudflareEmbeddingError } from "../server/providers/cloudflare-embedding";
import { parseEvalQuestions, runRetrievalEvaluation, type EvalQuestion } from "../server/evaluation/evaluator";
import type { HybridSearchItem } from "../server/search/hybrid-search";

type SampleItem = HybridSearchItem & { score: number; embedding: readonly number[] };

const repositoryRoot = resolve(process.cwd());
const sourceRoot = resolve(repositoryRoot, "docs", "docx");
const sampleSize = 50;
const models = ["@cf/baai/bge-m3", "@cf/qwen/qwen3-embedding-0.6b"] as const;
const baseQuestions = parseEvalQuestions(
	JSON.parse(await readFile(new URL("../data/eval-questions.json", import.meta.url), "utf8")),
);
const questions: EvalQuestion[] = [
	...baseQuestions,
	{
		id: "q11",
		question: "如何在 Vue3 项目中配置 TypeScript？",
		expected_keywords: ["Vue", "TypeScript", "配置"],
		category: "中英混合",
	},
	{
		id: "q12",
		question: "RAG 的 retrieval 阶段如何提升召回率？",
		expected_keywords: ["RAG", "retrieval", "召回率"],
		category: "中英混合",
	},
];

const prepared = await prepareKnowledgeBase({ repositoryRoot, sourceRoot });
const candidates = prepared.chunks.filter((chunk) => chunk.content.trim());
const chunks = candidates
	.filter((_, index) => index % Math.max(1, Math.floor(candidates.length / sampleSize)) === 0)
	.slice(0, sampleSize);
if (chunks.length !== sampleSize) throw new Error(`小样本 chunks 数量不足：${chunks.length}/${sampleSize}`);

const accountId = process.env.NITRO_CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.NITRO_CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) throw new Error("缺少 Cloudflare embedding 环境变量。");

function toItem(chunk: (typeof chunks)[number], embedding: readonly number[], score: number): SampleItem {
	return { ...chunk, id: `${chunk.sourcePath}#${chunk.chunkIndex}`, score, embedding: [...embedding] } as SampleItem;
}

function cosine(left: readonly number[], right: readonly number[]) {
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index += 1) {
		dot += left[index] * right[index];
		leftNorm += left[index] ** 2;
		rightNorm += right[index] ** 2;
	}
	return dot / Math.sqrt(leftNorm * rightNorm);
}

const reports = [];
for (const model of models) {
	const provider = createCloudflareEmbeddingProvider({ accountId, apiToken, model });
	try {
		const chunkEmbeddings = await provider.createEmbeddings(chunks.map((chunk) => chunk.content));
		const vectors = new Map(
			chunks.map((chunk, index) => [`${chunk.sourcePath}#${chunk.chunkIndex}`, chunkEmbeddings[index]]),
		);
		const items = chunks.map((chunk) => toItem(chunk, vectors.get(`${chunk.sourcePath}#${chunk.chunkIndex}`)!, 0));
		const report = await runRetrievalEvaluation(
			questions,
			{
				createEmbedding: (query) => provider.createEmbedding(query).then((value) => [...value]),
				lexicalSearch: async (query, limit) => {
					const normalized = query.toLowerCase();
					return items
						.map((item) => ({ item, score: item.content.toLowerCase().includes(normalized) ? 1 : 0 }))
						.sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id))
						.slice(0, limit)
						.map(({ item, score }) => ({ ...item, score }));
				},
				vectorSearch: async (embedding, limit) =>
					items
						.map((item) => ({ ...item, score: cosine(embedding, item.embedding) }))
						.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
						.slice(0, limit),
			},
			{ limit: 5, k: 60 },
		);
		reports.push({ model, sampleSize, chunkIds: items.map((item) => item.id), report });
	} catch (error) {
		if (error instanceof CloudflareEmbeddingError) {
			reports.push({
				model,
				sampleSize,
				error: { status: error.status, providerCode: error.providerCode, providerMessage: error.providerMessage },
			});
			continue;
		}
		throw error;
	}
}

const output = {
	schemaVersion: 1,
	embeddingModels: models,
	sourceRoot: "docs/docx",
	documentCount: prepared.documentCount,
	availableChunkCount: candidates.length,
	questions: questions.map(({ id, question, expected_keywords, category }) => ({
		id,
		question,
		expected_keywords,
		category,
	})),
	reports,
	isolation: "本脚本仅在内存中比较 50 个 chunks，不写入 Neon 正式 documents/chunks 表。",
};
const evidenceRoot = resolve(repositoryRoot, "openspec/changes/ai-rag-phase2/evidence");
await mkdir(evidenceRoot, { recursive: true });
await writeFile(
	resolve(evidenceRoot, "2026-08-28-embedding-model-smoke.json"),
	`${JSON.stringify(output, null, 2)}\n`,
	"utf8",
);
console.log(JSON.stringify(output, null, 2));
