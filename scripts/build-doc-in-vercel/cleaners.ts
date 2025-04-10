import fs from "fs";
import { consola } from "consola";
import prettier from "prettier";

/**
 * 清理插件接口
 */
interface CleanerPlugin {
	name: string;
	clean: (content: string) => string | Promise<string>;
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
 * 使用Prettier格式化Markdown文件
 */
const prettierFormatter: CleanerPlugin = {
	name: "Prettier格式化器",
	clean: async (content: string) => {
		try {
			// 获取项目中的prettier配置
			const prettierConfig = await prettier.resolveConfig(process.cwd());

			// 使用prettier格式化内容
			const formattedContent = await prettier.format(content, {
				...prettierConfig,
				parser: "markdown",
			});

			return formattedContent;
		} catch (error) {
			consola.warn(`Prettier格式化失败: ${error.message}`);
			// 如果格式化失败，返回原内容
			return content;
		}
	},
};

/**
 * 清理器插件列表
 */
const cleanerPlugins: CleanerPlugin[] = [
	anchorCleaner,
	dimensionCleaner,
	prettierFormatter,
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
				consola.debug(`应用 ${plugin.name} 到文件: ${filePath}`);
				const originalLength = content.length;
				content = await plugin.clean(content);
				const newLength = content.length;

				if (originalLength !== newLength) {
					consola.info(`${plugin.name}处理后，文件长度从 ${originalLength} 变为 ${newLength}`);
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
