import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import { createCloudflareEmbeddingProvider } from "../server/providers/cloudflare-embedding";
import { runRetrievalEvaluation, parseEvalQuestions } from "../server/evaluation/evaluator";
import { computeDatasetVersion, createEvaluationRunsRepository } from "../server/evaluation/runs-repository";
import { createPostgresSearchProvider } from "../server/search/postgres-search";

const questions = parseEvalQuestions(
	JSON.parse(await readFile(new URL("../data/eval-questions.json", import.meta.url), "utf8")),
);
const sql = postgres(process.env.NITRO_DATABASE_URL!);
const embedding = createCloudflareEmbeddingProvider({
	accountId: process.env.NITRO_CLOUDFLARE_ACCOUNT_ID!,
	apiToken: process.env.NITRO_CLOUDFLARE_API_TOKEN!,
	model: process.env.NITRO_EMBEDDING_MODEL!,
});
const search = createPostgresSearchProvider({
	execute: (statement, parameters) => sql.unsafe(statement, [...parameters] as Parameters<typeof sql.unsafe>[1]),
});
const reports = [];
for (const limit of [5, 10, 15]) {
	reports.push({
		limit,
		report: await runRetrievalEvaluation(
			questions,
			{
				createEmbedding: (query) => embedding.createEmbedding(query).then((value) => [...value]),
				lexicalSearch: search.lexicalSearch,
				vectorSearch: search.vectorSearch,
			},
			{ limit, k: 60 },
		),
	});
}
const exactComparisons = [];
for (const question of questions) {
	const queryEmbedding = await embedding.createEmbedding(question.question);
	const vectorLiteral = `[${queryEmbedding.join(",")}]`;
	const hnswRows = await sql.begin(async (transaction) => {
		await transaction.unsafe("SET LOCAL enable_seqscan = off");
		return transaction.unsafe("SELECT id FROM chunks ORDER BY embedding <=> CAST($1 AS vector), id ASC LIMIT $2", [
			vectorLiteral,
			5,
		]);
	});
	const exactRows = await sql.begin(async (transaction) => {
		await transaction.unsafe("SET LOCAL enable_indexscan = off");
		await transaction.unsafe("SET LOCAL enable_bitmapscan = off");
		return transaction.unsafe("SELECT id FROM chunks ORDER BY embedding <=> CAST($1 AS vector), id ASC LIMIT $2", [
			vectorLiteral,
			5,
		]);
	});
	exactComparisons.push({
		questionId: question.id,
		hnswIds: hnswRows.map((row) => row.id),
		exactIds: exactRows.map((row) => row.id),
		identical: JSON.stringify(hnswRows.map((row) => row.id)) === JSON.stringify(exactRows.map((row) => row.id)),
	});
}
const counts = await sql`
	select
		(select count(*)::int from documents) as documents,
		(select count(*)::int from chunks) as chunks,
		(select count(distinct source_path)::int from chunks) as sources
`;
const output = { embeddingModel: process.env.NITRO_EMBEDDING_MODEL, counts, reports, exactComparisons };
const outputPath = resolve(process.cwd(), "openspec/changes/ai-rag-phase2/evidence/2026-08-27-real-evaluation.json");
await mkdir(resolve(process.cwd(), "openspec/changes/ai-rag-phase2/evidence"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

/** EV-2：评估运行落库（复用脚本既有连接；失败仅 warn，不阻断 stdout 与证据文件）。 */
try {
	const evaluationRepository = createEvaluationRunsRepository({
		executor: {
			execute: (statement, parameters) =>
				sql.unsafe(statement, [...(parameters ?? [])] as Parameters<typeof sql.unsafe>[1]),
		},
	});
	const inserted = await evaluationRepository.insertEvaluationRun({
		datasetVersion: computeDatasetVersion(JSON.stringify(questions)),
		kind: "real",
		params: { embeddingModel: process.env.NITRO_EMBEDDING_MODEL },
		metrics: output,
	});
	console.log(`[evaluation-runs] 已写入评估运行 ${inserted.id}`);
} catch (error) {
	console.warn(
		`[evaluation-runs] 落库失败（不阻断评估输出）: ${error instanceof Error ? error.message : String(error)}`,
	);
}

console.log(JSON.stringify(output, null, 2));
await sql.end({ timeout: 5 });
