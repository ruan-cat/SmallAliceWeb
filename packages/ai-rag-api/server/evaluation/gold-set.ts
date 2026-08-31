const contentHashPattern = /^[a-f0-9]{64}$/i;

export type GoldSetChunk = {
	chunkId: string;
	grade: number;
	reason: string;
	sourcePath: string;
	headingPath: string[];
	chunkIndex: number;
	contentHash: string;
};

export type GoldSetHardNegative = Omit<GoldSetChunk, "grade">;

export type GoldSetCorpusSnapshot = {
	sourcePath: string;
	contentHash: string;
};

export type GoldSetRecord = {
	version: string;
	split: string;
	id: string;
	question: string;
	category: string;
	corpusSnapshot: GoldSetCorpusSnapshot;
	gold: GoldSetChunk[];
	hardNegatives: GoldSetHardNegative[];
	referenceAnswer?: string;
	requiredClaims?: string[];
	expectedCitationChunkIds?: string[];
	unanswerable?: boolean;
};

export type GoldSetParseOptions = {
	sourceContentHashes?: Readonly<Record<string, string>>;
};

/** 解析版本化 JSONL gold-set，并在进入评测前校验题集合同。 */
export function parseGoldSetJsonl(
	input: string,
	options: GoldSetParseOptions = {},
): GoldSetRecord[] {
	const records = input
		.split(/\r?\n/)
		.map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
		.filter(({ line }) => line.length > 0)
		.map(({ line, lineNumber }) => parseLine(line, lineNumber));

	if (records.length === 0) throw new Error("gold-set 至少需要一条题目");

	const ids = new Set<string>();
	for (const record of records) {
		if (ids.has(record.id))
			throw new Error(`gold-set 题目 ID 重复：${record.id}`);
		ids.add(record.id);
		validateRecord(record, options);
	}
	return records;
}

