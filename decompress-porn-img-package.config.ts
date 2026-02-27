import { defineConfig } from "@ruan-cat/decompress-porn-img-package";

export default defineConfig({
	password: "https://www.91xiezhen.top",
	dirtyFiles: ["孔雀海"],
	isPureDecompress: true,
	isDecompressMixedNamedPackages: false,
	isDeletePackages: false,
	isMoveFilesToRoot: true,
	isRenameRootFolder: true,
	/**
	 * 要处理的文件夹/文件编号范围
	 * 不配置时处理目录下全部压缩包（原始行为）
	 * 配置后仅处理指定范围内的编号，并智能识别处理阶段：
	 * - 编号对应压缩包 → 解压流程
	 * - 编号对应文件夹 → 整理文件夹目录层级流程
	 */
	folderRange: { start: 213, end: 220 },
});
