import { loadConfig } from "c12";
import type { ToolConfig } from "./types.js";

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
};

/** 已解析的完整配置类型（folderRange 仍然可选） */
export type ResolvedConfig = Required<Omit<ToolConfig, "folderRange">> & Pick<ToolConfig, "folderRange">;

/** 加载工具配置 */
export async function loadToolConfig(): Promise<ResolvedConfig> {
	const { config } = await loadConfig<ToolConfig>({
		name: "decompress-porn-img-package",
		defaults: DEFAULT_CONFIG,
	});
	return { ...DEFAULT_CONFIG, ...(config ?? {}) };
}
