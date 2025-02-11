import { dirname, resolve, join } from "node:path";

/** 各种目录地址 */
export const catalog = {
	/** dist目录地址 */
	dist: resolve(process.cwd(), "dist"),

	/** 钻头文档项目 docx文件地址 */
	drillDocx: resolve(process.cwd(), "dist/drill-docx"),

	/** 最终生成全部md文件的地址 */
	md: resolve(process.cwd(), "docs/docx"),
};
