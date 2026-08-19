import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const packageRoot = dirname(fileURLToPath(import.meta.url));

/** 仓库根目录中由 `vercel env pull` 生成的本地 development 环境文件。 */
export const drizzleDevelopmentEnvPath = join(packageRoot, "..", "..", ".env.local");

/** Drizzle migration 只允许使用此非 pooled 数据库连接变量。 */
export const drizzleMigrationUrlKey = "POSTGRES_URL_NON_POOLING";

/** 判断当前是否由测试 runner 加载配置，避免读取真实本地密钥文件。 */
export function isDrizzleTestEnvironment(environment: NodeJS.ProcessEnv = process.env): boolean {
	return environment.NODE_ENV === "test" || environment.VITEST !== undefined;
}

/** 加载仅供本地 development 操作使用的已忽略环境变量文件。 */
export function loadDevelopmentDrizzleEnv(
	envFilePath = drizzleDevelopmentEnvPath,
	environment: NodeJS.ProcessEnv = process.env,
): boolean {
	if (isDrizzleTestEnvironment(environment)) return false;
	if (!existsSync(envFilePath)) return false;

	loadEnvFile(envFilePath);
	return true;
}

/** 解析 migration 专用的非 pooled URL，拒绝 runtime 或通用连接变量。 */
export function resolveNonPooledMigrationUrl(environment: NodeJS.ProcessEnv = process.env): string {
	const value = environment[drizzleMigrationUrlKey]?.trim();
	if (value) return value;

	throw new Error(`Missing ${drizzleMigrationUrlKey} for Drizzle migration.`);
}

loadDevelopmentDrizzleEnv();

const migrationUrl = isDrizzleTestEnvironment() ? "" : resolveNonPooledMigrationUrl();

/** 仅让 Drizzle CLI 从受控的非 pooled 环境变量读取 migration 连接配置。 */
export default defineConfig({
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./server/db/schema.ts",
	dbCredentials: {
		url: migrationUrl,
	},
});
