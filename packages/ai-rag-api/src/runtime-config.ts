/** 此离线骨架允许的 Nitro 运行时配置形状。 */
export type RagNitroConfig = {
	compatibilityDate: `${number}-${number}-${number}`;
	/** Nitro 服务端源码根目录（routes/plugins/middleware 等子目录在此之下解析）。 */
	serverDir?: string;
	runtimeConfig: {
		databaseUrl: string;
		embeddingModel: string;
		cloudflareAccountId?: string;
		cloudflareApiToken?: string;
		openaiApiKey: string;
		baseUrl: string;
		chatModel: string;
		knowledgeSyncToken: string;
		cronSecret: string;
		knowledgeSourceRoot?: string;
		repositoryRoot?: string;
		public: {
			apiBase: string;
		};
	};
};

/** 仅声明配置键；部署环境通过 Nitro 的 NITRO_* 变量注入私有值。 */
export const ragNitroConfig = {
	compatibilityDate: "2024-09-19",
	serverDir: "server",
	runtimeConfig: {
		databaseUrl: "",
		embeddingModel: "",
		cloudflareAccountId: "",
		cloudflareApiToken: "",
		openaiApiKey: "",
		baseUrl: "",
		chatModel: "",
		knowledgeSyncToken: "",
		cronSecret: "",
		knowledgeSourceRoot: "",
		repositoryRoot: "",
		public: {
			apiBase: "/v1",
		},
	},
} satisfies RagNitroConfig;
