import type { HybridSearchItem } from "./hybrid-search";

export const EMBEDDING_DIMENSIONS = 1024;

type PostgresSearchRow = {
	chunkIndex: unknown;
	content: unknown;
	headingAnchor: unknown;
	headingIndex: unknown;
	headingPath: unknown;
	id: unknown;
	imageUrls: unknown;
	score: unknown;
	sourcePath: unknown;
};

export interface PostgresSearchExecutor {
	execute: (statement: string, parameters: readonly unknown[]) => Promise<readonly PostgresSearchRow[]>;
}

export interface PostgresSearchProvider {
	lexicalSearch: (query: string, limit: number) => Promise<HybridSearchItem[]>;
	vectorSearch: (embedding: readonly number[], limit: number) => Promise<HybridSearchItem[]>;
}

/** 表示调用方输入或数据库检索行不满足既定检索合同。 */
export class PostgresSearchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PostgresSearchError";
	}
}

const selectChunkColumns = `
  SELECT
    id,
    content,
    source_path AS "sourcePath",
    heading_path AS "headingPath",
    heading_index AS "headingIndex",
    heading_anchor AS "headingAnchor",
    chunk_index AS "chunkIndex",
    image_urls AS "imageUrls",
`;

export const lexicalSearchStatement = `${selectChunkColumns}
    ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', $1)) AS score
  FROM chunks
  WHERE to_tsvector('simple', content) @@ websearch_to_tsquery('simple', $1)
  ORDER BY score DESC, id ASC
  LIMIT $2`;

export const vectorSearchStatement = `${selectChunkColumns}
    1 - (embedding <=> CAST($1 AS vector)) AS score
  FROM chunks
  ORDER BY embedding <=> CAST($1 AS vector), id ASC
  LIMIT $2`;

/** 创建只依赖显式 executor 的 PostgreSQL 检索 provider；本函数不创建连接。 */
export function createPostgresSearchProvider(executor: PostgresSearchExecutor): PostgresSearchProvider {
	return {
		async lexicalSearch(query, limit) {
			assertQuery(query);
			assertLimit(limit);
			return mapRows(await executor.execute(lexicalSearchStatement, [query, limit]));
		},
		async vectorSearch(embedding, limit) {
			assertEmbedding(embedding);
			assertLimit(limit);
			return mapRows(await executor.execute(vectorSearchStatement, [toVectorLiteral(embedding), limit]));
		},
	};
}

/** 将固定维度的有限数值向量转换成 pgvector 参数文本。 */
function toVectorLiteral(embedding: readonly number[]) {
	return `[${embedding.join(",")}]`;
}

function assertQuery(query: string) {
	if (!query.trim()) throw new PostgresSearchError("词法检索 query 不能为空。");
}

function assertLimit(limit: number) {
	if (!Number.isInteger(limit) || limit < 1) throw new PostgresSearchError("检索 limit 必须是正整数。");
}

function assertEmbedding(embedding: readonly number[]) {
	if (embedding.length !== EMBEDDING_DIMENSIONS) {
		throw new PostgresSearchError(`向量维度必须为 ${EMBEDDING_DIMENSIONS}。`);
	}
	if (embedding.some((value) => !Number.isFinite(value))) {
		throw new PostgresSearchError("向量只能包含有限数值。");
	}
}

function mapRows(rows: readonly PostgresSearchRow[]): HybridSearchItem[] {
	return rows.map((row) => ({
		id: requireText(row.id, "id"),
		content: requireText(row.content, "content"),
		sourcePath: requireText(row.sourcePath, "sourcePath"),
		headingPath: requireTextArray(row.headingPath, "headingPath"),
		headingIndex: requireInteger(row.headingIndex, "headingIndex"),
		headingAnchor: requireText(row.headingAnchor, "headingAnchor"),
		chunkIndex: requireInteger(row.chunkIndex, "chunkIndex"),
		imageUrls: requireTextArray(row.imageUrls, "imageUrls"),
		score: requireFiniteNumber(row.score, "score"),
	}));
}

function requireText(value: unknown, field: string) {
	if (typeof value !== "string") throw new PostgresSearchError(`检索行 ${field} 必须是字符串。`);
	return value;
}

function requireTextArray(value: unknown, field: string) {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new PostgresSearchError(`检索行 ${field} 必须是字符串数组。`);
	}
	return value;
}

function requireInteger(value: unknown, field: string) {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new PostgresSearchError(`检索行 ${field} 必须是整数。`);
	}
	return value;
}

function requireFiniteNumber(value: unknown, field: string) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new PostgresSearchError(`检索行 ${field} 必须是有限数值。`);
	}
	return value;
}
