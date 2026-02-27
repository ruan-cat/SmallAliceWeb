import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "c12";
import type { ToolConfig } from "./types.js";
import { logger } from "./file-utils.js";

/** 默认配置 */
export const DEFAULT_CONFIG: Required<Omit<ToolConfig, "folderRange">> & Pick<ToolConfig, "folderRange"> = {
	password: "https://www.91xiezhen.top",
	dirtyFiles: ["孔雀海"],
	isPureDecompress: true,
	isDecompressMixedNamedPackages: false,
	isDeletePackages: false,
	isMoveFilesToRoot: true,
	isRenameRootFolder: true,
	folderRange: undefined,
	decompressTimeout: 10000,
};

/** 已解析的完整配置类型（folderRange 仍然可选） */
export type ResolvedConfig = Required<Omit<ToolConfig, "folderRange">> & Pick<ToolConfig, "folderRange">;

/** 配置文件名称模式 */
const CONFIG_FILE_PATTERNS = [
	"decompress-porn-img-package.config.ts",
	"decompress-porn-img-package.config.js",
	"decompress-porn-img-package.config.mjs",
];

/**
 * 从指定目录开始，逐级向上搜索配置文件所在的目录
 * @param startDir - 起始搜索目录
 * @returns 配置文件所在的目录路径，未找到时返回 null
 */
async function findConfigDir(startDir: string): Promise<string | null> {
	let current = path.resolve(startDir);

	while (true) {
		for (const pattern of CONFIG_FILE_PATTERNS) {
			const candidate = path.join(current, pattern);
			try {
				await fs.access(candidate);
				return current;
			} catch {
				/** 文件不存在，继续检查 */
			}
		}

		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return null;
}

/** 加载工具配置（支持从 CWD 向上搜索配置文件） */
export async function loadToolConfig(): Promise<ResolvedConfig> {
	const configDir = await findConfigDir(process.cwd());

	if (configDir) {
		logger.info(`找到配置文件目录: ${configDir}`);
	} else {
		logger.warn("未找到配置文件，将使用默认配置");
	}

	const { config } = await loadConfig<ToolConfig>({
		name: "decompress-porn-img-package",
		defaults: DEFAULT_CONFIG,
		cwd: configDir ?? process.cwd(),
	});

	const resolved = { ...DEFAULT_CONFIG, ...(config ?? {}) };

	if (resolved.folderRange) {
		logger.info(`配置已加载: folderRange = ${resolved.folderRange.start} ~ ${resolved.folderRange.end}`);
	} else {
		logger.info("配置已加载: folderRange 未设置，将使用全量处理模式");
	}

	return resolved;
}
