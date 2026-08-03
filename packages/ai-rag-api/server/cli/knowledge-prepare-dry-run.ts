import { resolve } from "node:path";
import { KnowledgeSourceError } from "../services/knowledge-source";
import { prepareKnowledgeBase } from "../services/prepare-knowledge";

export type KnowledgePrepareDryRunOutput = {
	chunkCount: number;
	documentCount: number;
	dryRun: true;
	failedFiles: string[];
};

export type KnowledgePrepareDryRunErrorOutput = {
	error: {
		code: string;
		message: string;
	};
};

type KnowledgePrepareDryRunOptions = {
	repositoryRoot: string;
	sourceRoot: string;
};

type KnowledgePrepareDryRunExecutionOptions = {
	repositoryRoot: string;
	write: (output: string) => void;
};

/** 解析只读知识准备命令的受限参数集合。 */
export function parseKnowledgePrepareDryRunArguments(
	argumentsList: string[],
	repositoryRoot: string,
): KnowledgePrepareDryRunOptions {
	let sourceRoot = resolve(repositoryRoot, "docs", "docx");
	let receivedDryRun = false;

	for (let index = 0; index < argumentsList.length; index += 1) {
		const argument = argumentsList[index];
		if (argument === "--dry-run" && !receivedDryRun) {
			receivedDryRun = true;
			continue;
		}

		if (argument === "--source-root" && typeof argumentsList[index + 1] === "string") {
			sourceRoot = resolve(repositoryRoot, argumentsList[index + 1]);
			index += 1;
			continue;
		}

		throw new Error(
			argument === "--dry-run"
				? "参数 --dry-run 只能出现一次"
				: argument === "--source-root"
					? "参数 --source-root 必须提供目录路径"
					: `不支持的参数：${argument}`,
		);
	}

	if (!receivedDryRun) {
		throw new Error("必须显式传入 --dry-run；该命令不会写入知识库");
	}

	return { repositoryRoot, sourceRoot };
}

/** 将预期的本地读取失败编码为可由自动化程序识别的 JSON。 */
function toErrorOutput(error: unknown): KnowledgePrepareDryRunErrorOutput {
	if (error instanceof KnowledgeSourceError) {
		return { error: { code: error.code, message: error.message } };
	}

	return {
		error: {
			code: "KNOWLEDGE_PREPARE_ARGUMENT_INVALID",
			message: error instanceof Error ? error.message : "离线知识准备命令执行失败",
		},
	};
}

/** 执行只读的本地知识准备，并返回适合 shell 的退出码。 */
export async function executeKnowledgePrepareDryRun(
	argumentsList: string[],
	options: KnowledgePrepareDryRunExecutionOptions,
): Promise<number> {
	try {
		const parsedOptions = parseKnowledgePrepareDryRunArguments(argumentsList, options.repositoryRoot);
		const preparedKnowledgeBase = await prepareKnowledgeBase(parsedOptions);
		const output: KnowledgePrepareDryRunOutput = {
			dryRun: true,
			documentCount: preparedKnowledgeBase.documentCount,
			chunkCount: preparedKnowledgeBase.chunkCount,
			failedFiles: [],
		};
		options.write(JSON.stringify(output));
		return 0;
	} catch (error) {
		options.write(JSON.stringify(toErrorOutput(error)));
		return 1;
	}
}
