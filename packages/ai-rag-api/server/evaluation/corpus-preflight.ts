export type CorpusPreflightStatus =
	| "ready"
	| "corpus-missing"
	| "corpus-stale"
	| "embedding-missing";

export type CorpusPreflightRequest = {
	sourcePath: string;
	headingPath?: readonly string[];
	chunkIds?: readonly string[];
	contentHash?: string;
	profileVersion: string;
	embeddingModel: string;
};

export type CorpusChunkSnapshot = {
	id: string;
	headingPath: readonly string[];
	contentHash: string;
	profileVersion: string;
	embeddingModel: string;
	embeddingPresent: boolean;
};

export type CorpusSnapshot = {
	sourcePath: string;
	contentHash: string;
	profileVersion: string;
	embeddingModel: string;
	lastSyncedAt?: string;
	syncStatus?: "succeeded" | "partial" | "failed";
	chunks: readonly CorpusChunkSnapshot[];
};

export type CorpusSnapshotProvider = (
	sourcePath: string,
) => Promise<CorpusSnapshot | null>;

export type CorpusPreflightResult = {
	sourcePath: string;
	status: CorpusPreflightStatus;
	eligibleForMetrics: boolean;
	chunkCount: number;
	embeddingCount: number;
	headingPathMatched: boolean;
	chunkIdsMatched: boolean;
	profileVersion?: string;
	embeddingModel?: string;
	lastSyncedAt?: string;
	syncStatus?: CorpusSnapshot["syncStatus"];
	reason?: string;
};

/** 读取评测目标的语料快照，并将数据状态失败隔离在检索指标之外。 */
export async function preflightCorpus(
	request: CorpusPreflightRequest,
	provider: CorpusSnapshotProvider,
): Promise<CorpusPreflightResult> {
	let snapshot: CorpusSnapshot | null;
	try {
		snapshot = await provider(request.sourcePath);
	} catch {
		return result(request, "corpus-stale", "无法读取语料或同步状态");
	}

	if (!snapshot)
		return result(request, "corpus-missing", "目标 sourcePath 不存在");
	const base = {
		sourcePath: request.sourcePath,
		chunkCount: snapshot.chunks.length,
		embeddingCount: snapshot.chunks.filter((chunk) => chunk.embeddingPresent)
			.length,
		profileVersion: snapshot.profileVersion,
		embeddingModel: snapshot.embeddingModel,
		lastSyncedAt: snapshot.lastSyncedAt,
		syncStatus: snapshot.syncStatus,
		headingPathMatched: false,
		chunkIdsMatched: true,
	};

	if (snapshot.sourcePath !== request.sourcePath)
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			reason: "sourcePath 不一致",
		};
	if (snapshot.chunks.length === 0)
		return {
			...base,
			status: "corpus-missing",
			eligibleForMetrics: false,
			reason: "目标 sourcePath 没有 chunk",
		};
	if (snapshot.syncStatus !== "succeeded") {
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			reason: "同步状态不可证明为 succeeded",
		};
	}
	if (
		request.contentHash &&
		snapshot.contentHash.toLowerCase() !== request.contentHash.toLowerCase()
	) {
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			reason: "文档 contentHash 不匹配",
		};
	}
	if (
		snapshot.profileVersion !== request.profileVersion ||
		snapshot.embeddingModel !== request.embeddingModel
	) {
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			reason: "profileVersion 或 embeddingModel 不匹配",
		};
	}
	if (
		snapshot.chunks.some(
			(chunk) =>
				chunk.profileVersion !== request.profileVersion ||
				chunk.embeddingModel !== request.embeddingModel,
		)
	) {
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			reason: "chunk profileVersion 或 embeddingModel 不匹配",
		};
	}
	if (snapshot.chunks.some((chunk) => !chunk.embeddingPresent)) {
		return {
			...base,
			status: "embedding-missing",
			eligibleForMetrics: false,
			reason: "至少一个目标 chunk 缺少 embedding",
		};
	}

	const headingPathMatched = request.headingPath
		? snapshot.chunks.some((chunk) =>
				startsWithPath(chunk.headingPath, request.headingPath!),
			)
		: true;
	const chunkIdsMatched = request.chunkIds
		? request.chunkIds.every((id) =>
				snapshot.chunks.some((chunk) => chunk.id === id),
			)
		: true;
	if (!headingPathMatched || !chunkIdsMatched) {
		return {
			...base,
			status: "corpus-stale",
			eligibleForMetrics: false,
			headingPathMatched,
			chunkIdsMatched,
			reason: !headingPathMatched
				? "目标 headingPath 不存在"
				: "目标 chunk ID 不存在",
		};
	}

	return {
		...base,
		status: "ready",
		eligibleForMetrics: true,
		headingPathMatched,
		chunkIdsMatched,
	};
}

/** 与 preflightCorpus 同义的明确命名入口，便于评测 runner 语义化调用。 */
export const runCorpusPreflight = preflightCorpus;

function startsWithPath(
	actual: readonly string[],
	expected: readonly string[],
): boolean {
	return (
		expected.length <= actual.length &&
		expected.every((part, index) => actual[index] === part)
	);
}

function result(
	request: CorpusPreflightRequest,
	status: CorpusPreflightStatus,
	reason: string,
): CorpusPreflightResult {
	return {
		sourcePath: request.sourcePath,
		status,
		eligibleForMetrics: false,
		chunkCount: 0,
		embeddingCount: 0,
		headingPathMatched: false,
		chunkIdsMatched: false,
		reason,
	};
}
