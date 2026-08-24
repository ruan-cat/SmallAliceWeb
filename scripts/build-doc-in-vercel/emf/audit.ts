/** EMF 记录类型：EMR_EXTTEXTOUTW。 */
const EMR_EXTTEXTOUTW = 84;
/** EMF 记录类型：EMR_COMMENT。 */
const EMR_COMMENT = 70;
/** EMF 记录类型：EMR_SETROP2。 */
const EMR_SETROP2 = 20;
/** EMF 记录类型：EMR_EXCLUDECLIPRECT。 */
const EMR_EXCLUDECLIPRECT = 29;
/** EMF 记录类型：EMR_INTERSECTCLIPRECT。 */
const EMR_INTERSECTCLIPRECT = 30;
/** EMF 记录类型：EMR_SELECTCLIPPATH。 */
const EMR_SELECTCLIPPATH = 67;
/** EMF 记录类型：EMR_EXTSELECTCLIPRGN。 */
const EMR_EXTSELECTCLIPRGN = 75;
/** EMF+ comment 签名 `EMF+` 的小端 DWORD。 */
const EMFPLUS_SIGNATURE = 0x2b464d45;
/** EMF+ Header record 类型。 */
const EMFPLUS_RECORD_HEADER = 0x4001;
/** EMF+ DrawDriverString record 类型。 */
const EMFPLUS_RECORD_DRAW_DRIVER_STRING = 0x4036;
/** ETO_GLYPH_INDEX 标志位。 */
const ETO_GLYPH_INDEX = 0x0010;

/** 自动审计可识别的格式。 */
export type EmfAuditFormat = "emf";
/** 需要 GDI+ 对照和浏览器视觉确认的风险类别。 */
export type EmfRiskFlag =
	| "emf-plus-dual"
	| "glyph-index-text"
	| "rop2"
	| "complex-clip"
	| "draw-driver-string"
	| "bitmap";
/** 对应人工检查清单的候选视觉类别；不是自动判定缺陷。 */
export type EmfReviewCategory = "乱码" | "错位" | "重复" | "裁断" | "占位符";

/** 审计时累计的、与风险判断直接相关的 record 数量。 */
export interface EmfRecordCounts {
	total: number;
	extTextOutW: number;
	emfPlusComment: number;
	bitmap: number;
	rop2: number;
	complexClip: number;
	drawDriverString: number;
}

/** 单个 EMF 输入的稳定记录级审计结果。 */
export interface EmfAudit {
	format: EmfAuditFormat;
	recordCounts: EmfRecordCounts;
	riskFlags: EmfRiskFlag[];
	reviewCategories: EmfReviewCategory[];
}

/** 对指定键执行计数加一。 */
function increment<K extends keyof EmfRecordCounts>(counts: EmfRecordCounts, key: K): void {
	counts[key]++;
}

/** 向数组写入一次唯一项，保持首次发现时的稳定顺序。 */
function addUnique<T>(values: T[], value: T): void {
	if (!values.includes(value)) {
		values.push(value);
	}
}

/** 判断 record 是否为包含 EMF+ 记录流的 EMR_COMMENT。 */
function isEmfPlusComment(buffer: Buffer, offset: number, size: number): boolean {
	return size >= 16 && buffer.readUInt32LE(offset + 12) === EMFPLUS_SIGNATURE;
}

