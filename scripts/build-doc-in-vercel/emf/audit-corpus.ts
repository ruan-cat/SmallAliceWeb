import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inspectEmf, type EmfAudit } from "./audit";
import { readDocxMediaEntries } from "./audit-manifest";
import { convertEmfToSvg } from "./convert";
import { fontFamilyMap } from "./fonts";

/** 全量审计基线中单个 DOCX 媒体条目的格式。 */
export interface EmfAuditCorpusEntry {
	docxPath: string;
	entryName: string;
	format: "emf" | "wmf";
	bytes: number;
	sha256: string;
	audit: EmfAudit | null;
	manualReviewReason: string | null;
}

/** 归档后仍由测试包保留的全量审计基线格式。 */
export interface EmfAuditCorpusManifest {
	schemaVersion: 1;
	sourceRoot: string;
	entries: EmfAuditCorpusEntry[];
}

/** 全量来源回读或 SVG 契约校验的稳定统计。 */
export interface EmfAuditCorpusValidationResult {
	entries: number;
	uniquePayloads: number;
	revalidatedEntries: number;
	convertedUniquePayloads: number;
	coveredEntries: number;
	reviewCandidates: Record<string, number>;
	converterWarnings: Record<string, number>;
}

/** 确保基线中的相对 DOCX 路径不会逃逸出调用者明确传入的源目录。 */
function resolveDocxPath(sourceRoot: string, docxPath: string): string {
	const resolved = path.resolve(sourceRoot, docxPath);
	const relative = path.relative(sourceRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`审计基线路径越界：${docxPath}`);
	}
	return resolved;
}

/** 将单条基线的人工复核候选累积为可输出的稳定统计。 */
function countReviewCandidates(entries: EmfAuditCorpusEntry[]): Record<string, number> {
	return entries.reduce<Record<string, number>>((counts, entry) => {
		for (const category of entry.audit?.reviewCategories ?? []) {
			counts[category] = (counts[category] ?? 0) + 1;
		}
		return counts;
	}, {});
}

/** 归一化转换器警告，避免上游日志前缀污染受版本控制的风险计数。 */
function normalizeConverterWarning(args: unknown[]): string {
	return args
		.map((value) => String(value))
		.join(" ")
		.replace(/^\[emf-converter\]\s*/, "");
}

/** 在单线程全量转换期间捕获上游警告，并将其纳入可断言的审计结果。 */
async function captureConverterWarnings<T>(
	action: () => Promise<T>,
): Promise<{ result: T; warnings: Record<string, number> }> {
	const originalWarn = console.warn;
	const warnings: Record<string, number> = {};
	console.warn = (...args: unknown[]) => {
		const warning = normalizeConverterWarning(args);
		warnings[warning] = (warnings[warning] ?? 0) + 1;
	};
	try {
		return { result: await action(), warnings };
	} finally {
		console.warn = originalWarn;
	}
}

/** 对每条媒体执行一次来源、哈希和 record 审计的一致性断言。 */
function assertSourceEntry(entry: EmfAuditCorpusEntry, content: Buffer): void {
	if (content.length !== entry.bytes) {
		throw new Error(`审计语料字节数漂移：${entry.docxPath}#${entry.entryName}`);
	}
	const sha256 = createHash("sha256").update(content).digest("hex");
	if (sha256 !== entry.sha256) {
		throw new Error(`审计语料 SHA-256 漂移：${entry.docxPath}#${entry.entryName}`);
	}
	if (entry.format === "emf") {
		if (!entry.audit || !isDeepStrictEqual(inspectEmf(content), entry.audit)) {
			throw new Error(`审计语料 record 分类漂移：${entry.docxPath}#${entry.entryName}`);
		}
		return;
	}
	if (entry.audit !== null || !entry.manualReviewReason) {
		throw new Error(`WMF 审计基线缺少显式人工复核约束：${entry.docxPath}#${entry.entryName}`);
	}
}

/** 从完整本地 DOCX 源目录重新构建基线全部条目的二进制载荷。 */
function collectCorpusPayloads(manifest: EmfAuditCorpusManifest, sourceRoot: string): Map<string, Buffer> {
	if (manifest.schemaVersion !== 1 || manifest.entries.length === 0) {
		throw new Error("审计测试基线格式无效或不含媒体条目");
	}
	if (!existsSync(sourceRoot)) {
		throw new Error(`EMF 审计源目录不存在：${sourceRoot}`);
	}

	const payloads = new Map<string, Buffer>();
	const mediaByDocx = new Map<string, Map<string, Buffer>>();
	for (const entry of manifest.entries) {
		const docxPath = resolveDocxPath(sourceRoot, entry.docxPath);
		let media = mediaByDocx.get(docxPath);
		if (!media) {
			media = new Map(readDocxMediaEntries(docxPath).map((item) => [item.entryName, item.content]));
			mediaByDocx.set(docxPath, media);
		}
		const content = media.get(entry.entryName);
		if (!content) {
			throw new Error(`审计语料缺少媒体条目：${entry.docxPath}#${entry.entryName}`);
		}
		assertSourceEntry(entry, content);
		payloads.set(entry.sha256, content);
	}
	return payloads;
}

/** 检查 SVG 不是空文档或由单一位图外壳伪装的转换结果。 */
function assertSvgContract(svgBuffer: Buffer, sha256: string): void {
	const svg = svgBuffer.toString("utf8");
	if (!/<svg\b[^>]*\bviewBox=/.test(svg)) {
		throw new Error(`SVG 缺少带 viewBox 的根元素：${sha256}`);
	}
	const hasVectorElement = /<(?:path|rect|circle|ellipse|line|polyline|polygon|text|use)\b/.test(svg);
	const imageCount = [...svg.matchAll(/<image\b/g)].length;
	if (!hasVectorElement && imageCount === 0) {
		throw new Error(`SVG 缺少可渲染图元：${sha256}`);
	}
	if (!hasVectorElement && imageCount === 1) {
		throw new Error(`SVG 退化为唯一位图图元：${sha256}`);
	}
}

/** 逐条回读完整源 DOCX，验证受版本控制基线没有自证或漂移。 */
export function validateAuditCorpusSources(
	manifest: EmfAuditCorpusManifest,
	sourceRoot: string,
): EmfAuditCorpusValidationResult {
	const payloads = collectCorpusPayloads(manifest, sourceRoot);
	return {
		entries: manifest.entries.length,
		uniquePayloads: payloads.size,
		revalidatedEntries: manifest.entries.length,
		convertedUniquePayloads: 0,
		coveredEntries: 0,
		reviewCandidates: countReviewCandidates(manifest.entries),
		converterWarnings: {},
	};
}

/** 按唯一 SHA-256 转换全量语料为 SVG，并把结果覆盖回全部清单引用。 */
export async function validateAuditCorpusSvg(
	manifest: EmfAuditCorpusManifest,
	sourceRoot: string,
): Promise<EmfAuditCorpusValidationResult> {
	const payloads = collectCorpusPayloads(manifest, sourceRoot);
	const { warnings } = await captureConverterWarnings(async () => {
		for (const [sha256, payload] of payloads) {
			const svg = await convertEmfToSvg(payload, { fontFamilyMap });
			assertSvgContract(svg, sha256);
		}
	});
	return {
		entries: manifest.entries.length,
		uniquePayloads: payloads.size,
		revalidatedEntries: manifest.entries.length,
		convertedUniquePayloads: payloads.size,
		coveredEntries: manifest.entries.length,
		reviewCandidates: countReviewCandidates(manifest.entries),
		converterWarnings: warnings,
	};
}
