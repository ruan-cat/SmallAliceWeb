import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	vector,
} from "drizzle-orm/pg-core";

/** 已同步 Markdown 文档的幂等索引。 */
export const documents = pgTable("documents", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	sourcePath: text("source_path").notNull().unique(),
	contentHash: text("content_hash").notNull(),
	profileVersion: text("profile_version").notNull(),
	embeddingModel: text("embedding_model").notNull(),
	preprocessingVersion: text("preprocessing_version")
		.notNull()
		.default("markdown-structure-v2"),
	imageUrls: jsonb("image_urls").$type<string[]>().notNull(),
	lastSyncedAt: timestamp("last_synced_at").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});

/** 可检索的结构化 Markdown chunk 与稳定来源元数据。 */
export const chunks = pgTable(
	"chunks",
	{
		id: text("id").primaryKey(),
		documentId: text("document_id")
			.notNull()
			.references(() => documents.id),
		content: text("content").notNull(),
		sourcePath: text("source_path").notNull(),
		headingPath: jsonb("heading_path").$type<string[]>().notNull(),
		headingIndex: integer("heading_index").notNull(),
		headingAnchor: text("heading_anchor").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		chunkKind: text("chunk_kind")
			.$type<"prose" | "table" | "faq" | "code">()
			.notNull(),
		tableRowStart: integer("table_row_start"),
		tableRowEnd: integer("table_row_end"),
		imageUrls: jsonb("image_urls").$type<string[]>().notNull(),
		contentHash: text("content_hash").notNull(),
		profileVersion: text("profile_version").notNull(),
		parentId: text("parent_id"),
		preprocessingVersion: text("preprocessing_version")
			.notNull()
			.default("markdown-structure-v2"),
		searchText: text("search_text").notNull().default(""),
		embedding: vector("embedding", { dimensions: 1024 }).notNull(),
	},
	(table) => ({
		parentIdIndex: index("chunks_parent_id_idx").on(table.parentId),
	}),
);

/** 记录每轮完整扫描与增量对账结果。 */
export const knowledgeSyncRuns = pgTable("knowledge_sync_runs", {
	id: text("id").primaryKey(),
	status: text("status")
		.$type<"running" | "succeeded" | "partial" | "failed">()
		.notNull(),
	scannedFileCount: integer("scanned_file_count").notNull(),
	unchangedFileCount: integer("unchanged_file_count").notNull(),
	createdFileCount: integer("created_file_count").notNull(),
	updatedFileCount: integer("updated_file_count").notNull(),
	deletedFileCount: integer("deleted_file_count").notNull(),
	writtenChunkCount: integer("written_chunk_count").notNull(),
	failedFiles: jsonb("failed_files").$type<string[]>().notNull(),
	startedAt: timestamp("started_at").notNull(),
	finishedAt: timestamp("finished_at"),
});
