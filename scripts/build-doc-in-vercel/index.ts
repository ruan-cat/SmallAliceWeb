import fs from "fs";
import path from "path";
import { sync } from "glob";
import { consola } from "consola";
import gradient from "gradient-string";
import { spawnSync } from "child_process";
import { fileTransformers } from "./transformers";
import { cleanMdFiles } from "./cleaners";
import { generateSimpleAsyncTask } from "./utils";

/**
 * 配置对象，用于控制任务执行
 */
interface BuildConfig {
	isSkipClone: boolean;
	isSkipTransform: boolean;
	isSkipClean: boolean;
	ignoredFolders: string[]; // 忽略的文件夹列表
}

// 默认配置
const defaultConfig: BuildConfig = {
	isSkipClone: true,
	isSkipTransform: false,
	isSkipClean: false,
	ignoredFolders: ["drill-docx/node_modules", "drill-docx/.git"], // 默认忽略的文件夹
};

/**
 * 生成简单的执行命令函数
 * @description
 * 封装 spawnSync 函数
 */
function generateSpawn(execaSimpleParams: { command: string; parameters: string[] }) {
	const { command, parameters } = execaSimpleParams;
	const coloredCommand = gradient(["rgb(0, 153, 247)", "rgb(241, 23, 18)"])(`${command} ${parameters.join(" ")}`);
	consola.info(` 当前运行的命令为： ${coloredCommand} \n`);
	return generateSimpleAsyncTask(() => {
		const result = spawnSync(command, parameters, {
			stdio: "inherit",
			shell: true,
		});
		if (result.error) {
			throw result.error;
		}
		return result;
	});
}

/**
 * 克隆GitHub仓库
 */
async function cloneRepository() {
	const repoUrl = "https://github.com/ruan-cat/drill-docx";
	const targetDir = "drill-docx";

	// 检查目标目录是否已存在
	if (fs.existsSync(targetDir)) {
		consola.info(`目标目录 ${targetDir} 已存在，清除目录...`);
		fs.rmSync(targetDir, { recursive: true, force: true });
	}

	consola.info(`开始克隆仓库 ${repoUrl} 到 ${targetDir}...`);
	await generateSpawn({
		command: "git",
		parameters: ["clone", "--depth=1", repoUrl, targetDir],
	});
	consola.success(`仓库克隆完成`);
}

/**
 * 确保输出目录存在并清空
 * @description
 * 检查目录是否存在，如不存在则创建。
 * 如果目录已存在，则清空目录内容并重新创建
 */
function ensureOutputDirectoryExists() {
	const outputDir = path.join("docs", "docx");

	// 如果目录存在，先清空它
	if (fs.existsSync(outputDir)) {
		consola.info(`输出目录 ${outputDir} 已存在，清空目录...`);
		// 删除整个目录及其内容
		fs.rmSync(outputDir, { recursive: true, force: true });
	}

	// 重新创建目录
	consola.info(`创建输出目录: ${outputDir}`);
	fs.mkdirSync(outputDir, { recursive: true });

	return outputDir;
}

/**
 * 检查文件是否在忽略的文件夹内
 * @param filePath 文件路径
 * @param ignoredFolders 忽略的文件夹列表
 * @returns 如果文件在忽略的文件夹内，则返回true
 */
function isInIgnoredFolder(filePath: string, ignoredFolders: string[]): boolean {
	const normalizedPath = path.normalize(filePath);

	for (const folder of ignoredFolders) {
		const normalizedFolder = path.normalize(folder);
		// 检查文件路径是否以某个忽略文件夹开头
		if (normalizedPath.startsWith(normalizedFolder + path.sep) || normalizedPath === normalizedFolder) {
			return true;
		}
	}

	return false;
}

/**
 * 主函数：按顺序执行所有任务
 */
async function main(config: BuildConfig = defaultConfig) {
	// 收集错误文件
	const errorFiles: string[] = [];

	try {
		// 确保输出目录存在且为空
		consola.info("=== 准备输出目录 ===");
		const outputDir = ensureOutputDirectoryExists();

		// 1. 克隆仓库阶段
		if (!config.isSkipClone) {
			consola.info("=== 开始文件获取阶段 ===");
			await cloneRepository();
		} else {
			consola.info("跳过文件获取阶段");
		}

		// 2. 格式转换阶段
		if (!config.isSkipTransform) {
			consola.info("=== 开始格式转换阶段 ===");

			// 查找所有txt和docx/doc文件
			let txtFiles = sync("drill-docx/**/*.txt");
			let docxFiles = sync("drill-docx/**/*.{doc,docx}").filter((file) => !path.basename(file).startsWith("~$")); // 过滤掉临时文件

			// 过滤掉忽略文件夹中的文件
			if (config.ignoredFolders && config.ignoredFolders.length > 0) {
				const originalTxtCount = txtFiles.length;
				const originalDocxCount = docxFiles.length;

				txtFiles = txtFiles.filter((file) => !isInIgnoredFolder(file, config.ignoredFolders));
				docxFiles = docxFiles.filter((file) => !isInIgnoredFolder(file, config.ignoredFolders));

				const ignoredTxtCount = originalTxtCount - txtFiles.length;
				const ignoredDocxCount = originalDocxCount - docxFiles.length;

				if (ignoredTxtCount > 0 || ignoredDocxCount > 0) {
					consola.info(`忽略了 ${ignoredTxtCount} 个TXT文件和 ${ignoredDocxCount} 个DOCX/DOC文件（位于忽略文件夹内）`);
				}
			}

			consola.info(`找到 ${txtFiles.length} 个待处理的TXT文件和 ${docxFiles.length} 个待处理的DOCX/DOC文件`);

			// 处理 TXT 文件
			const txtErrors = await fileTransformers.processTxtFiles(txtFiles, outputDir);
			errorFiles.push(...txtErrors);

			// 处理 DOCX/DOC 文件
			const docxErrors = await fileTransformers.processDocxFiles(docxFiles, outputDir);
			errorFiles.push(...docxErrors);
		} else {
			consola.info("跳过格式转换阶段");
		}

		// 3. 脏数据处理阶段
		if (!config.isSkipClean) {
			consola.info("=== 开始脏数据处理阶段 ===");
			const mdFiles = sync("docs/docx/**/*.md");
			consola.info(`找到 ${mdFiles.length} 个需要清理的 MD 文件`);

			const cleanErrors = await cleanMdFiles(mdFiles);
			errorFiles.push(...cleanErrors);
		} else {
			consola.info("跳过脏数据处理阶段");
		}

		// 输出处理报告
		consola.success(`文档构建完成`);
		if (errorFiles.length > 0) {
			consola.warn(`处理过程中发现 ${errorFiles.length} 个错误文件:`);
			errorFiles.forEach((file) => consola.error(` - ${file}`));
		} else {
			consola.success(`所有文件处理成功`);
		}
	} catch (error) {
		consola.error(`处理过程中发生错误: ${error.message}`);
		process.exit(1);
	}
}

// 执行主函数
main();

export { main, BuildConfig };