/** 扫描单个 EMF+ comment 中按 12 字节头编码的 EMF+ records。 */
function inspectEmfPlusComment(
	buffer: Buffer,
	offset: number,
	size: number,
	counts: EmfRecordCounts,
	riskFlags: EmfRiskFlag[],
): void {
	const commentDataSize = buffer.readUInt32LE(offset + 8);
	const commentEnd = Math.min(offset + size, offset + 12 + commentDataSize);
	let recordOffset = offset + 16;

	while (recordOffset + 12 <= commentEnd) {
		const type = buffer.readUInt16LE(recordOffset);
		const flags = buffer.readUInt16LE(recordOffset + 2);
		const recordSize = buffer.readUInt32LE(recordOffset + 4);
		if (recordSize < 12 || recordOffset + recordSize > commentEnd) {
			break;
		}

		if (type === EMFPLUS_RECORD_HEADER && (flags & 0x0001) !== 0) {
			addUnique(riskFlags, "emf-plus-dual");
		}
		if (type === EMFPLUS_RECORD_DRAW_DRIVER_STRING) {
			increment(counts, "drawDriverString");
			addUnique(riskFlags, "draw-driver-string");
		}
		recordOffset += recordSize;
	}
}

/**
 * 解析真实 EMF record 目录并标记必须进入 GDI+/浏览器人工复核的高风险类别。
 *
 * 该函数只做二进制结构审计，绝不把风险标记误报为已确认的乱码、错位、重复、裁断或占位符。
 *
 * @param buffer - 完整 EMF 输入字节
 * @returns 稳定、可序列化的 record 统计和人工复核候选类别
 */
export function inspectEmf(buffer: Buffer): EmfAudit {
	if (buffer.length < 8 || buffer.readUInt32LE(0) !== 1) {
		throw new Error("EMF 审计失败：输入不是以 EMR_HEADER 开始的完整 EMF");
	}

	const recordCounts: EmfRecordCounts = {
		total: 0,
		extTextOutW: 0,
		emfPlusComment: 0,
		bitmap: 0,
		rop2: 0,
		complexClip: 0,
		drawDriverString: 0,
	};
	const riskFlags: EmfRiskFlag[] = [];
	let offset = 0;

	while (offset + 8 <= buffer.length) {
		const type = buffer.readUInt32LE(offset);
		const size = buffer.readUInt32LE(offset + 4);
		if (size < 8 || offset + size > buffer.length) {
			throw new Error(`EMF 审计失败：record @${offset} 的大小 ${size} 超出输入边界`);
		}
		increment(recordCounts, "total");

		if (type === EMR_EXTTEXTOUTW) {
			increment(recordCounts, "extTextOutW");
			if (size >= 56 && (buffer.readUInt32LE(offset + 52) & ETO_GLYPH_INDEX) !== 0) {
				addUnique(riskFlags, "glyph-index-text");
			}
		}
		if (type === EMR_COMMENT && isEmfPlusComment(buffer, offset, size)) {
			increment(recordCounts, "emfPlusComment");
			inspectEmfPlusComment(buffer, offset, size, recordCounts, riskFlags);
		}
		if ([76, 77, 78, 79, 81, 114, 116].includes(type)) {
			increment(recordCounts, "bitmap");
			addUnique(riskFlags, "bitmap");
		}
		if (type === EMR_SETROP2) {
			increment(recordCounts, "rop2");
			addUnique(riskFlags, "rop2");
		}
		if ([EMR_EXCLUDECLIPRECT, EMR_INTERSECTCLIPRECT, EMR_SELECTCLIPPATH, EMR_EXTSELECTCLIPRGN].includes(type)) {
			increment(recordCounts, "complexClip");
			addUnique(riskFlags, "complex-clip");
		}
		offset += size;
	}

	const reviewCategories: EmfReviewCategory[] = [];
	if (riskFlags.includes("glyph-index-text") || riskFlags.includes("draw-driver-string")) {
		addUnique(reviewCategories, "乱码");
		addUnique(reviewCategories, "占位符");
	}
	if (riskFlags.includes("emf-plus-dual")) {
		addUnique(reviewCategories, "错位");
		addUnique(reviewCategories, "重复");
	}
	if (riskFlags.includes("bitmap") || riskFlags.includes("complex-clip")) {
		addUnique(reviewCategories, "裁断");
	}

	return { format: "emf", recordCounts, riskFlags, reviewCategories };
}
