import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { prepareKnowledgeBase } from "../server/services/prepare-knowledge";
import { createCloudflareEmbeddingProvider } from "../server/providers/cloudflare-embedding";
import { runRetrievalEvaluation, parseEvalQuestions } from "../server/evaluation/evaluator";
import { createPostgresSearchProvider } from "../server/search/postgres-search";

const evaluationTable = "rag_parameter_evaluation_chunks";
const profiles = [
	{ name: "300/30/5", targetTokens: 300, overlapTokens: 30, topK: 5 },
	{ name: "500/50/10", targetTokens: 500, overlapTokens: 50, topK: 10 },
	{ name: "800/100/15", targetTokens: 800, overlapTokens: 100, topK: 15 },
] as const;

const questions = parseEvalQuestions(
	JSON.parse(await readFile(new URL("../data/eval-questions.json", import.meta.url), "utf8")),
);
const repositoryRoot = resolve(process.cwd());
const prepared = await Promise.all(
	profiles.map(async (profile) => ({
		profile,
		knowledge: await prepareKnowledgeBase({
			repositoryRoot,
			sourceRoot: resolve(repositoryRoot, "docs", "docx"),
			chunkOptions: profile,
		}),
	})),
);
const sql = postgres(process.env.NITRO_DATABASE_URL!);
const embedding = createCloudflareEmbeddingProvider({
	accountId: process.env.NITRO_CLOUDFLARE_ACCOUNT_ID!,
	apiToken: process.env.NITRO_CLOUDFLARE_API_TOKEN!,
	model: process.env.NITRO_EMBEDDING_MODEL!,
});
const connection = await sql.reserve();

try {
	await connection.unsafe(`DROP TABLE IF EXISTS ${evaluationTable}`);
	await connection.unsafe(`
		CREATE TEMP TABLE ${evaluationTable} (
			id text PRIMARY KEY,
			content text NOT NULL,
			source_path text NOT NULL,
			heading_path jsonb NOT NULL,
			heading_index integer NOT NULL,
			heading_anchor text NOT NULL,
			chunk_index integer NOT NULL,
			image_urls jsonb NOT NULL,
			embedding vector(1024) NOT NULL
		)
	`);

	const reports = [];
	for (const { profile, knowledge } of prepared) {
		await connection.unsafe(`TRUNCATE ${evaluationTable}`);
		const chunks = knowledge.chunks.filter((chunk) => chunk.content.trim());
		for (let offset = 0; offset < chunks.length; offset += 100) {
			const batch = chunks.slice(offset, offset + 100);
			const vectors = await embedding.createEmbeddings(batch.map((chunk) => chunk.content));
			const parameters: unknown[] = [];
			const values = batch.map((chunk, index) => {
				const vector = vectors[index];
				if (!vector) throw new Error(`缺少第 ${offset + index} 个 chunk 的 embedding`);
				const start = parameters.length + 1;
				parameters.push(
					`${chunk.sourcePath}#${chunk.chunkIndex}`,
					chunk.content,
					chunk.sourcePath,
					JSON.stringify(chunk.headingPath),
					chunk.headingIndex,
					chunk.headingAnchor,
					chunk.chunkIndex,
					JSON.stringify(chunk.imageUrls),
					`[${vector.join(",")}]`,
				);
				return `($${start}, $${start + 1}, $${start + 2}, CAST($${start + 3} AS jsonb), $${start + 4}, $${start + 5}, $${start + 6}, CAST($${start + 7} AS jsonb), CAST($${start + 8} AS vector))`;
			});
			await connection.unsafe(
				`INSERT INTO ${evaluationTable} (id, content, source_path, heading_path, heading_index, heading_anchor, chunk_index, image_urls, embedding) VALUES ${values.join(", ")}`,
				parameters as Parameters<typeof connection.unsafe>[1],
			);
			process.stdout.write(
				`profile=${profile.name} embedded=${Math.min(offset + batch.length, chunks.length)}/${chunks.length}\n`,
			);
		}

		const search = createPostgresSearchProvider({
			execute: (statement, parameters) =>
				connection.unsafe(statement.replaceAll("FROM chunks", `FROM ${evaluationTable}`), [...parameters] as Parameters<
					typeof connection.unsafe
				>[1]),
		});
		const report = await runRetrievalEvaluation(
			questions,
			{
				createEmbedding: (query) => embedding.createEmbedding(query).then((value) => [...value]),
				lexicalSearch: search.lexicalSearch,
				vectorSearch: search.vectorSearch,
			},
			{ limit: profile.topK, k: 60 },
		);
		reports.push({
			profile,
			documentCount: knowledge.documentCount,
			chunkCount: knowledge.chunkCount,
			blankChunkCount: knowledge.chunkCount - chunks.length,
			report,
		});
	}

	const output = {
		embeddingModel: process.env.NITRO_EMBEDDING_MODEL,
		sourceRoot: "docs/docx",
		profiles: reports,
		isolation: "PostgreSQL TEMP TABLE; formal documents/chunks tables are not written",
	};
	const evidenceRoot = resolve(repositoryRoot, "openspec/changes/ai-rag-phase2/evidence");
	await mkdir(evidenceRoot, { recursive: true });
	await writeFile(
		resolve(evidenceRoot, "2026-08-27-real-parameter-evaluation.json"),
		`${JSON.stringify(output, null, 2)}\n`,
		"utf8",
	);
	console.log(JSON.stringify(output, null, 2));
} finally {
	await connection.release();
	await sql.end({ timeout: 5 });
}
