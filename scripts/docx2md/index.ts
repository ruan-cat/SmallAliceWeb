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
import { convertToHtml, images } from "mammoth";
import sharp from "sharp";
import { type FormatEnum } from "sharp";
import htmlToMd from "html-to-md";

import { concat, isEmpty, isUndefined } from "lodash-es";
import {
	isConditionsEvery,
	isConditionsSome,
	generateSimpleAsyncTask,
	definePromiseTasks,
	executePromiseTasks,
	pathChange,
	type TasksConfig,
	type Task,
} from "@ruan-cat/utils";

import { catalog } from "./catalog";
import { prepareDist } from "./prepare-dist";

/** 全部 txt 和 doc 文件的地址 */
const txtAndDocxFilesPath: string[] = [];

/** 全部 html 文件的地址 */
const htmlFilesPath: string[] = [];

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
		txtAndDocxFilesPath.push(...files);
		console.log(txtAndDocxFilesPath);

		consola.success(` 完成查询全部文件任务 `);
	});
}

/** 文件变更函数的参数 */
interface FileChangeParams {
	/** 文件地址 */
	filePath: string;

	/** 文件处理失败的数组 */
	errorFilesPath: string[];
}

/**
 * 执行文件变更操作的函数
 * @description
 * 要求是一个异步函数
 */
type FileChange = (params: FileChangeParams) => Promise<void>;

interface DoChangeParams {
	/**
	 * 文件地址
	 * @description 默认传值为全部的文件地址
	 * @default txtAndDocxFilesPath
	 */
	filesPath?: string[];

	onChange: FileChange;

	/** 打印文件处理失败的数组 */
	printError?(errorFilesPath: string[]): void;
}

/** 默认的错误打印函数 */
const defPrintError: DoChangeParams["printError"] = function (errorFilesPath) {
	if (errorFilesPath.length > 0) {
		consola.error(` 文件转换失败的文件路径： `);
		console.log(errorFilesPath);
	} else {
		consola.success(` 全部文件转换成功 `);
	}
};

/**
 * 执行文件转换任务
 * @description
 * 该任务不执行具体的任务细节，是一个包装函数，用于包装具体的文件转换任务。
 * 会分批次地生成文件转换任务，相当于一个异步任务调度器
 */
async function doChange(params: DoChangeParams) {
	const {
		onChange,
		filesPath = txtAndDocxFilesPath,
		printError = defPrintError,
	} = params;

	/** 预期被回调函数修改的数组 */
	const errorFilesPath: FileChangeParams["errorFilesPath"] = [];

	/** 全部的串行任务 */
	const tasks: Task[] = [];

	/** 批次 */
	const BATCH_SIZE = 15;

	// 生成全部的串行任务
	for (let i = 0; i < filesPath.length; i += BATCH_SIZE) {
		const batch = filesPath.slice(i, i + BATCH_SIZE);

		/** 一个并发任务 */
		const task: TasksConfig = {
			type: "parallel",
			tasks: [],
		};

		// 按照批次 逐个组装生成一个批次的并发任务
		task.tasks = batch.map((filePath) =>
			generateSimpleAsyncTask(async () => {
				await onChange({ filePath, errorFilesPath });
			})
		);

		// 一个批次的任务加入到串行任务内
		tasks.push(task);
	}

	await executePromiseTasks({ type: "queue", tasks });

	// 打印错误
	printError?.(errorFilesPath);
}

/**
 * 将路径内全部的docx转换成html文件
 * @description
 * 1. 根据形参 filesPath 路径数组，将路径内全部的docx文件，根据文件路径，转换成html文件。形参 filesPath 的实参预期为 txtAndDocxFilesPath 。
 * 2. 转换的html文件存储在docx附近，不需要移动到其他位置。和docx保持同样的文件夹目录即可。
 * 3. 使用 convertToHtml 函数完成转换。
 *
 * @see https://github.com/mwilliamson/mammoth.js/blob/master/README.md#image-converters
 *
 * TODO: 未来可以试着改成上传文件的方式 上传图片到服务器上面
 * @see https://selenamona.github.io/project/2020/07/13/deal-word/
 */
