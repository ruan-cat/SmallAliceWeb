/** TTF sfnt 表目录在文件头中的起始偏移。 */
const SFNT_TABLE_DIRECTORY_OFFSET = 12;

/**
 * 读取随包 TTF 的 Unicode cmap，并返回所有存在字形的字符码点。
 *
 * 此工具只覆盖当前字体资产实际使用的 cmap format 4 与 format 12，避免为测试
 * 引入 FontTools 或其他运行时依赖。
 *
 * @param fontBuffer - TTF 文件内容
 * @returns 字体 cmap 中存在字形的 Unicode 码点集合
 */
export function readTtfCmap(fontBuffer: Buffer): ReadonlySet<number> {
	const cmapOffset = findTableOffset(fontBuffer, "cmap");
	const subtableCount = readUint16(fontBuffer, cmapOffset + 2);
	const codePoints = new Set<number>();

	for (let index = 0; index < subtableCount; index++) {
		const recordOffset = cmapOffset + 4 + index * 8;
		const platformId = readUint16(fontBuffer, recordOffset);
		const encodingId = readUint16(fontBuffer, recordOffset + 2);
		if (!isUnicodeEncoding(platformId, encodingId)) {
			continue;
		}

		const subtableOffset = cmapOffset + readUint32(fontBuffer, recordOffset + 4);
		const format = readUint16(fontBuffer, subtableOffset);
		if (format === 4) {
			readFormat4(fontBuffer, subtableOffset, codePoints);
		} else if (format === 12) {
			readFormat12(fontBuffer, subtableOffset, codePoints);
		}
	}

	return codePoints;
}

/** 查找 sfnt 表目录中指定标签的绝对偏移。 */
function findTableOffset(fontBuffer: Buffer, tag: string): number {
	const tableCount = readUint16(fontBuffer, 4);
	for (let index = 0; index < tableCount; index++) {
		const recordOffset = SFNT_TABLE_DIRECTORY_OFFSET + index * 16;
		if (fontBuffer.subarray(recordOffset, recordOffset + 4).toString("ascii") === tag) {
			return readUint32(fontBuffer, recordOffset + 8);
		}
	}

	throw new Error(`TTF 缺少 ${tag} 表`);
}

/** 判断 cmap 编码记录是否使用 Unicode 字符码点。 */
function isUnicodeEncoding(platformId: number, encodingId: number): boolean {
	return platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
}

/** 读取 BMP 字符使用的 cmap format 4 子表。 */
function readFormat4(fontBuffer: Buffer, subtableOffset: number, codePoints: Set<number>): void {
	const subtableLength = readUint16(fontBuffer, subtableOffset + 2);
	const subtableEnd = subtableOffset + subtableLength;
	const segmentCount = readUint16(fontBuffer, subtableOffset + 6) / 2;
	const endCodesOffset = subtableOffset + 14;
	const startCodesOffset = endCodesOffset + segmentCount * 2 + 2;
	const idDeltasOffset = startCodesOffset + segmentCount * 2;
	const idRangeOffsetsOffset = idDeltasOffset + segmentCount * 2;

	for (let index = 0; index < segmentCount; index++) {
		const startCode = readUint16(fontBuffer, startCodesOffset + index * 2);
		const endCode = readUint16(fontBuffer, endCodesOffset + index * 2);
		const idDelta = readInt16(fontBuffer, idDeltasOffset + index * 2);
		const idRangeOffsetAddress = idRangeOffsetsOffset + index * 2;
		const idRangeOffset = readUint16(fontBuffer, idRangeOffsetAddress);

		for (let codePoint = startCode; codePoint <= endCode && codePoint !== 0xffff; codePoint++) {
			const glyphId =
				idRangeOffset === 0
					? (codePoint + idDelta) & 0xffff
					: readFormat4GlyphId(
							fontBuffer,
							subtableEnd,
							idRangeOffsetAddress,
							idRangeOffset,
							startCode,
							codePoint,
							idDelta,
						);
			if (glyphId !== 0) {
				codePoints.add(codePoint);
			}
		}
	}
}

/** 读取 format 4 间接 glyphIdArray 中的字形编号。 */
function readFormat4GlyphId(
	fontBuffer: Buffer,
	subtableEnd: number,
	idRangeOffsetAddress: number,
	idRangeOffset: number,
	startCode: number,
	codePoint: number,
	idDelta: number,
): number {
	const glyphOffset = idRangeOffsetAddress + idRangeOffset + (codePoint - startCode) * 2;
	if (glyphOffset + 2 > subtableEnd) {
		throw new Error("TTF cmap format 4 的 glyphIdArray 越界");
	}
	const glyphId = readUint16(fontBuffer, glyphOffset);
	return glyphId === 0 ? 0 : (glyphId + idDelta) & 0xffff;
}

/** 读取补充平面字符使用的 cmap format 12 子表。 */
function readFormat12(fontBuffer: Buffer, subtableOffset: number, codePoints: Set<number>): void {
	const groupCount = readUint32(fontBuffer, subtableOffset + 12);
	for (let index = 0; index < groupCount; index++) {
		const groupOffset = subtableOffset + 16 + index * 12;
		const startCode = readUint32(fontBuffer, groupOffset);
		const endCode = readUint32(fontBuffer, groupOffset + 4);
		const startGlyphId = readUint32(fontBuffer, groupOffset + 8);
		for (let codePoint = startCode; codePoint <= endCode; codePoint++) {
			if (startGlyphId + codePoint - startCode !== 0) {
				codePoints.add(codePoint);
			}
		}
	}
}

/** 从 Buffer 读取大端无符号 16 位整数。 */
function readUint16(buffer: Buffer, offset: number): number {
	return buffer.readUInt16BE(offset);
}

/** 从 Buffer 读取大端有符号 16 位整数。 */
function readInt16(buffer: Buffer, offset: number): number {
	return buffer.readInt16BE(offset);
}

/** 从 Buffer 读取大端无符号 32 位整数。 */
function readUint32(buffer: Buffer, offset: number): number {
	return buffer.readUInt32BE(offset);
}
