/** 副作用导入：保证 canvas shim 在 emf-converter 使用前先安装 */
import "./canvas-shim";
import { convertEmfToDataUrl, convertWmfToDataUrl } from "emf-converter";

/** EMF/WMF 转换选项 */
export interface ConvertOptions {
	/** 输出画布最大宽度，默认 1024 */
	maxWidth?: number;
	/** 输出画布最大高度，默认 1024 */
	maxHeight?: number;
	/** EMF 内部字体名到可用字体名的映射 */
	fontFamilyMap?: Record<string, string>;
}

/** 输出尺寸默认上限 */
const DEFAULT_MAX_SIZE = 1024;

/** EMF 头 record type 为 1 的小端魔数（前 4 字节） */
const EMF_MAGIC = [0x01, 0x00, 0x00, 0x00];
/** placeable WMF 魔数（前 4 字节） */
const WMF_MAGIC = [0xd7, 0xcd, 0xc6, 0x9a];
/** PNG 文件签名：首字节 0x89 + "PNG" ASCII */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * 判断 buffer 前 4 字节是否与给定魔数一致。
 *
 * @param buffer - 待检查的字节序列
 * @param magic - 期望的魔数字节数组
 */
function matchesMagic(buffer: Buffer, magic: number[]): boolean {
	if (buffer.length < 4) {
		return false;
	}
	return magic.every((byte, index) => buffer[index] === byte);
}

/**
 * 将 EMF/WMF 图片转换为 PNG Buffer。
 *
 * 根据文件头魔数自动分流 EMF 与 placeable WMF，调用 emf-converter 渲染为 dataURL，
 * 再解码为 PNG Buffer 返回。失败语义：向上抛异常，本模块不做任何兜底决策。
 *
 * emf-converter 实测容错语义（2026-08-23，详见 change 工件 design.md §6.3 用例 4）：
 * - 失败（无效文件 / canvas 不可用 / 导出失败）返回 null 而非抛错 → 本封装 null→throw；
 * - record 流截断（仅保留头部）仍会输出残片 PNG 而非抛错——截断输入不是 throw 用例；
 * - 仅当头部魔数无法识别、buffer 过短或输出非 PNG 时，本封装主动 throw。
 *
 * @param buffer - 输入的 EMF/WMF 文件字节
 * @param options - 转换选项（尺寸上限与字体映射）
 * @returns PNG 格式的 Buffer
 * @throws 输入为空、魔数无法识别、emf-converter 返回 null 或输出非 PNG 时抛出描述性 Error
 */
export async function convertEmfToPng(buffer: Buffer, options?: ConvertOptions): Promise<Buffer> {
	if (buffer.length < 4) {
		throw new Error(`EMF 转换失败：输入 buffer 过短（${buffer.length} 字节，至少需要 4 字节魔数）`);
	}

	/** Buffer → ArrayBuffer 转换：按字节偏移精确切片，避免共享底层池的其他字节混入 */
	const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

	const emfOptions = {
		maxWidth: options?.maxWidth ?? DEFAULT_MAX_SIZE,
		maxHeight: options?.maxHeight ?? DEFAULT_MAX_SIZE,
		fontFamilyMap: options?.fontFamilyMap,
	};

	/** 魔数分流：EMF 头 record type 1 小端 → convertEmfToDataUrl；placeable WMF 魔数 → convertWmfToDataUrl */
	let dataUrl: string | null;
	if (matchesMagic(buffer, EMF_MAGIC)) {
		dataUrl = await convertEmfToDataUrl(arrayBuffer, emfOptions);
	} else if (matchesMagic(buffer, WMF_MAGIC)) {
		dataUrl = await convertWmfToDataUrl(arrayBuffer, emfOptions);
	} else {
		throw new Error(
			`EMF 转换失败：无法识别的文件魔数（前 4 字节：${Array.from(buffer.subarray(0, 4))
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join(" ")}），期望 EMF（01 00 00 00）或 placeable WMF（d7 cd c6 9a）`,
		);
	}

	if (dataUrl === null) {
		throw new Error("EMF 转换失败：emf-converter 返回 null（无效或无法渲染的文件）");
	}

	/** dataURL → PNG Buffer：取逗号后的 base64 载荷解码 */
	const pngBuffer = Buffer.from(dataUrl.split(",")[1], "base64");

	/** 输出前校验 PNG 魔数：首字节 0x89 + "PNG" ASCII */
	if (pngBuffer.length < 4 || !pngBuffer.subarray(0, 4).equals(PNG_SIGNATURE)) {
		throw new Error("EMF 转换失败：emf-converter 输出不是有效的 PNG 数据（dataURL 魔数校验失败）");
	}

	return pngBuffer;
}
