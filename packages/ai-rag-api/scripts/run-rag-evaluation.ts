import { readFile, writeFile as writeFileToDisk } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	parseGoldSetJsonl,
	type GoldSetRecord,
} from "../server/evaluation/gold-set";
import {
	runRetrievalEvaluation,
	type EvalQuestion,
	type EvalReport,
	type EvaluationOptions,
	type EvaluationProviders,
} from "../server/evaluation/evaluator";

export type RagEvaluationMode = "dry" | "local" | "external";

export type RagEvaluationRunOptions = {
	mode?: RagEvaluationMode;
	questions?: readonly GoldSetRecord[];
	goldSetText?: string;
	providers?: EvaluationProviders;
	corpusPreflight?: EvaluationOptions["corpusPreflight"];
	candidateLimit?: number;
	finalLimit?: number;
	k?: number;
	configVersion?: string;
	outputPath?: string;
	writeFile?: (path: string, content: string) => Promise<void>;
	externalProvider?: () => Promise<unknown>;
};

export type RagEvaluationRunResult = {
	schemaVersion: 1;
	mode: RagEvaluationMode;
	status: "completed" | "skipped" | "failed";
	exitCode: 0 | 1;
	questionCount: number;
	configVersion: string;
	report?: EvalReport;
	promptfoo: {
		configPath: string;
		status: "skipped" | "completed" | "failed";
		reason?: string;
	};
	reason?: string;
	errors?: string[];
};

const defaultConfigVersion = "ai-rag-phase3";
const promptfooConfigPath = "packages/ai-rag-api/promptfoo.yaml";

/** 运行 dry/local/external 三种评测边界，并返回可审计的退出状态。 */
export async function runRagEvaluation(
	options: RagEvaluationRunOptions = {},
): Promise<RagEvaluationRunResult> {
	const mode = options.mode ?? "dry";
	const configVersion = options.configVersion ?? defaultConfigVersion;
	try {
		const questions = await loadQuestions(options);
		if (mode === "dry") {
			return await finalize(
				{
					schemaVersion: 1,
					mode,
					status: "skipped",
					exitCode: 0,
					questionCount: questions.length,
					configVersion,
					promptfoo: {
						configPath: promptfooConfigPath,
						status: "skipped",
						reason: "dry 模式不调用 provider",
					},
					reason: "dry 模式不调用 provider",
				},
				options,
			);
		}

		if (mode === "external")
			return runExternal(options, questions.length, configVersion);
		if (!options.providers) {
			return await finalize(
				failedResult(
					mode,
					questions.length,
					configVersion,
					"local 模式缺少显式 provider",
				),
				options,
			);
		}

		const report = await runRetrievalEvaluation(questions, options.providers, {
			candidateLimit: options.candidateLimit,
			finalLimit: options.finalLimit,
			limit: options.finalLimit,
			k: options.k,
			configVersion,
			corpusPreflight: options.corpusPreflight,
		});
		return await finalize(
			{
				schemaVersion: 1,
				mode,
				status: "completed",
				exitCode: 0,
				questionCount: questions.length,
				configVersion,
				report,
				promptfoo: {
					configPath: promptfooConfigPath,
					status: "skipped",
					reason: "仅由显式 Promptfoo 命令调用",
				},
			},
			options,
		);
	} catch (error) {
		return await finalize(
			failedResult(mode, 0, configVersion, sanitizeError(error)),
			options,
		);
	}
}

/** 将 gold-set 题目转换为 evaluator 兼容的关键词与 graded gold 输入。 */
export function toEvalQuestions(
	records: readonly GoldSetRecord[],
): EvalQuestion[] {
	return records.map((record) => ({
		id: record.id,
		question: record.question,
		category: record.category,
		expected_keywords: record.requiredClaims?.length
			? [...record.requiredClaims]
			: [record.question],
		gold: record.gold.map(({ chunkId, grade }) => ({ chunkId, grade })),
	}));
}

async function loadQuestions(
	options: RagEvaluationRunOptions,
): Promise<EvalQuestion[]> {
	if (options.questions) return toEvalQuestions(options.questions);
	if (options.goldSetText !== undefined)
		return toEvalQuestions(parseGoldSetJsonl(options.goldSetText));
	return [];
}

async function runExternal(
	options: RagEvaluationRunOptions,
	questionCount: number,
	configVersion: string,
): Promise<RagEvaluationRunResult> {
	if (!options.externalProvider) {
		return await finalize(
			{
				schemaVersion: 1,
				mode: "external",
				status: "skipped",
				exitCode: 0,
				questionCount,
				configVersion,
				promptfoo: {
					configPath: promptfooConfigPath,
					status: "skipped",
					reason: "未显式启用 external provider",
				},
				reason: "未显式启用 external provider",
			},
			options,
		);
	}
	try {
		await options.externalProvider();
		return await finalize(
			{
				schemaVersion: 1,
				mode: "external",
				status: "completed",
				exitCode: 0,
				questionCount,
				configVersion,
				promptfoo: { configPath: promptfooConfigPath, status: "completed" },
			},
			options,
		);
	} catch (error) {
		return await finalize(
			failedResult(
				"external",
				questionCount,
				configVersion,
				sanitizeError(error),
			),
			options,
		);
	}
}

function failedResult(
	mode: RagEvaluationMode,
	questionCount: number,
	configVersion: string,
	error: string,
): RagEvaluationRunResult {
	return {
		schemaVersion: 1,
		mode,
		status: "failed",
		exitCode: 1,
		questionCount,
		configVersion,
		promptfoo: {
			configPath: promptfooConfigPath,
			status: "failed",
			reason: error,
		},
		errors: [error],
	};
}

async function finalize(
	result: RagEvaluationRunResult,
	options: RagEvaluationRunOptions,
): Promise<RagEvaluationRunResult> {
	if (options.outputPath) {
		const writer =
			options.writeFile ??
			((path, content) => writeFileToDisk(path, content, "utf8"));
		await writer(options.outputPath, `${JSON.stringify(result, null, 2)}\n`);
	}
	return result;
}

function sanitizeError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message
		.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
		.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted-token]")
		.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-api-key]")
		.slice(0, 500);
}

async function main(argv: readonly string[]) {
	const mode = argv.includes("--local")
		? "local"
		: argv.includes("--external")
			? "external"
			: "dry";
	const outputIndex = argv.indexOf("--output");
	const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : undefined;
	const goldSetText = await readFile(
		new URL("../data/rag-gold-set.jsonl", import.meta.url),
		"utf8",
	);
	const result = await runRagEvaluation({ mode, goldSetText, outputPath });
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	await main(process.argv.slice(2));
