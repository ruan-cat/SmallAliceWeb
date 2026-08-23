/**
 * EMF/WMF 转 PNG 的 PoC CLI 脚本。
 *
 * 用 tsx 直接运行，验证 emf-converter + @napi-rs/canvas 的 Node 端转换链路。
 * 用法：pnpm exec tsx scripts/build-doc-in-vercel/emf/poc.ts <输入.emf> <输出.png>
 */
import { consola } from "consola";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { convertEmfToPng } from "./convert";

/**
 * CLI 主流程：读取输入文件 → 转换为 PNG → 确保输出目录存在 → 写出结果。
 */
async function main(): Promise<void> {
	const [inputPath, outputPath] = process.argv.slice(2);

	if (!inputPath || !outputPath) {
		consola.warn("用法: pnpm exec tsx scripts/build-doc-in-vercel/emf/poc.ts <输入.emf> <输出.png>");
		process.exit(1);
	}

	const inputBuffer = readFileSync(inputPath);
	const pngBuffer = await convertEmfToPng(inputBuffer);

	/** 确保输出目录存在，避免写出时因目录缺失失败 */
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, pngBuffer);

	consola.success(`转换完成: ${inputPath} -> ${outputPath}（${pngBuffer.length} 字节）`);
}

/** 顶层兜底：打印错误消息并以非零退出码结束 */
main().catch((error: unknown) => {
	consola.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
