/** 此离线骨架允许的 Nitro 运行时配置形状。 */
export type RagNitroConfig = {
	compatibilityDate: `${number}-${number}-${number}`;
	runtimeConfig: {
		databaseUrl: string;
		embeddingModel: string;
		openaiApiKey: string;
		chatModel: string;
		knowledgeSyncToken: string;
		cronSecret: string;
		public: {
			apiBase: string;
		};
	};
};

/** 仅声明配置键；部署环境通过 Nitro 的 NITRO_* 变量注入私有值。 */
export const ragNitroConfig = {
	compatibilityDate: "2026-07-31",
	runtimeConfig: {
		databaseUrl: "",
		embeddingModel: "",
		openaiApiKey: "",
		chatModel: "",
		knowledgeSyncToken: "",
		cronSecret: "",
		public: {
			apiBase: "/v1",
		},
	},
} satisfies RagNitroConfig;
