import fs from "fs";
import path from "path";
import { sync } from "glob";
import { consola } from "consola";

/**
 * 文件名称索引对象接口
 * key: 目录名
 * value: 该目录下的文件名数组（不含扩展名）
 */
export interface FileNameIndexObject {
	[dirName: string]: string[];
}

/**
 * 生成文件名称索引对象
 * @param docxDir 文档根目录
 * @returns 文件名称索引对象
 */
export function generateFileNameIndex(docxDir: string): FileNameIndexObject {
	consola.info("开始生成文件名称索引对象...");

	const pluginManualDir = path.join(docxDir, "插件详细手册");
	const fileNameIndex: FileNameIndexObject = {};

	// 获取插件详细手册目录下的所有子目录
	const subDirs = fs.existsSync(pluginManualDir)
		? fs
				.readdirSync(pluginManualDir, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name)
		: [];

	// 遍历每个子目录，获取其中的文件名
	for (const subDir of subDirs) {
		const subDirPath = path.join(pluginManualDir, subDir);

		// 使用glob匹配子目录中的所有txt, doc和docx文件
		const filePattern = path.join(subDirPath, "*.{txt,doc,docx}").replace(/\\/g, "/");
		const files = sync(filePattern);

		// 提取文件名（不含扩展名）
		const fileNames = files.map((filePath) => {
			const baseName = path.basename(filePath);
			return baseName.substring(0, baseName.lastIndexOf("."));
		});

		// 如果有文件，则添加到索引对象中
		if (fileNames.length > 0) {
			fileNameIndex[subDir] = fileNames;
		}
	}

	consola.success(`文件名称索引对象生成完成，共包含 ${Object.keys(fileNameIndex).length} 个目录`);
	return fileNameIndex;
}

/**
 * 生成指向文件名索引对象
 * 从文件名称索引对象中提取带有"（指向）"前缀的文件名，并去除前缀
 * @param fileNameIndex 文件名称索引对象
 * @returns 指向文件名索引对象
 */
export function generatePointingFileNameIndex(fileNameIndex: FileNameIndexObject): FileNameIndexObject {
	consola.info("开始生成指向文件名索引对象...");

	const pointingFileNameIndex: FileNameIndexObject = {};

	// 遍历文件名称索引对象
	for (const [dirName, fileNames] of Object.entries(fileNameIndex)) {
		// 筛选带有"（指向）"前缀的文件名
		const pointingFileNames = fileNames
			.filter((fileName) => fileName.includes("（指向）"))
			.map((fileName) => fileName.replace("（指向）", ""));

		// 如果有指向文件，则添加到索引对象中
		if (pointingFileNames.length > 0) {
			pointingFileNameIndex[dirName] = pointingFileNames;
		}
	}

	consola.success(`指向文件名索引对象生成完成，共包含 ${Object.keys(pointingFileNameIndex).length} 个目录`);
	return pointingFileNameIndex;
}

/**
 * 执行数据预备阶段
 * @param docxDir 文档目录路径
 * @returns 包含索引对象的结果
 */
export function prepareData(docxDir: string): {
	fileNameIndex: FileNameIndexObject;
	pointingFileNameIndex: FileNameIndexObject;
} {
	consola.info("===== 开始数据预备阶段 =====");

	// 1. 生成文件名称索引对象
	const fileNameIndex = generateFileNameIndex(docxDir);

	// 2. 生成指向文件名索引对象
	const pointingFileNameIndex = generatePointingFileNameIndex(fileNameIndex);

	consola.info("===== 数据预备阶段完成 =====");

	return {
		fileNameIndex,
		pointingFileNameIndex,
	};
}

export default prepareData;
