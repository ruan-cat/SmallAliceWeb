/**
 * @ruan-cat/decompress-porn-img-package
 * 解压图片压缩包工具
 *
 * 支持两种处理模式：
 * 1. 全量模式：处理目录下所有符合规则的压缩包
 * 2. 范围模式：仅处理指定编号范围内的文件夹/压缩包，智能识别处理阶段
 */

/** 类型导出 */
export type { ToolConfig, FolderRange, VolumeSet, ProcessTarget } from "./types.js";
export { ProcessPhase } from "./types.js";

/** 配置相关导出 */
export type { ResolvedConfig } from "./config.js";
export { loadToolConfig, DEFAULT_CONFIG } from "./config.js";

/** defineConfig 辅助函数 */
export { defineConfig } from "./define-config.js";

/** 文件工具导出 */
export { deleteDirtyRecursive, moveFilesToRoot, isArchiveFile } from "./file-utils.js";

/** 压缩包处理导出 */
export { isArchiveCandidate, selectArchives } from "./archive.js";

/** 阶段检测导出 */
export { detectPhase, detectAllTargets, generateNumberRange } from "./phase-detector.js";

/** 文件夹整理导出 */
export { organizeFolder, findDeepestContentDir } from "./folder-organizer.js";

/** 主处理器导出 */
export { runProcess } from "./processor.js";
