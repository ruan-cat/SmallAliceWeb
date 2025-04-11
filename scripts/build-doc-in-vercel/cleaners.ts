import fs from "fs";
import { consola } from "consola";
import prettier from "prettier";
import { htmlStandardTags } from "./utils";

/**
 * 清理插件接口
 */
interface CleanerPlugin {
	name: string;
	clean: (content: string, filePath?: string) => string | Promise<string>;
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
 * 处理非闭合标签脏数据
 * 将形如 <XXX> 的内容替换为代码块 `<XXX>`
 */
const unclosedTagCleaner: CleanerPlugin = {
	name: "非闭合标签清理器",
	clean: (content: string) => {
		// 创建一个排除HTML标准标签的正则表达式部分
		const htmlTagsPattern = htmlStandardTags.join("|");

		// 匹配形如 <XXX> 的各种非闭合标签，但排除以下情况:
		// 1. 已经在代码块中的标签 (通过负向前瞻和负向后瞻)
		// 2. HTML标准标签 (通过负向前瞻)
		// 3. 闭合标签 </xxx> (通过排除斜杠开头)
		// 4. 自闭合标签 <xxx/> (通过排除斜杠结尾)
		// 5. 带属性的标签 <xxx attr="value"> (通过排除包含空格的情况)
		const tagRegex = new RegExp(
			`(?<![\`\\w])<(?!\\/|(?:${htmlTagsPattern})\\b)([^<>\\s\\/]*?(?:\\:[^<>\\s\\/]*?)*)>(?![\`\\w])`,
			"g",
		);

		let replacedContent = content;
		let matches = 0;
		const matchedTags = new Set<string>();

		// 替换为代码块格式
		replacedContent = replacedContent.replace(tagRegex, (match) => {
			matches++;
			matchedTags.add(match);
			return `\`${match}\``;
		});

		if (matches > 0) {
			consola.info(`替换了 ${matches} 个非闭合标签为代码块: ${Array.from(matchedTags).join(", ")}`);
		}

		return replacedContent;
	},
};

/**
 * 处理`@type struct<XXX>`格式的脏数据
 * 将这种格式的文本转换为代码块
 */
const structTypeCleaner: CleanerPlugin = {
	name: "@type struct清理器",
	clean: (content: string) => {
		// 匹配@type struct<XXX>格式，但排除已经在代码块中的文本
		const structTypeRegex = /(?<!`)([@]type\s+struct<[^>]*>)(?!`)/g;

		let replacedContent = content;
		let matches = 0;
		const matchedTypes = new Set<string>();

		// 替换为代码块格式
		replacedContent = replacedContent.replace(structTypeRegex, (match) => {
			matches++;
			matchedTypes.add(match);
			return `\`${match}\``;
		});

		if (matches > 0) {
			consola.info(`替换了 ${matches} 个@type struct<XXX>为代码块: ${Array.from(matchedTypes).join(", ")}`);
		}

		return replacedContent;
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
 * 处理包含冒号的 `：**` 格式脏数据
 * 在匹配到的文本后添加一个空格
 */
const colonStarCleaner: CleanerPlugin = {
	name: "冒号星号清理器",
	clean: (content: string) => {
		// 匹配：**格式的文本
		const colonStarRegex = /：\*\*/g;

		let replacedContent = content;
		let matches = 0;

		// 替换为带空格的格式
		replacedContent = replacedContent.replace(colonStarRegex, (match) => {
			matches++;
			return `${match} `;
		});

		if (matches > 0) {
			consola.info(`在 ${matches} 处添加了空格`);
		}

		return replacedContent;
	},
};

/**
 * 处理 `**小结\*\*` 格式的脏数据
 * 直接删除匹配到的文本
 */
const summaryStarCleaner: CleanerPlugin = {
	name: "小结星号清理器",
	clean: (content: string) => {
		// 匹配**小结\*\*格式的文本
		const summaryStarRegex = /\*\*小结\\\*\\\*/g;

		let replacedContent = content;
		let matches = 0;

		// 直接删除匹配到的文本
		replacedContent = replacedContent.replace(summaryStarRegex, () => {
			matches++;
			return "";
		});

		if (matches > 0) {
			consola.info(`删除了 ${matches} 处小结格式文本`);
		}

		return replacedContent;
	},
};

/**
 * 删除`## 概述`文本
 */
const removeOverviewCleaner: CleanerPlugin = {
	name: "概述删除器",
	clean: (content: string) => {
		// 匹配"## 概述"文本，包括可能的换行符
		const overviewRegex = /##\s*概述\s*\n?/g;

		let replacedContent = content;
		let matches = 0;

		// 直接删除匹配到的文本
		replacedContent = replacedContent.replace(overviewRegex, () => {
			matches++;
			return "";
		});

		if (matches > 0) {
			consola.info(`删除了 ${matches} 处"## 概述"文本`);
		}

		return replacedContent;
	},
};

/**
 * 调整标题层级，删除多余的`#`号
 * 不删减二级标题，只处理三级及以上的标题
 */
const adjustHeadingLevelCleaner: CleanerPlugin = {
	name: "标题层级调整器",
	clean: (content: string) => {
		// 首先检查是否已经有一级标题
		const hasH1 = /^#\s+[^#\n]+$/m.test(content);

		if (hasH1) {
			consola.info("文档已有一级标题，无需调整标题层级");
			return content;
		}

		// 匹配所有三级及以上的markdown标题行（不处理二级标题）
		const headingRegex = /^(#{3,})\s+(.+)$/gm;

		let replacedContent = content;
		let matches = 0;

		// 将每个标题的层级提升一级（删除一个#号）
		replacedContent = replacedContent.replace(headingRegex, (match, hashes, title) => {
			matches++;
			return `${hashes.slice(1)} ${title}`;
		});

		if (matches > 0) {
			consola.info(`调整了 ${matches} 处标题层级（不包括二级标题）`);
		}

		return replacedContent;
	},
};

/**
 * 根据文件名增加一级标题
 */
const addH1FromFilenameCleaner: CleanerPlugin = {
	name: "一级标题添加器",
	clean: (content: string, filePath?: string) => {
		if (!filePath) {
			consola.warn("未提供文件路径，无法添加一级标题");
			return content;
		}

		// 检查是否已经有一级标题
		const hasH1 = /^#\s+[^#\n]+$/m.test(content);

		if (hasH1) {
			consola.info("文档已有一级标题，无需添加");
			return content;
		}

		// 处理文件路径中的分隔符，兼容Windows和Unix风格
		const normalizedPath = filePath.replace(/\\/g, "/");

		// 从文件路径中提取文件名（不含扩展名）
		const filename =
			normalizedPath
				.split("/")
				.pop()
				?.replace(/\.[^/.]+$/, "") || "";

		consola.debug(`从路径 ${filePath} 提取出文件名: ${filename}`);

		// 在文件开头添加一级标题
		const newContent = `# ${filename}\n\n${content}`;
		consola.info(`已添加一级标题: # ${filename}`);

		return newContent;
	},
};

/**
 * 生成文档跳转链接
 * 将 "${目录名} > ${文件名}.docx" 格式的文本转换为 markdown 链接
 */
const docLinkGenerator: CleanerPlugin = {
	name: "文档链接生成器",
	clean: (content: string) => {
		// 匹配 "目录名 > 文件名.docx" 格式的文本
		// 目录名通常是形如 "0.基本定义"、"1.系统"、"21.管理器" 等
		const docLinkRegex = /(\d+\.[^>]+)\s*>\s*([^.]+)\.docx/g;

		let replacedContent = content;
		let matches = 0;
		const matchedLinks = new Set<string>();

		// 替换为 markdown 链接格式
		replacedContent = replacedContent.replace(docLinkRegex, (match, dirName, fileName) => {
			matches++;
			matchedLinks.add(match);

			// 去除目录名和文件名前后可能的空格
			const trimmedDirName = dirName.trim();
			const trimmedFileName = fileName.trim();

			// 构建链接
			return `[\`${trimmedDirName} > ${trimmedFileName}.docx\`](/docx/插件详细手册/${trimmedDirName}/${trimmedFileName}.md)`;
		});

		if (matches > 0) {
			consola.info(
				`生成了 ${matches} 个文档跳转链接: ${Array.from(matchedLinks).slice(0, 3).join(", ")}${matches > 3 ? "..." : ""}`,
			);
		}

		return replacedContent;
	},
};

/**
 * 清理器插件列表
 */
const cleanerPlugins: CleanerPlugin[] = [
	removeOverviewCleaner, // 最先删除"## 概述"文本
	adjustHeadingLevelCleaner, // 然后调整标题层级
	addH1FromFilenameCleaner, // 最后添加一级标题
	// anchorCleaner,
	// dimensionCleaner,
	unclosedTagCleaner,
	structTypeCleaner,
	summaryStarCleaner,
	colonStarCleaner,
	docLinkGenerator, // 新增文档链接生成器
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
				// 传入文件路径作为第二个参数，供需要使用文件名的清理器使用
				content = await plugin.clean(content, filePath);
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
