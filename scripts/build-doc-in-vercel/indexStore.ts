import { FileNameIndexObject } from "./dataPreparation";

/**
 * 文件名称索引对象
 * key: 目录名
 * value: 该目录下的文件名数组（不含扩展名）
 */
export const fileNameIndex: FileNameIndexObject = {};

/**
 * 指向文件名索引对象
 * key: 目录名
 * value: 该目录下带有"（指向）"前缀的文件名数组（已去除前缀）
 */
export const pointingFileNameIndex: FileNameIndexObject = {};

/**
 * 更新索引对象
 * @param newFileNameIndex 新的文件名称索引对象
 * @param newPointingFileNameIndex 新的指向文件名索引对象
 */
export function updateIndexes(
	newFileNameIndex: FileNameIndexObject,
	newPointingFileNameIndex: FileNameIndexObject,
): void {
	// 清空现有对象
	Object.keys(fileNameIndex).forEach((key) => delete fileNameIndex[key]);
	Object.keys(pointingFileNameIndex).forEach((key) => delete pointingFileNameIndex[key]);

	// 复制新对象的内容
	Object.assign(fileNameIndex, newFileNameIndex);
	Object.assign(pointingFileNameIndex, newPointingFileNameIndex);
}

/**
 * 获取文件名称索引对象
 * @returns 文件名称索引对象的副本
 */
export function getFileNameIndex(): FileNameIndexObject {
	return { ...fileNameIndex };
}

/**
 * 获取指向文件名索引对象
 * @returns 指向文件名索引对象的副本
 */
export function getPointingFileNameIndex(): FileNameIndexObject {
	return { ...pointingFileNameIndex };
}