function parseLine(line: string, lineNumber: number): GoldSetRecord {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch (error) {
		throw new Error(
			`gold-set 第 ${lineNumber} 行不是有效 JSON：${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!isRecord(value))
		throw new Error(`gold-set 第 ${lineNumber} 行必须是 JSON 对象`);
	return normalizeRecord(value, lineNumber);
}

function normalizeRecord(
	value: Record<string, unknown>,
	lineNumber: number,
): GoldSetRecord {
	const required = (key: string) => {
		const item = value[key];
		if (item === undefined || item === null)
			throw new Error(`gold-set 第 ${lineNumber} 行缺少 ${key}`);
		return item;
	};

	return {
		version: requireNonEmptyString(
			required("version"),
			`第 ${lineNumber} 行 version`,
		),
		split: requireNonEmptyString(
			required("split"),
			`第 ${lineNumber} 行 split`,
		),
		id: requireNonEmptyString(required("id"), `第 ${lineNumber} 行 id`),
		question: requireNonEmptyString(
			required("question"),
			`第 ${lineNumber} 行 question`,
		),
		category: requireNonEmptyString(
			required("category"),
			`第 ${lineNumber} 行 category`,
		),
		corpusSnapshot: parseCorpusSnapshot(required("corpusSnapshot"), lineNumber),
		gold: parseGoldChunks(required("gold"), lineNumber),
		hardNegatives: parseHardNegatives(value.hardNegatives ?? [], lineNumber),
		referenceAnswer: parseOptionalString(
			value.referenceAnswer,
			`第 ${lineNumber} 行 referenceAnswer`,
		),
		requiredClaims: parseOptionalStringArray(
			value.requiredClaims,
			`第 ${lineNumber} 行 requiredClaims`,
		),
		expectedCitationChunkIds: parseOptionalStringArray(
			value.expectedCitationChunkIds,
			`第 ${lineNumber} 行 expectedCitationChunkIds`,
		),
		unanswerable:
			value.unanswerable === undefined
				? false
				: requireBoolean(
						value.unanswerable,
						`第 ${lineNumber} 行 unanswerable`,
					),
	};
}

function validateRecord(record: GoldSetRecord, options: GoldSetParseOptions) {
	if (record.unanswerable && record.gold.length > 0) {
		throw new Error(`不可回答题 ${record.id} 不能同时包含 gold`);
	}
	if (!record.unanswerable && record.gold.length === 0) {
		throw new Error(`题目 ${record.id} 的 gold 不能为空`);
	}

	const goldIds = new Set(record.gold.map((chunk) => chunk.chunkId));
	for (const hardNegative of record.hardNegatives) {
		if (goldIds.has(hardNegative.chunkId)) {
			throw new Error(
				`hard negative 不得与 gold 重叠：${hardNegative.chunkId}`,
			);
		}
	}
	for (const citationId of record.expectedCitationChunkIds ?? []) {
		if (!goldIds.has(citationId))
			throw new Error(`expected citation 必须引用 gold chunk：${citationId}`);
	}

	const currentHash =
		options.sourceContentHashes?.[record.corpusSnapshot.sourcePath];
	if (currentHash !== undefined) {
		if (!contentHashPattern.test(currentHash)) {
			throw new Error(
				`当前语料 ${record.corpusSnapshot.sourcePath} 的 contentHash 非法`,
			);
		}
		if (
			currentHash.toLowerCase() !==
			record.corpusSnapshot.contentHash.toLowerCase()
		) {
			throw new Error(
				`题目 ${record.id} 的 stale contentHash：${record.corpusSnapshot.sourcePath}`,
			);
		}
	}
}

function parseCorpusSnapshot(
	value: unknown,
	lineNumber: number,
): GoldSetCorpusSnapshot {
	if (!isRecord(value))
		throw new Error(`gold-set 第 ${lineNumber} 行 corpusSnapshot 必须是对象`);
	return {
		sourcePath: requireNonEmptyString(
			value.sourcePath,
			`第 ${lineNumber} 行 corpusSnapshot.sourcePath`,
		),
		contentHash: requireHash(
			value.contentHash,
			`第 ${lineNumber} 行 corpusSnapshot.contentHash`,
		),
	};
}

function parseGoldChunks(value: unknown, lineNumber: number): GoldSetChunk[] {
	if (!Array.isArray(value))
		throw new Error(`gold-set 第 ${lineNumber} 行 gold 必须是数组`);
	return value.map((item, index) => {
		const chunk = parseChunk(item, `第 ${lineNumber} 行 gold[${index}]`);
		if (!Number.isInteger(chunk.grade) || chunk.grade < 1 || chunk.grade > 3) {
			throw new Error(`${chunk.chunkId} 的 gold grade 必须是 1 到 3 的整数`);
		}
		return chunk;
	});
}

function parseHardNegatives(
	value: unknown,
	lineNumber: number,
): GoldSetHardNegative[] {
	if (!Array.isArray(value))
		throw new Error(`gold-set 第 ${lineNumber} 行 hardNegatives 必须是数组`);
	return value.map((item, index) =>
		parseChunk(item, `第 ${lineNumber} 行 hardNegatives[${index}]`, false),
	);
}

function parseChunk(
	value: unknown,
	label: string,
	withGrade = true,
): GoldSetChunk {
	if (!isRecord(value)) throw new Error(`${label} 必须是对象`);
	const sourcePath = requireNonEmptyString(
		value.sourcePath,
		`${label}.sourcePath`,
	);
	const chunkIndex = requireNonNegativeInteger(
		value.chunkIndex,
		`${label}.chunkIndex`,
	);
	const chunkId = requireNonEmptyString(value.chunkId, `${label}.chunkId`);
	if (chunkId !== `${sourcePath}#${chunkIndex}`)
		throw new Error(`${label}.chunkId 必须与 sourcePath/chunkIndex 一致`);
	const chunk = {
		chunkId,
		grade: withGrade
			? requireInteger(value.grade, `${label}.grade`)
			: undefined,
		reason: requireNonEmptyString(value.reason, `${label}.reason`),
		sourcePath,
		headingPath: requireStringArray(value.headingPath, `${label}.headingPath`),
		chunkIndex,
		contentHash: requireHash(value.contentHash, `${label}.contentHash`),
	};
	return chunk as GoldSetChunk;
}

function requireHash(value: unknown, label: string): string {
	const hash = requireNonEmptyString(value, label);
	if (!contentHashPattern.test(hash))
		throw new Error(`${label} 必须是 64 位十六进制 SHA-256`);
	return hash;
}

function requireNonEmptyString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0)
		throw new Error(`${label} 必须是非空字符串`);
	return value.trim();
}

function requireBoolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") throw new Error(`${label} 必须是布尔值`);
	return value;
}

function requireInteger(value: unknown, label: string): number {
	if (typeof value !== "number" || !Number.isInteger(value))
		throw new Error(`${label} 必须是整数`);
	return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
	const number = requireInteger(value, label);
	if (number < 0) throw new Error(`${label} 不能为负数`);
	return number;
}

function requireStringArray(value: unknown, label: string): string[] {
	if (!Array.isArray(value)) throw new Error(`${label} 必须是字符串数组`);
	return value.map((item, index) =>
		requireNonEmptyString(item, `${label}[${index}]`),
	);
}

function parseOptionalString(
	value: unknown,
	label: string,
): string | undefined {
	if (value === undefined) return undefined;
	return requireNonEmptyString(value, label);
}

function parseOptionalStringArray(
	value: unknown,
	label: string,
): string[] | undefined {
	if (value === undefined) return undefined;
	return requireStringArray(value, label);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
