import fs from "fs";
import path from "path";
import { consola } from "consola";
import { convertToHtml, images } from "mammoth";
import sharp from "sharp";
import htmlToMd from "html-to-md";
import { FormatEnum } from "sharp";
import { ensureTargetDirectoryExists, createTargetFilePath, errorImgUrl } from "./utils";

// 记录已处理的图片类型
const imageTypesSet = new Set<string>();

// 文件处理接口
interface FileProcessorParams {
	filePath: string;
	errorFilesPath: string[];
}

type FileChange = (params: FileProcessorParams) => Promise<void>;

/**
 * 处理TXT文件
 * @param txtFiles TXT文件路径数组
 * @param outputDir 输出目录
 */
async function processTxtFiles(txtFiles: string[], outputDir: string): Promise<string[]> {
	const errorFiles: string[] = [];
	const sourceBaseDir = "drill-docx/";

	for (const filePath of txtFiles) {
		try {
			consola.info(`处理TXT文件: ${filePath}`);

			// 读取TXT文件内容
			const content = fs.readFileSync(filePath, "utf-8");

			// 从文件名获取标题
			const fileName = path.basename(filePath, ".txt");

			// 创建Markdown内容，添加一级标题和换行符
			const mdContent = `# ${fileName}\n\n${formatTxtContent(content)}`;

			// 创建目标文件路径
			const targetFilePath = createTargetFilePath(filePath, sourceBaseDir, outputDir, "md");

			// 确保目标目录存在
			await ensureTargetDirectoryExists(targetFilePath);

			// 写入MD文件
			fs.writeFileSync(targetFilePath, mdContent);

			consola.success(`已转换 ${filePath} -> ${targetFilePath}`);
		} catch (error) {
			consola.error(`处理 ${filePath} 失败: ${error.message}`);
			errorFiles.push(filePath);
		}
	}

	return errorFiles;
}

/**
 * 格式化TXT内容，添加适当的换行符
 */
function formatTxtContent(content: string): string {
	// 分割内容为段落并添加换行符
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line) // 过滤空行
		.join("\n\n");
}

/**
 * 处理DOCX/DOC文件
 * @param docxFiles DOCX/DOC文件路径数组
 * @param outputDir 输出目录
 */
async function processDocxFiles(docxFiles: string[], outputDir: string): Promise<string[]> {
	const errorFiles: string[] = [];
	const htmlFilesPath: string[] = [];
	const sourceBaseDir = "drill-docx/";

	// 第一步: 转换DOCX为HTML
	for (const filePath of docxFiles) {
		await docx2html({
			filePath,
			errorFilesPath: errorFiles,
			htmlFilesPath,
			outputDir,
		});
	}

	// 第二步: 转换HTML为MD
	for (const htmlFilePath of htmlFilesPath) {
		await html2md({
			filePath: htmlFilePath,
			errorFilesPath: errorFiles,
			outputDir,
		});
	}

	// 第三步: 清理HTML文件
	for (const htmlFilePath of htmlFilesPath) {
		try {
			fs.unlinkSync(htmlFilePath);
		} catch (error) {
			consola.warn(`无法删除HTML文件 ${htmlFilePath}: ${error.message}`);
		}
	}

	// 输出图片处理统计信息
	consola.info(`处理的图片类型: ${Array.from(imageTypesSet).join(", ") || "无"}`);

	return errorFiles;
}

/**
 * 清理文件名，移除无效字符，确保文件名安全
 * @param filename 原始文件名
 * @returns 清理后的安全文件名
 */
