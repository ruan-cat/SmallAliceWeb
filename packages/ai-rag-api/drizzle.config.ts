import { defineConfig } from "drizzle-kit";

/** 仅让 Drizzle CLI 从受控的非 pooled 环境变量读取 migration 连接配置。 */
export default defineConfig({
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./server/db/schema.ts",
	dbCredentials: {
		url: process.env.POSTGRES_URL_NON_POOLING ?? "",
	},
});