const docx2html: FileChange = async function (params) {
	const { filePath } = params;
	if (filePath.endsWith(".docx")) {
		try {
			const fileBuffer = fs.readFileSync(filePath);

			const imagesDir = join(dirname(filePath), "images");

			if (existsSync(imagesDir)) {
				rmSync(imagesDir, { recursive: true, force: true });
			}
			mkdir(imagesDir, { recursive: true }, (err) => {
				if (err) throw err;
			});

			const result = await convertToHtml(
				{ buffer: fileBuffer },
				{
					convertImage: images.imgElement(async function (image) {
						const imageBuffer = await image.readAsBase64String();
						/**
						 * 图片格式
						 * @description
						 * 其返回格式类似于 image/x-emf ，所以这里要做数组切割 取第二个元素
						 */
						const imageType = image.contentType.split("/")[1];
						const imageName = `${Date.now()}-${Math.random()
							.toString(36)
							.substring(7)}.png`;
						const imagePath = join(imagesDir, imageName);

						// jpeg 格式没有错
						// 如果是 x-emf 格式的图片 即矢量图
						// FIXME: 尝试用 rust 调用 C++ 库，实现 emf 转 png。未来再说。
						if (imageType === "x-emf") {
							// base64格式的图片 也不行。不能显示出来内容。
							// return {
							// 	src: "data:" + image.contentType + ";base64," + imageBuffer,
							// };
							consola.warn(
								` 目前无法处理 ${imageType} 格式的图片。默认放弃。 `
							);
						}

						// Use sharp to compress the image
						await sharp(Buffer.from(imageBuffer, "base64"))
							.toFormat("png")
							.toFile(imagePath)
							.catch((error) => {
								consola.error(`Failed to process image: ${error.message}`);
								consola.error(` 错误的文件格式为： ${imageType} `);
								params.errorFilesPath.push(`${filePath}   ${imageType} `);
							});
						// .then((outputBuffer) => {
						// 	fs.writeFileSync(imagePath, outputBuffer);
						// });
						return {
							src: `./images/${imageName}`,
						};
					}),
				}
			);

			const htmlFilePath = filePath.replace(/\.docx$/, ".html");
			fs.writeFileSync(htmlFilePath, result.value);
			consola.success(`Converted ${filePath} to HTML.`);
			htmlFilesPath.push(htmlFilePath);
		} catch (error) {
			consola.error(`Failed to convert ${filePath}: ${error.message}`);
			// 写入数组的过程不使用解构赋值 因为需要直接修改原数组
			params.errorFilesPath.push(filePath);
		}
	}
};

/**
 * 将全部docx转换成html文件的任务
 */
function docx2htmlTask() {
	return generateSimpleAsyncTask(async () => {
		consola.start(` 开始docx转换为html的任务 `);
		await doChange({ onChange: docx2html });
		consola.success(` 完成docx转换为html的任务 `);
	});
}

/**
 * 将全部html转换成md文件
 * @description
 * 1. 使用库提供的 htmlToMd 函数实现md文件转换。
 * 2. 生成的md文件就在html文件附近，保持在同文件夹内。
 * 3. 该函数满足类型 FileChange 。
 * 4. 写法格式模仿已有的 docx2html 函数。
 */
const html2md: FileChange = async function (params) {
	const { filePath } = params;
	if (filePath.endsWith(".html")) {
		try {
			const htmlContent = fs.readFileSync(filePath, "utf-8");
			const mdContent = htmlToMd(htmlContent);

			const mdFilePath = filePath.replace(/\.html$/, ".md");
			fs.writeFileSync(mdFilePath, mdContent);
			consola.success(`Converted ${filePath} to Markdown.`);
		} catch (error) {
			consola.error(`Failed to convert ${filePath}: ${error.message}`);
			params.errorFilesPath.push(filePath);
		}
	}
};

/**
 * 将全部html转换成md文件的任务
 */
function html2mdTask() {
	return generateSimpleAsyncTask(async () => {
		consola.start(` 开始html转换为md的任务 `);
		await doChange({ onChange: html2md, filesPath: htmlFilesPath });
		consola.success(` 完成html转换为md的任务 `);
	});
}

/**
 * 将全部txt转换成md文件
 * @description
 * 1. 根据形参 filesPath 路径数组，将路径内全部的txt文件，根据文件路径，转换成md文件。形参 filesPath 的实参预期为 txtAndDocxFilesPath 。
 * 2. 转换的md文件存储在txt附近，不需要移动到其他位置。和txt保持同样的文件夹目录即可。
 * 3. txt 文件都默认不包含有意义的标题。请根据txt的文件名，写入md的一级标题。
 * 4. txt文本文件的文本段，中间缺乏换行符。请在转化的时候添加换行符。
 */
const txt2md: FileChange = async function (params) {
	const { filePath } = params;
	if (filePath.endsWith(".txt")) {
		try {
			const txtContent = fs.readFileSync(filePath, "utf-8");
			const fileName =
				filePath
					.split("/")
					.pop()
					?.replace(/\.txt$/, "") || "Untitled";
			const mdContent = `# ${fileName}\n\n${txtContent.replace(
				/(.{80})/g,
				"$1\n"
			)}`;

			const mdFilePath = filePath.replace(/\.txt$/, ".md");
			fs.writeFileSync(mdFilePath, mdContent);
			consola.success(`Converted ${filePath} to Markdown.`);
		} catch (error) {
			consola.error(`Failed to convert ${filePath}: ${error.message}`);
			params.errorFilesPath.push(filePath);
		}
	}
};

/**
 * 将全部txt转换成md文件的任务
 */
function txt2mdTask() {
	return generateSimpleAsyncTask(async () => {
		consola.start(` 开始txt转换为md的任务 `);
		await doChange({ onChange: txt2md });
		consola.success(` 完成txt转换为md的任务 `);
	});
}

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

		{
			type: "parallel",
			tasks: [
				txt2mdTask(),
				{
					type: "queue",
					tasks: [docx2htmlTask(), html2mdTask()],
				},
			],
		},
	],
});
