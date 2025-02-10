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

/** 准备dist目录任务 */
function prepareDistTask() {
	return generateSimpleAsyncTask(prepareDist);
}

/** 克隆任务 */
function cloneDrillDocxRepoTask() {
	return generateSimpleAsyncTask(cloneDrillDocxRepo);
}

executePromiseTasks({
	type: "queue",
	tasks: [prepareDistTask(), cloneDrillDocxRepoTask()],
});
