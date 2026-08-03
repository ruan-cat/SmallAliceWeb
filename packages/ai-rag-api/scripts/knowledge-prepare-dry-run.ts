import { fileURLToPath } from "node:url";
import { executeKnowledgePrepareDryRun } from "../server/cli/knowledge-prepare-dry-run";

/** 从包目录向上解析本仓库的根目录。 */
function resolveRepositoryRoot() {
	return fileURLToPath(new URL("../../../", import.meta.url));
}

const exitCode = await executeKnowledgePrepareDryRun(process.argv.slice(2), {
	repositoryRoot: resolveRepositoryRoot(),
	write: (output) => process.stdout.write(`${output}\n`),
});

process.exitCode = exitCode;
