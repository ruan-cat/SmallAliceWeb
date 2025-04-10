import fs from "fs";
import { consola } from "consola";

/**
 * 清理插件接口
 */
interface CleanerPlugin {
	name: string;
	clean: (content: string) => string;
}

/**
 * 清理锚点脏数据
 */
const anchorCleaner: CleanerPlugin = {
	name: "锚点清理器",
	clean: (content: string) => {
		// 匹配 []{#someText\n.anchor} 和 []{#someText .anchor} 格式
		return content.replace(/\[\]\{#[^\n}]+(\n)?\.anchor\}/g, "");
	},
};

/**
 * 清理宽高配置脏数据
 */
const dimensionCleaner: CleanerPlugin = {
	name: "宽高配置清理器",
	clean: (content: string) => {
		// 匹配 {width="..." height="..."} 格式的文本
		// 这个正则表达式匹配包含width和height属性的花括号块
		return content.replace(/\{width="[^"]*"(\s|\n)+.*?height="[^"]*"\}/g, "");
	},
};

/**
 * 清理器插件列表
 */
const cleanerPlugins: CleanerPlugin[] = [
	anchorCleaner,
	dimensionCleaner,
	// 可以在此处添加更多的清理插件
];

/**
 * 清理Markdown文件中的脏数据
 * @param mdFiles Markdown文件路径数组
 * @returns 处理失败的文件路径数组
 */
export async function cleanMdFiles(mdFiles: string[]): Promise<string[]> {
	const errorFiles: string[] = [];

	for (const filePath of mdFiles) {
		try {
			consola.info(`清理MD文件: ${filePath}`);

			// 读取文件内容
			let content = fs.readFileSync(filePath, "utf-8");

			// 应用所有清理插件
			for (const plugin of cleanerPlugins) {
				const originalLength = content.length;
				content = plugin.clean(content);
				const newLength = content.length;

				if (originalLength !== newLength) {
					consola.info(`${plugin.name}移除了 ${originalLength - newLength} 个字符`);
				}
			}

			// 写回文件
			fs.writeFileSync(filePath, content);

			consola.success(`已清理文件: ${filePath}`);
		} catch (error) {
			consola.error(`清理 ${filePath} 失败: ${error.message}`);
			errorFiles.push(filePath);
		}
	}

	return errorFiles;
}
