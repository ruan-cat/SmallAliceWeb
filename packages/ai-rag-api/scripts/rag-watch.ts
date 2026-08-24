import { fileURLToPath } from "node:url";
import { createLocalKnowledgeWatch, createLocalRagRuntime, executeLocalKnowledgeSync } from "../server/cli/local-sync";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const environment = { ...process.env, NITRO_REPOSITORY_ROOT: process.env.NITRO_REPOSITORY_ROOT || repositoryRoot };
const sourceRoot = process.env.NITRO_KNOWLEDGE_SOURCE_ROOT || `${repositoryRoot}docs/docx`;

const watcher = createLocalKnowledgeWatch({
	sourceRoot,
	run: async () => {
		const exitCode = await executeLocalKnowledgeSync([], {
			createRuntime: () => createLocalRagRuntime(environment),
			write: (output) => process.stdout.write(`${output}\n`),
		});
		if (exitCode !== 0) process.exitCode = exitCode;
	},
});

process.once("SIGINT", () => watcher.close());
process.once("SIGTERM", () => watcher.close());
process.stdout.write(`正在监听 ${sourceRoot}\n`);
