import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = new URL("..", import.meta.url);
const packageRootPath = fileURLToPath(packageRoot);
const ignoredDirectories = new Set([".nitro", ".output", ".vercel", "coverage", "dist", "node_modules"]);
const sourceExtensions = new Set([".json", ".sql", ".ts"]);
const controlledSourceRoots = ["drizzle", "server", "src"];
const controlledConfigFiles = ["drizzle.config.ts", "nitro.config.ts", "package.json"];
const forbiddenLiteralPatterns = [
	/(?:postgres(?:ql)?|mysql|mongodb):\/\//i,
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
	/(?:api[_-]?key|access[_-]?token|secret(?:_key)?|password)\s*[:=]\s*["'][^"']{8,}/i,
	/\b(?:sk|pk|api|key|token)_[A-Za-z0-9-]{16,}\b/,
];

/** 将本地文件路径标准化为跨平台的测试断言路径。 */
function toPackageRelativePath(file: string) {
	return relative(packageRootPath, file).replaceAll("\\", "/");
}

/** 递归收集本包可提交运行时源码和配置文件，跳过生成目录与依赖目录。 */
async function collectControlledFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!ignoredDirectories.has(entry.name)) files.push(...(await collectControlledFiles(path)));
			continue;
		}
		if (sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) files.push(path);
	}

	return files;
}

describe("ai-rag-api package boundary", () => {
	test("declares executable test and typecheck scripts", async () => {
		const packageJson = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));

		expect(packageJson.name).toBe("@ruan-cat-drill-doc/ai-rag-api");
		expect(packageJson.scripts).toMatchObject({
			predev: "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build",
			dev: "nitro dev",
			prebuild: "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build",
			build: "nitro build",
			"build:vercel": "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && nitro build --preset vercel",
			preview: "nitro preview",
			test: "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && vitest run",
			typecheck: "pnpm --filter @ruan-cat-drill-doc/ai-rag-core build && tsc --noEmit",
		});
		expect(packageJson.dependencies.nitro).toBe("3.0.260610-beta");
	});

	test("recursively keeps controlled runtime source and configuration free of credentials", async () => {
		const sourceFiles = (
			await Promise.all(
				controlledSourceRoots.map((directory) => collectControlledFiles(join(packageRootPath, directory))),
			)
		).flat();
		const files = [...sourceFiles, ...controlledConfigFiles.map((file) => join(packageRootPath, file))];
		const findings: string[] = [];

		for (const file of files) {
			const contents = await readFile(file, "utf8");
			for (const pattern of forbiddenLiteralPatterns) {
				if (pattern.test(contents)) findings.push(`${relative(packageRootPath, file)}: ${pattern}`);
			}
		}

		expect(files.map(toPackageRelativePath)).toContain("nitro.config.ts");
		expect(files.map(toPackageRelativePath)).toContain("src/runtime-config.ts");
		expect(files.map(toPackageRelativePath)).toContain("drizzle/0000_ai_rag.sql");
		expect(findings).toEqual([]);
	});
});
