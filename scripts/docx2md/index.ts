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
import { globSync } from "glob";
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
 * 1.
 */
// function getFliesPath() {}

function getFilesPath() {
	const pattern = join(catalog.drillDocx, "**/*.{docx,txt}");
	return new Promise<string[]>((resolve, reject) => {
		const files = globSync(pattern);
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

		consola.success(` 完成查询全部文件任务 `);
	});
}

function docx2html() {}

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
	],
});
