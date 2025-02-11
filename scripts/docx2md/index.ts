import { dirname, resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs, {
	// 文件是否存在
	existsSync,
	// 复制文件
	copyFileSync,
	// 复制目录
	cpSync,
	// 删除目录
	rmSync,
	// 新建文件夹
	mkdir,
} from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import degit from "degit";
import { consola } from "consola";
import gradient from "gradient-string";
import { sync } from "glob";
import { convertToHtml } from "mammoth";
import { concat, isEmpty, isUndefined } from "lodash-es";
import {
	isConditionsEvery,
	isConditionsSome,
	generateSimpleAsyncTask,
	definePromiseTasks,
	executePromiseTasks,
} from "@ruan-cat/utils";

import { catalog } from "./catalog";
import { prepareDist } from "./prepare-dist";

/** 全部 txt 和 doc 文件的地址 */
const allFiles: string[] = [];

/**
 * docx2html 转换失败的文件路径
 */
const docx2htmlErrorPaths: string[] = [];

/**
 * 路径转换工具
 */
function pathChange(path: string) {
	return path.replace(/\\/g, "/");
}

/**
 * 生成简单的执行命令函数
 * @description
 * 封装 spawnSync 函数
 */
function generateSpawn(execaSimpleParams: {
	command: string;
	parameters: string[];
}) {
	const { command, parameters } = execaSimpleParams;

	const coloredCommand = gradient(["rgb(0, 153, 247)", "rgb(241, 23, 18)"])(
		`${command} ${parameters.join(" ")}`
	);
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
 * 用degit克隆钻头的docx文档仓库
 * @deprecated
 */
async function cloneDrillDocxRepo() {
	const emitter = degit("ruan-cat/drill-docx", {
		cache: false,
		force: true,
		verbose: true,
	});

	const dest = resolve(process.cwd(), catalog.drillDocx);

	try {
		await emitter.clone(dest);
		consola.success(`Successfully cloned to ${dest}`);
	} catch (error) {
		consola.error(`Failed to clone repository: ${error.message}`);
	}
}

/**
 * 用 git clone 命令克隆钻头的docx文档仓库
 * @description
 * 1. 用 git clone --depth=1 https://github.com/ruan-cat/drill-docx 命令，实现克隆项目
 * 2. 克隆到 catalog.drillDocx 目录内
 * 3. 用 generateSpawn 函数包装运行命令
 */
function cloneDrillDocxRepoWithGitTask() {
	const command = "git";
	const parameters = [
		"clone",
		"--depth=1",
		"https://github.com/ruan-cat/drill-docx",
		catalog.drillDocx,
	];
	return generateSpawn({ command, parameters });
}

/**
 * 获取全部文件的路径
 * @description
 * 1. 使用glob库，扫描 catalog.drillDocx 目录内全部的后缀为 .docx 和 .txt 的文件。
 * 2. 并将这些文件的文件路径都记录到一个数组内
 * 3. 该函数返回路径数组
 */
function getFilesPath() {
	const matchedPath = pathChange(
		join(process.cwd(), catalog.drillDocx, "**/*.{docx,txt}")
	);
	return new Promise<string[]>((resolve, reject) => {
		const files = sync(matchedPath);
		if (isEmpty(files)) {
			reject(new Error("No files found"));
		}
		resolve(files);
	});
}

/**
 * 获取全部文件路径的任务
 * @description
 */
function getFilesPathTask() {
	return generateSimpleAsyncTask(async () => {
		consola.start(` 开始查询全部文件任务 `);

		const files = await getFilesPath();
		allFiles.push(...files);
		console.log(allFiles);

		consola.success(` 完成查询全部文件任务 `);
	});
}

/**
 * 将路径内全部的docx转换成html文件
 * @description
 * 1. 根据形参 filesPath 路径数组，将路径内全部的docx文件，根据文件路径，转换成html文件。形参 filesPath 的实参预期为 allFiles 。
 * 2. 转换的html文件存储在docx附近，不需要移动到其他位置。和docx保持同样的文件夹目录即可。
 * 3. 使用 convertToHtml 函数完成转换。
 */
async function docx2html(filesPath: string[]) {
	const BATCH_SIZE = 15;

	for (let i = 0; i < filesPath.length; i += BATCH_SIZE) {
		const batch = filesPath.slice(i, i + BATCH_SIZE);

		const tasks = batch.map((filePath) =>
			generateSimpleAsyncTask(async () => {
				if (filePath.endsWith(".docx")) {
					try {
						const fileBuffer = fs.readFileSync(filePath);
						const result = await convertToHtml({ buffer: fileBuffer });
						const htmlFilePath = filePath.replace(/\.docx$/, ".html");
						fs.writeFileSync(htmlFilePath, result.value);
						consola.success(`Converted ${filePath} to HTML.`);
					} catch (error) {
						consola.error(`Failed to convert ${filePath}: ${error.message}`);
						docx2htmlErrorPaths.push(filePath);
					}
				}
			})
		);

		await executePromiseTasks({ type: "queue", tasks });
	}

	if (docx2htmlErrorPaths.length > 0) {
		consola.error("Conversion errors occurred for the following files:");
		console.log(docx2htmlErrorPaths);
	} else {
		consola.success("All files converted successfully.");
	}
}

/**
 * 将全部docx转换成html文件的任务
 */
function docx2htmlTask() {
	return generateSimpleAsyncTask(async () => {
		consola.start(` 开始docx转换为html的任务 `);
		await docx2html(allFiles);
		consola.success(` 完成docx转换为html的任务 `);
	});
}

function txt2md() {}

/** 准备dist目录任务 */
function prepareDistTask() {
	return generateSimpleAsyncTask(prepareDist);
}

/**
 * 克隆任务
 * @deprecated
 */
function cloneDrillDocxRepoTask() {
	return generateSimpleAsyncTask(cloneDrillDocxRepo);
}

executePromiseTasks({
	type: "queue",
	tasks: [
		// 先跳过这两个任务 先模拟已经完成克隆的场景
		// prepareDistTask(),
		// cloneDrillDocxRepoWithGitTask(),
		getFilesPathTask(),
		docx2htmlTask(),
	],
});
