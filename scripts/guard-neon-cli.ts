import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { isWindows } from "std-env";

const rootDirectory = resolve(import.meta.dirname, "..");
const guardPath = resolve(import.meta.filename);
const excludedDirectories = new Set([".git", "node_modules", ".output", "dist"]);
const executableExtensions = new Set([
	".bat",
	".cmd",
	".cjs",
	".cts",
	".js",
	".json",
	".mjs",
	".mts",
	".ps1",
	".sh",
	".ts",
	".yaml",
	".yml",
]);
const forbiddenCommand = /\bneonctl(?:\.cmd)?\b/iu;

/** 仅收集会实际启动命令或定义构建行为的项目文件。 */
function collectExecutionFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (excludedDirectories.has(entry.name)) continue;

		const filePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectExecutionFiles(filePath));
			continue;
		}

		if (entry.isFile() && executableExtensions.has(extname(entry.name).toLowerCase())) files.push(filePath);
	}
	return files;
}

/** 返回文件中出现被禁 CLI 的行号，供 CI 和本地执行直接定位。 */
function findViolations(filePath: string): number[] {
	const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
	return lines.flatMap((line, index) => (forbiddenCommand.test(line) ? [index + 1] : []));
}

if (!isWindows) {
	console.log("Neon CLI 守卫跳过：neonctl 故障只在 Windows 平台复现。");
} else {
	const files = collectExecutionFiles(rootDirectory).filter((filePath) => resolve(filePath) !== guardPath);
	const violations = files.flatMap((filePath) =>
		findViolations(filePath).map((line) => `${filePath.slice(rootDirectory.length + 1)}:${line}`),
	);

	if (violations.length > 0) {
		console.error("禁止使用 neonctl；项目云数据库 CLI 只能使用官方 neon。");
		console.error(violations.join("\n"));
		process.exitCode = 1;
	} else {
		console.log("Neon CLI 守卫通过：未在可执行项目入口中发现 neonctl。");
	}
}
