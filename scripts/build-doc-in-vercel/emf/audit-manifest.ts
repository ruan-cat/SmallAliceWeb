import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { inspectEmf, type EmfAudit } from "./audit";

/** ZIP 的 EOCD 签名。 */
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
/** ZIP 的 central-directory 签名。 */
const ZIP_CENTRAL_DIRECTORY = 0x02014b50;
/** ZIP 的 local-file-header 签名。 */
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;

/** 从 DOCX 提取的原始媒体条目。 */
export interface DocxMediaEntry {
	entryName: string;
	content: Buffer;
}

/** 一个稳定、可序列化的文档媒体审计条目。 */
export interface EmfManifestEntry {
	docxPath: string;
	entryName: string;
	format: "emf" | "wmf";
	bytes: number;
	sha256: string;
	audit: EmfAudit | null;
	manualReviewReason: string | null;
}

/** 全量审计清单的顶层格式。 */
export interface EmfAuditManifest {
	schemaVersion: 1;
	sourceRoot: string;
	entries: EmfManifestEntry[];
}

/** 在 ZIP 文件尾部定位 EOCD，拒绝无法由此轻量审计器解析的 ZIP64 文件。 */
function findEndOfCentralDirectory(zip: Buffer): number {
	const minOffset = Math.max(0, zip.length - 0xffff - 22);
	for (let offset = zip.length - 22; offset >= minOffset; offset--) {
		if (zip.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
			return offset;
		}
	}
	throw new Error("DOCX 审计失败：未找到 ZIP EOCD，ZIP64 或损坏输入不受当前轻量审计器支持");
}

/** 判断 ZIP entry 是否是需要审计的 Word 原始 EMF/WMF 媒体。 */
function isVectorMediaEntry(entryName: string): boolean {
	return /^word\/media\/[^/]+\.(emf|wmf)$/i.test(entryName);
}

/** 读取 ZIP local-file-header 的压缩载荷并按压缩算法恢复为原始字节。 */
function readZipEntry(
	zip: Buffer,
	localHeaderOffset: number,
	compressionMethod: number,
	compressedSize: number,
): Buffer {
	if (localHeaderOffset + 30 > zip.length || zip.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
		throw new Error(`DOCX 审计失败：ZIP local header @${localHeaderOffset} 无效`);
	}
	const nameLength = zip.readUInt16LE(localHeaderOffset + 26);
	const extraLength = zip.readUInt16LE(localHeaderOffset + 28);
	const dataOffset = localHeaderOffset + 30 + nameLength + extraLength;
	const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
	if (compressed.length !== compressedSize) {
		throw new Error("DOCX 审计失败：ZIP entry 压缩数据被截断");
	}
	if (compressionMethod === 0) {
		return Buffer.from(compressed);
	}
	if (compressionMethod === 8) {
		return inflateRawSync(compressed);
	}
	throw new Error(`DOCX 审计失败：不支持 ZIP compression method ${compressionMethod}`);
}

/**
 * 从 DOCX 的 ZIP 中央目录直接提取 Word EMF/WMF 媒体，不写入临时目录。
 *
 * @param docxPath - 原始 DOCX 文件绝对或相对路径
 * @returns 按 ZIP 中央目录顺序排列的媒体条目
 */
export function readDocxMediaEntries(docxPath: string): DocxMediaEntry[] {
	const zip = readFileSync(docxPath);
	const eocdOffset = findEndOfCentralDirectory(zip);
	const entryCount = zip.readUInt16LE(eocdOffset + 10);
	let offset = zip.readUInt32LE(eocdOffset + 16);
	const entries: DocxMediaEntry[] = [];

	for (let index = 0; index < entryCount; index++) {
		if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY) {
			throw new Error(`DOCX 审计失败：central directory entry ${index} 无效`);
		}
		const compressionMethod = zip.readUInt16LE(offset + 10);
		const compressedSize = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localHeaderOffset = zip.readUInt32LE(offset + 42);
		const entryName = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

		if (isVectorMediaEntry(entryName)) {
			entries.push({
				entryName,
				content: readZipEntry(zip, localHeaderOffset, compressionMethod, compressedSize),
			});
		}
		offset += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

/** 递归列出目录中稳定排序的 DOCX 文件。 */
function listDocxFiles(root: string): string[] {
	return readdirSync(root, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(root, entry.name);
			if (entry.isDirectory()) {
				return listDocxFiles(entryPath);
			}
			return entry.isFile() && !entry.name.startsWith("~$") && entry.name.toLowerCase().endsWith(".docx")
				? [entryPath]
				: [];
		})
		.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

/**
 * 构建全量 DOCX EMF/WMF 的 record 风险清单；WMF 会显式保留为待单独解析的人工复核项。
 *
 * @param sourceRoot - 包含原始 DOCX 的根目录
 * @returns 不含时间戳、可稳定 diff 的全量清单
 */
export function createEmfAuditManifest(sourceRoot: string): EmfAuditManifest {
	const entries = listDocxFiles(sourceRoot).flatMap((docxPath) =>
		readDocxMediaEntries(docxPath).map((media): EmfManifestEntry => {
			const format = path.extname(media.entryName).slice(1).toLowerCase() as "emf" | "wmf";
			return {
				docxPath: path.relative(sourceRoot, docxPath).replaceAll(path.sep, "/"),
				entryName: media.entryName,
				format,
				bytes: media.content.length,
				sha256: createHash("sha256").update(media.content).digest("hex"),
				audit: format === "emf" ? inspectEmf(media.content) : null,
				manualReviewReason: format === "wmf" ? "WMF 需独立 record 解析器；不得静默视为 SVG 质量通过" : null,
			};
		}),
	);

	return { schemaVersion: 1, sourceRoot: path.resolve(sourceRoot), entries };
}

/** 从 CLI 参数中读取必填值。 */
function readArgument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? undefined : process.argv[index + 1];
	if (!value) {
		throw new Error(`缺少参数 ${name}`);
	}
	return value;
}

/** 作为命令执行时生成 JSON 清单并打印稳定的总计。 */
function main(): void {
	const sourceRoot = readArgument("--input");
	const outputPath = readArgument("--output");
	if (!existsSync(sourceRoot)) {
		throw new Error(`审计源目录不存在：${sourceRoot}`);
	}
	const manifest = createEmfAuditManifest(sourceRoot);
	writeFileSync(outputPath, `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	console.log(
		JSON.stringify({
			docxMedia: manifest.entries.length,
			emf: manifest.entries.filter((entry) => entry.format === "emf").length,
			wmf: manifest.entries.filter((entry) => entry.format === "wmf").length,
			riskCounts: manifest.entries.reduce<Record<string, number>>((counts, entry) => {
				for (const flag of entry.audit?.riskFlags ?? []) {
					counts[flag] = (counts[flag] ?? 0) + 1;
				}
				return counts;
			}, {}),
		}),
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