function sanitizeFilename(filename: string): string {
	// 移除非法字符，替换为下划线
	return filename
		.replace(/[<>:"/\\|?*\s]+/g, "_") // 替换Windows文件系统不允许的字符和空格
		.replace(/\.+$/, "") // 移除结尾的点
		.substring(0, 50); // 限制长度
}

/**
 * 从DOCX转换为HTML
 */
async function docx2html(params: {
	filePath: string;
	errorFilesPath: string[];
	htmlFilesPath: string[];
	outputDir: string;
}): Promise<void> {
	const { filePath, errorFilesPath, htmlFilesPath, outputDir } = params;

	// 跳过临时文件
	if (path.basename(filePath).startsWith("~$")) {
		consola.info(`跳过临时文件: ${filePath}`);
		return;
	}

	try {
		consola.info(`处理DOCX文件: ${filePath}`);

		const fileBuffer = fs.readFileSync(filePath);

		// 获取不带扩展名的文件名，用于生成图片名称
		const fileBaseName = path.basename(filePath, path.extname(filePath));
		const safeFileName = sanitizeFilename(fileBaseName);

		// 创建目标文件路径
		const sourceBaseDir = "drill-docx/";
		const targetHtmlPath = createTargetFilePath(filePath, sourceBaseDir, outputDir, "html");

		// 确保目标目录存在
		await ensureTargetDirectoryExists(targetHtmlPath);

		// 创建图片目录
		const imagesDir = path.join(path.dirname(targetHtmlPath), "images");
		if (fs.existsSync(imagesDir)) {
			fs.rmSync(imagesDir, { recursive: true, force: true });
		}
		fs.mkdirSync(imagesDir, { recursive: true });

		// 初始化图片计数器
		let imageCounter = 1;

		// 转换DOCX为HTML
		const result = await convertToHtml(
			{ buffer: fileBuffer },
			{
				convertImage: images.imgElement(async function (image) {
					try {
						const imageBuffer = await image.readAsBase64String();
						/**
						 * 图片格式
						 * @description
						 * 其返回格式类似于 image/x-emf ，所以这里要做数组切割 取第二个元素
						 */
						let contentType = image.contentType || "image/png";
						consola.debug(`处理图片，格式: ${contentType}`);

						// 确保contentType包含"/"，如果不含则默认为png
						if (!contentType.includes("/")) {
							consola.warn(`图片contentType格式异常: ${contentType}, 将使用默认值image/png`);
							contentType = "image/png";
						}

						const imageType = contentType.split("/")[1];

						// 生成图片名称：文件名-序号.扩展名
						// 使用三位数格式化序号，例如：001, 002, ...
						const paddedCounter = String(imageCounter).padStart(3, "0");
						let imageName = `${safeFileName}-${paddedCounter}.${imageType === "jpeg" ? "jpg" : imageType}`;

						// 递增图片计数器
						imageCounter++;

						const imagePath = path.join(imagesDir, imageName);

						// 处理特殊格式的图片
						const unsupportedFormats = ["x-emf", "gif", "wmf", "emf"];
						if (unsupportedFormats.includes(imageType)) {
							consola.warn(`跳过不支持的图片格式: ${imageType}，使用占位图片`);
							return {
								src: errorImgUrl,
							};
						}

						imageTypesSet.add(imageType);

						// 如果是图片数据为空，使用占位图片
						if (!imageBuffer || imageBuffer.length < 10) {
							consola.warn(`图片数据为空或太小: ${imageName}`);
							return {
								src: errorImgUrl,
							};
						}

						// 使用sharp压缩图片
						try {
							const imageData = Buffer.from(imageBuffer, "base64");

							// 根据不同图片类型做不同处理
							if (imageType === "png" || imageType === "jpeg" || imageType === "jpg") {
								await sharp(imageData)
									.toFormat(imageType === "jpg" ? "jpeg" : (imageType as keyof FormatEnum))
									.toFile(imagePath);
							} else {
								// 对于其他格式，尝试转换为png
								consola.info(`未明确支持的图片格式: ${imageType}，尝试转换为PNG`);

								// 更新扩展名为png
								imageName = imageName.replace(/\.[^.]+$/, ".png");
								const newImagePath = path.join(imagesDir, imageName);

								await sharp(imageData).toFormat("png").toFile(newImagePath);
							}

							consola.debug(`图片处理成功: ${imageName}`);
						} catch (error) {
							consola.error(`处理图片失败 [${imageName}]: ${error.message}`);
							consola.error(`错误的图片格式: ${imageType}`);

							// 记录错误但继续处理
							errorFilesPath.push(`${filePath} - 图片处理失败 [${imageType}]: ${error.message}`);

							return {
								src: errorImgUrl,
							};
						}

						// 返回相对路径的图片链接
						return {
							src: `./images/${imageName}`,
						};
					} catch (error) {
						consola.error(`图片转换过程中出错: ${error.message}`);
						return {
							src: errorImgUrl,
						};
					}
				}),
			},
		);

		// 写入HTML文件
		fs.writeFileSync(targetHtmlPath, result.value);
		htmlFilesPath.push(targetHtmlPath);

		consola.success(`已转换 ${filePath} -> ${targetHtmlPath} (处理了 ${imageCounter - 1} 个图片)`);
	} catch (error) {
		consola.error(`处理 ${filePath} 失败: ${error.message}`);
		errorFilesPath.push(filePath);
	}
}

/**
 * 从HTML转换为MD
 */
async function html2md(params: { filePath: string; errorFilesPath: string[]; outputDir: string }): Promise<void> {
	const { filePath, errorFilesPath } = params;

	try {
		consola.info(`将HTML转换为MD: ${filePath}`);

		// 读取HTML文件
		const htmlContent = fs.readFileSync(filePath, "utf-8");

		// 转换为MD
		const mdContent = htmlToMd(htmlContent);

		// 创建MD文件路径
		const mdFilePath = filePath.replace(/\.html$/, ".md");

		// 写入MD文件
		fs.writeFileSync(mdFilePath, mdContent);

		consola.success(`已转换 ${filePath} -> ${mdFilePath}`);
	} catch (error) {
		consola.error(`将HTML转换为MD失败 ${filePath}: ${error.message}`);
		errorFilesPath.push(filePath);
	}
}

export const fileTransformers = {
	processTxtFiles,
	processDocxFiles,
};
