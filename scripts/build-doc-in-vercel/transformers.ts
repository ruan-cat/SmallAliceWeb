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

	return errorFiles;
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

		// 转换DOCX为HTML
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
					const imageName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${imageType}`;
					const imagePath = path.join(imagesDir, imageName);

					// 如果是 x-emf 格式的图片 即矢量图
					// 暂时跳过gif的处理
					if (imageType === "x-emf" || imageType === "gif") {
						return {
							src: errorImgUrl,
						};
					}

					imageTypesSet.add(imageType);

					// 使用 sharp 压缩图片
					try {
						await sharp(Buffer.from(imageBuffer, "base64"))
							.toFormat(imageType as keyof FormatEnum)
							.toFile(imagePath);
					} catch (error) {
						consola.error(`处理图片失败: ${error.message}`);
						consola.error(` 错误的文件格式为： ${imageType} `);
						errorFilesPath.push(`${filePath}   ${imageType} `);
						return {
							src: errorImgUrl,
						};
					}

					return {
						src: `./images/${imageName}`,
					};
				}),
			},
		);

		// 写入HTML文件
		fs.writeFileSync(targetHtmlPath, result.value);
		htmlFilesPath.push(targetHtmlPath);

		consola.success(`已转换 ${filePath} -> ${targetHtmlPath}`);
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
