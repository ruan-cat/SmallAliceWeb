import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];

if (!new Set(["prepare", "build"]).has(command)) {
	throw new Error(`unsupported Nuxt command: ${command ?? "<empty>"}`);
}

const memoryFlag = "--max-old-space-size=5120";
const existingNodeOptions = (process.env.NODE_OPTIONS ?? "")
	.trim()
	.split(/\s+/)
	.filter(Boolean)
	.filter((option) => !/^--max[-_]old[-_]space[-_]size(?:=|$)/.test(option));
const nodeOptions = [...existingNodeOptions, memoryFlag].join(" ");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log(`[ai-vue-doc] nuxt ${command}; NODE_OPTIONS=${nodeOptions}`);

const result = spawnSync(pnpmCommand, ["exec", "nuxt", command], {
	cwd: packageRoot,
	env: { ...process.env, NODE_OPTIONS: nodeOptions },
	stdio: "inherit",
	shell: process.platform === "win32",
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 1);
