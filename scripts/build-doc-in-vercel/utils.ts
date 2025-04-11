import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

/**
 * HTML标准标签列表，这些不需要处理
 */
export const htmlStandardTags = [
	"a",
	"abbr",
	"address",
	"area",
	"article",
	"aside",
	"audio",
	"b",
	"base",
	"bdi",
	"bdo",
	"blockquote",
	"body",
	"br",
	"button",
	"canvas",
	"caption",
	"cite",
	"code",
	"col",
	"colgroup",
	"data",
	"datalist",
	"dd",
	"del",
	"details",
	"dfn",
	"dialog",
	"div",
	"dl",
	"dt",
	"em",
	"embed",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"header",
	"hgroup",
	"hr",
	"html",
	"i",
	"iframe",
	"img",
	"input",
	"ins",
	"kbd",
	"label",
	"legend",
	"li",
	"link",
	"main",
	"map",
	"mark",
	"menu",
	"meta",
	"meter",
	"nav",
	"noscript",
	"object",
	"ol",
	"optgroup",
	"option",
	"output",
	"p",
	"param",
	"picture",
	"pre",
	"progress",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"script",
	"section",
	"select",
	"small",
	"source",
	"span",
	"strong",
	"style",
	"sub",
	"summary",
	"sup",
	"svg",
	"table",
	"tbody",
	"td",
	"template",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"time",
	"title",
	"tr",
	"track",
	"u",
	"ul",
	"var",
	"video",
	"wbr",
];

/**
 * 生成简单的异步任务
 * @param task 要执行的异步任务函数
 * @returns 异步任务的结果
 */
export async function generateSimpleAsyncTask<T>(task: () => T): Promise<T> {
	try {
		return await Promise.resolve(task());
	} catch (error) {
		throw error;
	}
}

/**
 * 确保目录存在
 * @param dirPath 目录路径
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
	if (!existsSync(dirPath)) {
		await mkdir(dirPath, { recursive: true });
	}
}

/**
 * 创建相对于源文件的目标文件路径
 * @param sourceFilePath 源文件路径
 * @param sourceBaseDir 源文件基础目录
 * @param targetBaseDir 目标文件基础目录
 * @param newExtension 新的文件扩展名
 * @returns 目标文件路径
 */
export function createTargetFilePath(
	sourceFilePath: string,
	sourceBaseDir: string,
	targetBaseDir: string,
	newExtension: string,
): string {
	// 计算相对路径
	const relativePath = sourceFilePath.substring(sourceBaseDir.length);
	// 创建新的路径并更改扩展名
	const targetPath = join(targetBaseDir, relativePath.replace(/\.[^.]+$/, `.${newExtension}`));
	return targetPath;
}

/**
 * 确保目标文件的目录存在
 * @param filePath 文件路径
 */
export async function ensureTargetDirectoryExists(filePath: string): Promise<void> {
	const targetDir = dirname(filePath);
	await ensureDirectoryExists(targetDir);
}

/**
 * 错误图片占位符
 * @description
 * 一个图片地址 用于替换错误的图片地址
 */
export const errorImgUrl = "https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-02-12-18-13-41.png";
