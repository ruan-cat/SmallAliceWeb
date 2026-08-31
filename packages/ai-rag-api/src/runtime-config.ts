/** Nitro runtimeConfig 的私有与公开字段合同。 */
export type RagNitroConfig = {
	compatibilityDate: `${number}-${number}-${number}`;
	/** Nitro 服务端源码根目录（routes/plugins/middleware 等子目录在此之下解析）。 */
	serverDir?: string;
	runtimeConfig: {
		databaseUrl: string;
		syncDatabaseUrl: string;
		embeddingModel: string;
		rerankerMode?: "disabled" | "noop" | "llm";
		rerankerProvider?: string;
		rerankerModel?: string;
		rerankerVersion?: string;
		rerankerCandidateLimit?: number;
		rerankerMaxInputTokens?: number;
		rerankerTimeoutMs?: number;
		rerankerMaxCostUsd?: number;
		cloudflareAccountId?: string;
		cloudflareApiToken?: string;
		openaiApiKey: string;
		anthropicApiKey: string;
		knowledgeSyncToken: string;
		cronSecret: string;
		knowledgeSourceRoot?: string;
		repositoryRoot?: string;
		public: {
			apiBase: string;
		};
	};
};
