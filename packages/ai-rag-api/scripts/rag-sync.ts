import { executeLocalKnowledgeSync, createLocalRagRuntime } from "../server/cli/local-sync";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const environment = { ...process.env, NITRO_REPOSITORY_ROOT: process.env.NITRO_REPOSITORY_ROOT || repositoryRoot };

const exitCode = await executeLocalKnowledgeSync(process.argv.slice(2), {
	createRuntime: () => createLocalRagRuntime(environment),
	write: (output) => process.stdout.write(`${output}\n`),
});

process.exitCode = exitCode;
